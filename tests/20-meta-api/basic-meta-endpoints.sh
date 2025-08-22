#!/bin/bash
set -e

# Basic Meta API Test - Endpoint availability and basic operations
# Tests: schema list → schema get (non-existent) → basic error handling
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

# Source auth helper for authentication utilities
source "$(dirname "$0")/../auth-helper.sh"

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

echo "=== Basic Meta API Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

# Test 1: List schemas (should work even if empty)
print_step "Testing schema list endpoint"
if monk meta list schema > /dev/null 2>&1; then
    print_success "Schema list endpoint available"
else
    print_error "Schema list endpoint failed"
    exit 1
fi

# Test 2: Get count of schemas
print_step "Testing schema count"
if schema_count=$(monk meta list schema -c); then
    print_success "Schema count: $schema_count"
else
    print_error "Schema count failed"
    exit 1
fi

# Test 3: Test non-existent schema get (should fail gracefully)
print_step "Testing non-existent schema get"
if monk meta get schema nonexistent_schema_12345 > /dev/null 2>&1; then
    print_error "Non-existent schema returned success (should fail)"
    exit 1
else
    print_success "Non-existent schema correctly returned error"
fi

# Test 4: List schema names only
print_step "Testing schema name extraction"
if schema_names=$(monk meta list schema -e name 2>/dev/null); then
    print_success "Schema name extraction works"
    if [ -n "$schema_names" ]; then
        echo "  Found schemas: $schema_names"
    else
        echo "  No schemas found (empty database)"
    fi
else
    print_error "Schema name extraction failed"
    exit 1
fi

echo
print_success "All basic meta API tests passed!"