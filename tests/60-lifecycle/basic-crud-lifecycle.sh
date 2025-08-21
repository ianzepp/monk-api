#!/bin/bash
set -e

# Basic CRUD Lifecycle Test - Core database operations without validation complexity
# Tests: schema creation → record create → read → update → delete → cleanup

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
SCHEMA_NAME="product${RANDOM_SUFFIX}"

# Simple product schema for CRUD testing
PRODUCT_SCHEMA="title: Product${RANDOM_SUFFIX}
description: Simple product schema for CRUD lifecycle testing
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
    description: Price in cents
  category:
    type: string
    enum: [electronics, books, clothing, sports]
    description: Product category
  sku:
    type: string
    pattern: '^[A-Z0-9-]{5,20}$'
    description: Stock keeping unit
required:
  - name
  - description
  - price
  - category
  - sku"

# Test records for CRUD operations
RECORD1='{"name":"Laptop Pro","description":"High-performance laptop for developers","price":199999,"category":"electronics","sku":"LAP-PRO-001"}'
RECORD2='{"name":"Running Shoes","description":"Comfortable running shoes with advanced cushioning","price":12999,"category":"sports","sku":"SHOE-RUN-001"}'
RECORD3='{"name":"Programming Book","description":"Complete guide to TypeScript development","price":4999,"category":"books","sku":"BOOK-TS-001"}'

# Load authentication helper
source "$(dirname "$0")/../auth-helper.sh"

echo "=== Basic CRUD Lifecycle Test ==="
echo "Testing schema: $SCHEMA_NAME"
echo

# Step 0: Authenticate and verify connectivity
if ! authenticate_and_ping "crud_lifecycle"; then
    print_error "Initial authentication and connectivity check failed"
    exit 1
fi
echo

# Step 1: Create schema
print_step "Creating product schema"
SCHEMA_RESULT=$(echo "$PRODUCT_SCHEMA" | monk meta create schema)
if [ -n "$SCHEMA_RESULT" ]; then
    SCHEMA_ID=$(echo "$SCHEMA_RESULT" | jq -r '.id')
    TABLE_NAME=$(echo "$SCHEMA_RESULT" | jq -r '.table_name')
    print_success "Schema created: $SCHEMA_NAME (table: $TABLE_NAME)"
else
    ERROR_MSG=$(echo "$SCHEMA_RESULT" | jq -r '.error // "Unknown error"' 2>/dev/null || echo "Unknown error")
    print_error "Schema creation failed: $ERROR_MSG"
fi
echo

# Step 2: Create first record
print_step "Creating first record (Laptop)"
if RECORD1_RESULT=$(echo "$RECORD1" | monk data create "$SCHEMA_NAME"); then
    RECORD1_ID=$(echo "$RECORD1_RESULT" | jq -r '.id')
    RECORD1_NAME=$(echo "$RECORD1_RESULT" | jq -r '.name')
    print_success "Record created: $RECORD1_NAME (ID: $RECORD1_ID)"
else
    print_error "Record creation failed"
fi
echo

# Step 3: Create second record
print_step "Creating second record (Shoes)"
if RECORD2_RESULT=$(echo "$RECORD2" | monk data create "$SCHEMA_NAME"); then
    RECORD2_ID=$(echo "$RECORD2_RESULT" | jq -r '.id')
    RECORD2_NAME=$(echo "$RECORD2_RESULT" | jq -r '.name')
    print_success "Record created: $RECORD2_NAME (ID: $RECORD2_ID)"
else
    print_error "Record creation failed"
fi
echo

# Step 4: List all records
print_step "Listing all records"
RECORD_LIST_RESULT=$(monk data list "$SCHEMA_NAME")
RECORD_COUNT=$(echo "$RECORD_LIST_RESULT" | jq 'length')
print_success "Found $RECORD_COUNT records in $SCHEMA_NAME table"
echo

# Step 5: Get specific record
print_step "Retrieving specific record"
if RECORD1_GET_RESULT=$(monk data get "$SCHEMA_NAME" "$RECORD1_ID"); then
    GET_NAME=$(echo "$RECORD1_GET_RESULT" | jq -r '.name')
    GET_PRICE=$(echo "$RECORD1_GET_RESULT" | jq -r '.price')
    print_success "Retrieved: $GET_NAME (price: $GET_PRICE)"
else
    print_error "Failed to retrieve record"
fi
echo

# Step 6: Update existing record
print_step "Updating first record (price change)"
UPDATE_DATA='{"price": 179999, "description": "High-performance laptop - SALE!"}'
if echo "$UPDATE_DATA" | monk data update "$SCHEMA_NAME" "$RECORD1_ID"; then
    print_success "Record updated successfully"
else
    print_error "Record update failed"
fi
echo

# Step 7: Create third record
print_step "Creating third record (Book)"
if RECORD3_RESULT=$(echo "$RECORD3" | monk data create "$SCHEMA_NAME"); then
    RECORD3_ID=$(echo "$RECORD3_RESULT" | jq -r '.id')
    RECORD3_NAME=$(echo "$RECORD3_RESULT" | jq -r '.name')
    print_success "Record created: $RECORD3_NAME (ID: $RECORD3_ID)"
else
    print_error "Record creation failed"
fi
echo

# Step 8: Verify final record count
print_step "Verifying final record count"
FINAL_LIST_RESULT=$(monk data list "$SCHEMA_NAME")
FINAL_COUNT=$(echo "$FINAL_LIST_RESULT" | jq 'length')
if [ "$FINAL_COUNT" -eq 3 ]; then
    print_success "Correct record count: $FINAL_COUNT records"
else
    print_error "Incorrect record count (expected 3, got $FINAL_COUNT)"
fi
echo

# Step 9: Delete one record
print_step "Deleting second record"
if monk data delete "$SCHEMA_NAME" "$RECORD2_ID"; then
    print_success "Record deleted successfully"
else
    print_error "Record deletion failed"
fi
echo

# Step 10: Verify deletion
print_step "Verifying record deletion"
AFTER_DELETE_RESULT=$(monk data list "$SCHEMA_NAME")
AFTER_DELETE_COUNT=$(echo "$AFTER_DELETE_RESULT" | jq 'length')
if [ "$AFTER_DELETE_COUNT" -eq 2 ]; then
    print_success "Correct record count after deletion: $AFTER_DELETE_COUNT records"
else
    print_error "Incorrect record count after deletion (expected 2, got $AFTER_DELETE_COUNT)"
fi
echo

# Step 11: Cleanup - delete the test schema
print_step "Cleaning up test schema"
if monk meta delete schema "$SCHEMA_NAME"; then
    print_success "Test schema cleaned up successfully"
else
    print_error "Failed to clean up test schema"
fi
echo

print_success "🎉 Basic CRUD lifecycle test completed successfully!"

# Cleanup
cleanup_auth

echo
echo "Test Summary:"
echo "  Schema Name: $SCHEMA_NAME"
echo "  Schema ID: $SCHEMA_ID"
echo "  Table Name: $TABLE_NAME"
echo "  Records Created: 3"
echo "  Records Updated: 1" 
echo "  Records Deleted: 1"
echo "  Final Count: 2"