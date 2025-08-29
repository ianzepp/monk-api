#!/bin/bash
set -e

# Validation Constraints Test - JSON Schema validation rule testing
# Tests: invalid data rejection → boundary values → edge cases

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

# Generate unique schema name to avoid conflicts
RANDOM_SUFFIX=$(date +%s | tail -c 4)
SCHEMA_NAME="validation${RANDOM_SUFFIX}"

# Comprehensive validation schema
VALIDATION_SCHEMA="title: Validation${RANDOM_SUFFIX}
description: Schema with comprehensive validation rules for testing
type: object
properties:
  name:
    type: string
    minLength: 3
    maxLength: 200
    description: Product name
  description:
    type: string
    minLength: 10
    maxLength: 1000
    description: Product description  
  price:
    type: integer
    minimum: 1
    maximum: 99999999
    description: Price in cents
  category:
    type: string
    enum: [electronics, books, clothing, sports]
    description: Product category
  sku:
    type: string
    pattern: '^[A-Z0-9-]{5,20}$'
    description: Stock keeping unit (uppercase alphanumeric with hyphens)
  weight_kg:
    type: number
    minimum: 0.001
    maximum: 999.999
    description: Weight in kilograms
  rating:
    type: integer
    minimum: 1
    maximum: 5
    description: Customer rating
  barcode:
    type: string
    minLength: 8
    maxLength: 20
    description: Product barcode
required:
  - name
  - description
  - price
  - category
  - sku"

# Invalid test records (should be rejected)
INVALID_SHORT_FIELDS='{"name":"AB","description":"Too short","price":1000,"category":"electronics","sku":"SHORT"}'
INVALID_NEGATIVE_PRICE='{"name":"Valid Name","description":"Valid description here","price":-100,"category":"electronics","sku":"VALID-SKU-001"}'
INVALID_SKU_PATTERN='{"name":"Valid Name","description":"Valid description here","price":1000,"category":"electronics","sku":"invalid-lowercase"}'
INVALID_ENUM_VALUE='{"name":"Valid Name","description":"Valid description here","price":1000,"category":"invalid_category","sku":"VALID-SKU-001"}'
INVALID_MISSING_REQUIRED='{"name":"Valid Name","description":"Valid description here","price":1000}'

# Boundary test records (should be accepted)
MIN_VALID_RECORD='{"name":"Min","description":"Minimum len","price":1,"category":"electronics","sku":"MIN01","weight_kg":0.001,"rating":1,"barcode":"12345678"}'
MAX_VALID_RECORD='{"name":"Maximum Length Product Name That Approaches The Two Hundred Character Limit For Product Names In Our Enhanced Schema Definition Which Tests The Upper Boundaries","description":"This is a very long product description that tests the maximum length constraint of one thousand characters. It contains detailed information about the product features, specifications, benefits, and usage instructions. The description includes technical details, compatibility information, warranty terms, and other important product information that customers need to make informed purchasing decisions. This comprehensive description ensures we are testing the upper limit of the description field constraint while providing meaningful content that would be realistic in a production environment.","price":99999999,"category":"electronics","sku":"MAX-PRODUCT-SKU-001","weight_kg":999.999,"rating":5,"barcode":"12345678901234567890"}'

# Load authentication helper
source "$(dirname "$0")/../helpers/auth-helper.sh"

echo "=== Validation Constraints Test ==="
echo "Testing schema: $SCHEMA_NAME"
echo

# Step 0: Authenticate and verify connectivity
if ! authenticate_and_ping "validation"; then
    print_error "Initial authentication and connectivity check failed"
    exit 1
fi
echo

# Step 1: Create validation schema
print_step "Creating validation schema"
SCHEMA_RESULT=$(echo "$VALIDATION_SCHEMA" | monk meta create schema)
if [ -n "$SCHEMA_RESULT" ]; then
    SCHEMA_ID=$(echo "$SCHEMA_RESULT" | jq -r '.id')
    TABLE_NAME=$(echo "$SCHEMA_RESULT" | jq -r '.table_name')
    print_success "Schema created: $SCHEMA_NAME (table: $TABLE_NAME)"
