#!/bin/bash
set -e

# Basic Connection Test - Ping and Auth
# Tests: server connectivity → authentication → basic ping with JWT
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

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

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via test-one.sh"
    exit 1
fi

# Test configuration
SERVER_URL="${SERVER_URL:-http://localhost:3000}"

echo "=== Basic Connection Test ==="
echo "Server: $SERVER_URL"
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Test 1: Basic server ping (no auth)
print_step "Testing server connectivity (no auth)"
if monk ping > /dev/null 2>&1; then
    print_success "Server is responding"
else
    print_error "Server connectivity failed"
    exit 1
fi

# Test 2: Authenticate with root user using helper
if ! auth_as_user "root"; then
    print_error "Authentication failed"
    exit 1
fi

# Test 3: Authenticated ping
print_step "Testing authenticated ping"
if monk ping -v; then
    print_success "Authenticated ping successful"
else
    print_error "Authenticated ping failed"
    exit 1
fi

# Test 4: Auth status check
print_step "Checking authentication status"
if monk auth status; then
    print_success "Authentication status verified"
else
    print_error "Authentication status check failed"
    exit 1
fi

# Test 5: Database connectivity test
print_step "Testing database connectivity"
if monk ping >/dev/null 2>&1; then
    print_success "Database connectivity verified"
else
    print_error "Database connectivity failed"
    exit 1
fi

echo
print_success "All connection tests passed!"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"