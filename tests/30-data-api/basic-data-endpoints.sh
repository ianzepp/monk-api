#!/bin/bash
set -e

# Basic Data API Test - Endpoint availability without creating schemas
# Tests: data endpoints with non-existent schemas → proper error handling

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Source auth helper for authentication
source "$(dirname "$0")/../auth-helper.sh"

echo "=== Basic Data API Test ==="
echo

# Authenticate first
authenticate_and_ping "data_basic"

# Test 1: List data from non-existent schema (should fail gracefully)
print_step "Testing data list on non-existent schema"
if monk data list nonexistent_schema_12345 > /dev/null 2>&1; then
    print_error "Non-existent schema data list returned success (should fail)"
    exit 1
else
    print_success "Non-existent schema data list correctly returned error"
fi

# Test 2: Get specific record from non-existent schema
print_step "Testing data get on non-existent schema"
if monk data get nonexistent_schema_12345 fake-uuid > /dev/null 2>&1; then
    print_error "Non-existent schema data get returned success (should fail)"
    exit 1
else
    print_success "Non-existent schema data get correctly returned error"
fi

# Test 3: Create data in non-existent schema
print_step "Testing data create on non-existent schema"
if echo '{"test":"value"}' | monk data create nonexistent_schema_12345 > /dev/null 2>&1; then
    print_error "Non-existent schema data create returned success (should fail)"
    exit 1
else
    print_success "Non-existent schema data create correctly returned error"
fi

# Test 4: Delete data from non-existent schema
print_step "Testing data delete on non-existent schema"
if monk data delete nonexistent_schema_12345 fake-uuid > /dev/null 2>&1; then
    print_error "Non-existent schema data delete returned success (should fail)"
    exit 1
else
    print_success "Non-existent schema data delete correctly returned error"
fi

echo
print_success "All basic data API tests passed!"