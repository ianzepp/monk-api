#!/bin/bash
set -e

# Basic Authentication Test - Root User Login/Logout
# Tests core authentication functionality with the default root user
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

# Source auth helper for authentication utilities
source "$(dirname "$0")/../auth-helper.sh"

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
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

echo "=== Basic Authentication Test ==="
echo "Testing core authentication functionality with root user"
echo

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
echo

# Test 1: Basic Authentication
print_step "Test 1: Authenticate as root user"
if auth_as_user "root"; then
    print_success "Root authentication successful"
else
    print_error "Root authentication failed"
    exit 1
fi

# Test 2: Verify Authentication Status  
print_step "Test 2: Check authentication status"
if monk auth status >/dev/null 2>&1; then
    print_success "Authentication status verified"
else
    print_error "Authentication status check failed"
    exit 1
fi

# Test 3: Test Authenticated Ping
print_step "Test 3: Test authenticated ping"
if monk ping >/dev/null 2>&1; then
    print_success "Authenticated ping successful"
else
    print_error "Authenticated ping failed"
    exit 1
fi

# Test 4: Verify Token Information
print_step "Test 4: Check JWT token information"
if monk auth info >/dev/null 2>&1; then
    print_success "JWT token information accessible"
else
    print_error "JWT token information failed"
    exit 1
fi

# Test 5: Logout
print_step "Test 5: Logout current user"
if logout_user; then
    print_success "User logout successful"
else
    print_error "User logout failed"
    exit 1
fi

# Test 6: Verify Logout (auth status should fail)
print_step "Test 6: Verify logout completed"
if monk auth status >/dev/null 2>&1; then
    print_error "Still authenticated after logout"
    exit 1
else
    print_success "Logout verified - no longer authenticated"
fi

echo
print_success "All basic authentication tests passed!"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"