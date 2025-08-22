#!/bin/bash
set -e

# Basic Connection Test - Ping and Auth
# Tests: server connectivity → authentication → basic ping with JWT

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

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

# Test configuration (from persistent monk configuration)
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
TEST_DOMAIN="${MONK_TEST_DATABASE:-monk_connection_test_$(date +%s)}"

echo "=== Basic Connection Test ==="
echo "Server: $SERVER_URL"
echo "Test Domain: $TEST_DOMAIN"
echo

# Test 1: Basic server ping (no auth)
print_step "Testing server connectivity (no auth)"
if monk ping > /dev/null 2>&1; then
    print_success "Server is responding"
else
    print_error "Server connectivity failed"
    exit 1
fi

# Test 2: Authentication
print_step "Testing authentication with domain: $TEST_DOMAIN"
if monk auth login --domain "$TEST_DOMAIN"; then
    print_success "Authentication successful"
else
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

echo
print_success "All connection tests passed!"