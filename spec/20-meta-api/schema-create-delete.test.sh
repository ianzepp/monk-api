#!/bin/bash
set -e

# Schema Create and Delete Test - Simple lifecycle verification
# Tests: create account schema → delete account schema
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

echo "=== Schema Create and Delete Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Test 1: Create account schema
print_step "Creating account schema"
if cat "$(dirname "$0")/../fixtures/schema/account.yaml" | monk meta create schema >/dev/null 2>&1; then
    print_success "Account schema created"
else
    print_error "Account schema creation failed"
    exit 1
fi

# Test 2: Delete account schema
print_step "Deleting account schema"
if monk meta delete schema account >/dev/null 2>&1; then
    print_success "Account schema deleted"
else
    print_error "Account schema deletion failed"
    exit 1
fi

# Test 3: Verify schema is no longer accessible
print_step "Verifying schema deletion"
if monk meta select schema account >/dev/null 2>&1; then
    print_error "Account schema still accessible after deletion"
    exit 1
else
    print_success "Account schema properly deleted (no longer accessible)"
fi

echo
print_success "🎉 Schema create and delete test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user