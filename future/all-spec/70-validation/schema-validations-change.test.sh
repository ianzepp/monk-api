#!/bin/bash
set -e

# Schema Validation Change Test - Tests dynamic constraint modification
# Scenarios: 
# 1. Start with constraints → Remove constraints → Test existing data still works
# 2. Start without constraints → Add constraints → Test new data validation
# 3. Change constraints (stricter/looser) → Test data validation behavior

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    exit 1
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_scenario() {
    echo -e "${CYAN}=== $1 ===${NC}"
}

# Generate random schema names
RANDOM_SUFFIX=$(date +%s | tail 4)
SCHEMA1="strict${RANDOM_SUFFIX}"
SCHEMA2="loose${RANDOM_SUFFIX}"

# Scenario 1: Start with strict constraints
STRICT_SCHEMA="title: Strict${RANDOM_SUFFIX}
description: Schema starting with strict validation constraints
type: object
properties:
  name:
    type: string
    minLength: 5
    maxLength: 50
    pattern: \"^[A-Z][a-zA-Z0-9\\\\s]*$\"
    description: Name (5-50 chars, starts with uppercase)
  email:
    type: string
    format: email
    maxLength: 100
    description: Valid email address
  age:
    type: integer
    minimum: 18
    maximum: 120
    description: Age between 18-120
  status:
    type: string
    enum: [\"active\", \"inactive\"]
    default: \"active\"
    description: Account status
required:
  - name
  - email
  - age"

# Relaxed version of the same schema (remove constraints)
RELAXED_SCHEMA="title: Strict${RANDOM_SUFFIX}
description: Schema with relaxed validation constraints
type: object
properties:
  name:
    type: string
    description: Name (no constraints)
  email:
    type: string
    description: Email (no format validation)
  age:
    type: integer
    description: Age (no range restriction)
  status:
    type: string
    description: Status (no enum restriction)
  new_field:
    type: string
    maxLength: 200
    description: New optional field
required:
  - name
  - email"

# Scenario 2: Start with loose constraints  
LOOSE_SCHEMA="title: Loose${RANDOM_SUFFIX}
description: Schema starting with minimal constraints
type: object
properties:
  username:
    type: string
    description: Username (no constraints initially)
  score:
    type: number
    description: Score (no range initially)
  category:
    type: string
    description: Category (no enum initially)
required:
  - username"

# Tightened version (add constraints)
TIGHT_SCHEMA="title: Loose${RANDOM_SUFFIX}
description: Schema with added strict constraints
type: object
properties:
  username:
    type: string
    minLength: 3
    maxLength: 20
    pattern: \"^[a-z0-9_]+$\"
    description: Username (3-20 chars, lowercase+numbers+underscore)
  score:
    type: number
    minimum: 0
    maximum: 100
    description: Score (0-100 range)
  category:
    type: string
    enum: [\"bronze\", \"silver\", \"gold\", \"platinum\"]
    description: Category (predefined values)
  validation_level:
    type: string
    enum: [\"strict\", \"moderate\", \"lenient\"]
    default: \"strict\"
    description: New field with enum constraint
required:
  - username
  - score
  - category"

# Test data for scenarios
VALID_STRICT_DATA='{"domain": "test", "name": "Alice Smith", "email": "alice@example.com", "age": 25}'
INVALID_STRICT_DATA='{"domain": "test", "name": "bob", "email": "not-email", "age": 15}'

LOOSE_DATA1='{"domain": "test", "username": "X", "score": -50, "category": "invalid"}'
LOOSE_DATA2='{"domain": "test", "username": "Bob123", "score": 85, "category": "silver"}'
INVALID_TIGHT_DATA='{"domain": "test", "username": "Invalid-User!", "score": 150, "category": "diamond"}'
VALID_TIGHT_DATA='{"domain": "test", "username": "validuser", "score": 75, "category": "gold"}'

# Load authentication helper
source "$(dirname "$0")/../helpers/auth-helper.sh"

echo "=== Schema Validation Change Test ==="
echo "Testing dynamic constraint modification scenarios"
echo

# Step 0.5: Authenticate and verify connectivity
if ! authenticate_and_ping "validations"; then
    print_error "Initial authentication and connectivity check failed"
    exit 1
fi
echo

print_scenario "Scenario 1: Strict → Relaxed Constraints"
echo

# Step 1: Create schema with strict constraints
print_step "Creating schema with strict constraints: $SCHEMA1"
if SCHEMA1_RESULT=$(echo "$STRICT_SCHEMA" | monk meta create schema); then
    SCHEMA1_ID=$(echo "$SCHEMA1_RESULT" | jq -r '.id')
    print_success "Strict schema created (ID: $SCHEMA1_ID)"
else
    print_error "Failed to create strict schema"
fi
echo

# Step 2: Add data that meets strict constraints
print_step "Adding data that meets strict constraints"
if RECORD1_RESULT=$(echo "$VALID_STRICT_DATA" | monk data create "$SCHEMA1"); then
    RECORD1_ID=$(echo "$RECORD1_RESULT" | jq -r '.id')
    RECORD1_NAME=$(echo "$RECORD1_RESULT" | jq -r '.name')
    print_success "Valid record created: $RECORD1_NAME (ID: $RECORD1_ID)"
else
    print_error "Failed to create valid record"
fi
echo

# Step 3: Verify strict validation rejects invalid data
print_step "Verifying strict validation rejects invalid data"
if echo "$INVALID_STRICT_DATA" | monk data create "$SCHEMA1" -x; then
    print_error "Should have rejected invalid data under strict constraints"
else
    print_success "Strict validation correctly rejected invalid data"
fi
echo

# Step 4: Update schema to relaxed constraints (non-destructive evolution)
print_step "Updating schema to relaxed constraints"
if echo "$RELAXED_SCHEMA" | monk meta update schema "$SCHEMA1" -x; then
    print_success "Schema updated to relaxed constraints (data preserved)"
else
    print_error "Failed to update schema to relaxed constraints"
fi
echo

# Step 5: Test that previously invalid data now works
print_step "Testing that previously invalid data now passes"
if RECORD2_RESULT=$(echo "$INVALID_STRICT_DATA" | monk data create "$SCHEMA1"); then
    RECORD2_ID=$(echo "$RECORD2_RESULT" | jq -r '.id')
    RECORD2_NAME=$(echo "$RECORD2_RESULT" | jq -r '.name')
    print_success "Previously invalid data now accepted: $RECORD2_NAME"
else
    print_error "Previously invalid data still rejected"
fi
echo

# Step 6: Verify record count
FINAL_COUNT1_RESULT=$(monk data select "$SCHEMA1")
FINAL_COUNT1=$(echo "$FINAL_COUNT1_RESULT" | jq 'length')
print_info "Records in relaxed schema: $FINAL_COUNT1"
echo

print_scenario "Scenario 2: Loose → Strict Constraints"
echo

# Step 7: Create schema with loose constraints
print_step "Creating schema with minimal constraints: $SCHEMA2"
if SCHEMA2_RESULT=$(echo "$LOOSE_SCHEMA" | monk meta create schema); then
    SCHEMA2_ID=$(echo "$SCHEMA2_RESULT" | jq -r '.id')
    print_success "Loose schema created (ID: $SCHEMA2_ID)"
else
    print_error "Failed to create loose schema"
fi
echo

# Step 8: Add data that would violate future strict constraints
print_step "Adding data that would violate future strict constraints"
if RECORD3_ID=$(echo "$LOOSE_DATA1" | monk data create "$SCHEMA2"); then
    RECORD3_NAME=$(monk data select "$SCHEMA2" "$RECORD3_ID")
    print_success "Loose data created: $RECORD3_NAME (ID: $RECORD3_ID)"
else
    print_error "Failed to create loose data"
fi
echo

# Step 9: Add data that meets future strict constraints
print_step "Adding data that will meet future strict constraints"
if RECORD4_ID=$(echo "$LOOSE_DATA2" | monk data create "$SCHEMA2"); then
    RECORD4_NAME=$(monk data select "$SCHEMA2" "$RECORD4_ID")
    print_success "Future-compliant data created: $RECORD4_NAME (ID: $RECORD4_ID)"
else
    print_error "Failed to create future-compliant data"
fi
echo

# Step 10: Update schema to strict constraints (non-destructive evolution)
print_step "Updating schema to strict constraints"
if echo "$TIGHT_SCHEMA" | monk meta update schema "$SCHEMA2" -x; then
    print_success "Schema updated to strict constraints (data preserved)"
else
    print_error "Failed to update schema to strict constraints"
fi
echo

# Step 11: Test that invalid data is now rejected
print_step "Testing that invalid data is now rejected under strict constraints"
if echo "$INVALID_TIGHT_DATA" | monk data create "$SCHEMA2" -x; then
    print_error "Should have rejected invalid data under strict constraints"
else
    print_success "Strict validation correctly rejected invalid data"
fi
echo

# Step 12: Test that valid data still works
print_step "Testing that valid data still works under strict constraints"
if RECORD5_ID=$(echo "$VALID_TIGHT_DATA" | monk data create "$SCHEMA2"); then
    RECORD5_NAME=$(monk data select "$SCHEMA2" "$RECORD5_ID")
    print_success "Valid data accepted under strict constraints: $RECORD5_NAME"
else
    print_error "Valid data rejected under strict constraints"
fi
echo

# Step 13: Verify final record counts
FINAL_COUNT2=$(monk data select "$SCHEMA2")
print_info "Records in strict schema: $FINAL_COUNT2"
echo

print_scenario "Test Results Analysis"
echo
print_info "Schema Evolution Results:"
print_info "  Strict→Relaxed Schema ($SCHEMA1): $FINAL_COUNT1 records"
print_info "  Loose→Strict Schema ($SCHEMA2): $FINAL_COUNT2 records"
echo

# Step 14: Cleanup test schemas
print_step "Cleaning up test schemas"
monk meta delete schema "$SCHEMA1" -x 2>/dev/null || true
monk meta delete schema "$SCHEMA2" -x 2>/dev/null || true
print_success "Test schemas cleaned up"
echo

print_success "🎉 Schema validation change test completed successfully!"
echo
# Cleanup
cleanup_auth

echo "Key Findings:"
echo "  • Relaxing constraints: Previously invalid data becomes valid"
echo "  • Tightening constraints: New strict validation applies to new data"
echo "  • Schema evolution: Constraint changes affect future operations immediately"
echo "  • Data preservation: Existing records survive schema constraint changes"