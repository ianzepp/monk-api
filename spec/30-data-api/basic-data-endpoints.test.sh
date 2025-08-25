#!/bin/bash
set -e

# Basic Data API Test - Endpoint availability without creating schemas
# Tests: data endpoints with non-existent schemas → proper error handling
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"

# Source auth helper for authentication utilities
source "$(dirname "$0")/../helpers/auth-helper.sh"

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

echo "=== Basic Data API Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

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

# Logout (cleanup handled by test-one.sh)
logout_user