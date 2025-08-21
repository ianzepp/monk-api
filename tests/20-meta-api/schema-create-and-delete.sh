#!/bin/bash
set -e

# Schema Create and Delete Test - Validates meta API endpoints
# Uses randomized schema names to avoid conflicts

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
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

# Generate random schema name to avoid conflicts
RANDOM_SUFFIX=$(date +%s | tail -c 4)
SCHEMA_NAME="testschema${RANDOM_SUFFIX}"

# Test schema YAML with randomized title
TEST_SCHEMA="title: TestSchema${RANDOM_SUFFIX}
description: Temporary test schema for validation
type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 100
    description: Test entity name
  value:
    type: string
    maxLength: 255
    description: Test entity value
  count:
    type: integer
    minimum: 0
    default: 1
    description: Test counter
  is_active:
    type: boolean
    default: true
    description: Active status flag
required:
  - name"

# Load authentication helper
source "$(dirname "$0")/../auth-helper.sh"

echo "=== Schema Create and Delete Test ==="
echo "Testing with schema name: $SCHEMA_NAME"
echo

# Step 0.5: Authenticate and verify connectivity
if ! authenticate_and_ping "schema"; then
    print_error "Initial authentication and connectivity check failed"
    exit 1
fi
echo

# Step 1: Check initial schema count
print_step "Checking initial schema count"
INITIAL_COUNT=$(monk meta list schema | jq 'length')
print_info "Initial schema count: $INITIAL_COUNT"
echo

# Step 2: Create new schema
print_step "Creating schema: $SCHEMA_NAME"
if SCHEMA_RESULT=$(echo "$TEST_SCHEMA" | monk meta create schema); then
    SCHEMA_ID=$(echo "$SCHEMA_RESULT" | jq -r '.id')
    TABLE_NAME=$(monk meta get schema "$SCHEMA_NAME" | jq -r '.table_name')
    print_success "Schema created successfully"
    print_info "  ID: $SCHEMA_ID"
    print_info "  Table: $TABLE_NAME"
else
    print_error "Schema creation failed"
fi
echo

# Step 3: Verify schema appears in registry
print_step "Verifying schema registration"
UPDATED_COUNT=$(monk meta list schema | jq 'length')
if monk meta list schema | jq -r '.[].name' | grep -wq "$SCHEMA_NAME"; then
    print_success "Schema '$SCHEMA_NAME' found in registry"
    if [ "$UPDATED_COUNT" -eq $((INITIAL_COUNT + 1)) ]; then
        print_success "Schema count increased correctly ($INITIAL_COUNT → $UPDATED_COUNT)"
    else
        print_error "Schema count mismatch (expected $((INITIAL_COUNT + 1)), got $UPDATED_COUNT)"
    fi
else
    print_error "Schema '$SCHEMA_NAME' not found in registry"
fi
echo

# Step 4: Get specific schema details
print_step "Retrieving schema details"
if RETRIEVED_STATUS=$(monk meta get schema "$SCHEMA_NAME" -f status); then
    print_success "Retrieved schema status: $RETRIEVED_STATUS"
else
    print_error "Failed to retrieve schema details"
fi
echo

# Step 5: Delete the schema
print_step "Deleting schema: $SCHEMA_NAME"
if monk meta delete schema "$SCHEMA_NAME" -x; then
    print_success "Schema deleted successfully"
else
    print_error "Schema deletion failed"
fi
echo

# Step 6: Verify schema is removed
print_step "Verifying schema removal"
FINAL_COUNT=$(monk meta list schema | jq 'length')
if monk meta list schema | jq -r '.[].name' | grep -wq "$SCHEMA_NAME"; then
    print_error "Schema '$SCHEMA_NAME' still exists after deletion"
else
    print_success "Schema '$SCHEMA_NAME' successfully removed"
    if [ "$FINAL_COUNT" -eq "$INITIAL_COUNT" ]; then
        print_success "Schema count restored correctly ($UPDATED_COUNT → $FINAL_COUNT)"
    else
        print_error "Schema count mismatch (expected $INITIAL_COUNT, got $FINAL_COUNT)"
    fi
fi
echo

print_success "🎉 Schema create/delete test completed successfully!"

# Cleanup
cleanup_auth

echo
echo "Test Summary:"
echo "  Schema Name: $SCHEMA_NAME"
echo "  Schema ID: $SCHEMA_ID"
echo "  Table Name: $TABLE_NAME"
echo "  Initial Count: $INITIAL_COUNT"
echo "  Final Count: $FINAL_COUNT"