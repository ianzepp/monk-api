#!/bin/bash
set -e

# Basic Connection Test - Ping and Auth
# Tests: server connectivity → tenant creation → authentication → basic ping with JWT

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

# Source auth helper for tenant management
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

# Test configuration
SERVER_URL="${SERVER_URL:-http://localhost:3000}"

echo "=== Basic Connection Test ==="
echo "Server: $SERVER_URL"
echo

# Test 1: Basic server ping (no auth)
print_step "Testing server connectivity (no auth)"
if monk ping > /dev/null 2>&1; then
    print_success "Server is responding"
else
    print_error "Server connectivity failed"
    exit 1
fi

# Test 2: Initialize test tenant and authenticate (one time for script)
if ! initialize_test_tenant; then
    print_error "Failed to initialize test tenant"
    exit 1
fi

echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Test 3: Authenticated ping
print_step "Testing authenticated ping"
if monk ping -v; then
    print_success "Authenticated ping successful"
else
    print_error "Authenticated ping failed"
    cleanup_auth
    exit 1
fi

# Test 4: Auth status check
print_step "Checking authentication status"
if monk auth status; then
    print_success "Authentication status verified"
else
    print_error "Authentication status check failed"
    cleanup_auth
    exit 1
fi

# Test 5: Database connectivity test
if ! test_connectivity; then
    print_error "Database connectivity test failed"
    cleanup_auth
    exit 1
fi

# Cleanup test tenant
print_step "Cleaning up test tenant"
cleanup_auth
print_success "Test cleanup completed"

echo
print_success "All connection tests passed!"