else
    ERROR_MSG=$(echo "$SCHEMA_RESULT" | jq -r '.error // "Unknown error"' 2>/dev/null || echo "Unknown error")
    print_error "Schema creation failed: $ERROR_MSG"
fi
echo

# Step 2: Test invalid data rejection
print_step "Testing validation constraints with invalid data"

# Test 1: Short fields
echo "  Testing: name too short (2 chars), description too short, SKU too short"
if echo "$INVALID_SHORT_FIELDS" | monk data create "$SCHEMA_NAME" >/dev/null 2>&1; then
    print_error "    ✗ Should have rejected short fields"
else
    print_success "    ✓ Validation correctly rejected short fields"
fi

# Test 2: Negative price
echo "  Testing: negative price"
if echo "$INVALID_NEGATIVE_PRICE" | monk data create "$SCHEMA_NAME" >/dev/null 2>&1; then
    print_error "    ✗ Should have rejected negative price"
else
    print_success "    ✓ Validation correctly rejected negative price"
fi

# Test 3: Invalid SKU pattern (lowercase)
echo "  Testing: invalid SKU pattern (lowercase)"
if echo "$INVALID_SKU_PATTERN" | monk data create "$SCHEMA_NAME" >/dev/null 2>&1; then
    print_error "    ✗ Should have rejected invalid SKU pattern"
else
    print_success "    ✓ Validation correctly rejected invalid SKU pattern"
fi

# Test 4: Invalid enum value
echo "  Testing: invalid category enum value"
if echo "$INVALID_ENUM_VALUE" | monk data create "$SCHEMA_NAME" >/dev/null 2>&1; then
    print_error "    ✗ Should have rejected invalid enum value"
else
    print_success "    ✓ Validation correctly rejected invalid enum value"
fi

# Test 5: Missing required fields
echo "  Testing: missing required fields (category, sku)"
if echo "$INVALID_MISSING_REQUIRED" | monk data create "$SCHEMA_NAME" >/dev/null 2>&1; then
    print_error "    ✗ Should have rejected missing required fields"
else
    print_success "    ✓ Validation correctly rejected missing required fields"
fi
echo

# Step 3: Test boundary values (should succeed)
print_step "Testing boundary values and edge cases"

# Test minimum valid values
echo "  Testing: minimum valid values"
if MIN_RESULT=$(echo "$MIN_VALID_RECORD" | monk data create "$SCHEMA_NAME"); then
    MIN_ID=$(echo "$MIN_RESULT" | jq -r '.id')
    print_success "    ✓ Minimum values accepted (ID: $MIN_ID)"
else
    print_error "    ✗ Minimum values should be valid"
fi

# Test maximum valid values
echo "  Testing: maximum valid values"
if MAX_RESULT=$(echo "$MAX_VALID_RECORD" | monk data create "$SCHEMA_NAME"); then
    MAX_ID=$(echo "$MAX_RESULT" | jq -r '.id')
    print_success "    ✓ Maximum values accepted (ID: $MAX_ID)"
else
    print_error "    ✗ Maximum values should be valid"
fi
echo

# Step 4: Verify final record count
print_step "Verifying final record count"
FINAL_LIST_RESULT=$(monk data select "$SCHEMA_NAME")
FINAL_COUNT=$(echo "$FINAL_LIST_RESULT" | jq 'length')
if [ "$FINAL_COUNT" -eq 2 ]; then
    print_success "Correct record count: $FINAL_COUNT valid records created"
else
    print_error "Incorrect record count (expected 2, got $FINAL_COUNT)"
fi
echo

# Step 5: Cleanup - delete the test schema and records
print_step "Cleaning up test data"
if monk meta delete schema "$SCHEMA_NAME"; then
    print_success "Test schema and records cleaned up successfully"
else
    print_error "Failed to clean up test schema"
fi
echo

print_success "🎉 Validation constraints test completed successfully!"

# Cleanup
cleanup_auth

echo
echo "Test Summary:"
echo "  Schema Name: $SCHEMA_NAME"
echo "  Schema ID: $SCHEMA_ID"
echo "  Table Name: $TABLE_NAME"
echo "  Invalid Records Rejected: 5"
echo "  Valid Boundary Records Created: 2"
echo "  Validation Rules Tested: minLength, maxLength, minimum, maximum, pattern, enum, required"