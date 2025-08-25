#!/bin/bash
set -e

# Basic Ping Test - No Authentication Required
# Tests server connectivity without authentication to verify infrastructure
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"

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

echo "=== Basic Ping Test ==="
echo "Testing server connectivity without authentication"
echo

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
print_info "No authentication required for ping endpoint"
echo

# Test 1: Basic Ping (no auth)
print_step "Test 1: Basic server ping"
if monk ping >/dev/null 2>&1; then
    print_success "Server ping successful"
else
    print_error "Server ping failed"
    exit 1
fi

# Test 2: Verbose Ping with Output
print_step "Test 2: Verbose ping with response details"
ping_output=$(monk ping 2>/dev/null || echo "ping failed")
if echo "$ping_output" | grep -q "pong:"; then
    print_success "Ping response received"
    print_info "Response: $ping_output"
else
    print_error "Invalid ping response"
    print_info "Got: $ping_output"
    exit 1
fi

# Test 3: Server Availability Check
print_step "Test 3: Verify server endpoint accessibility"
if monk servers current >/dev/null 2>&1; then
    current_server=$(monk servers current 2>/dev/null | grep "Endpoint:" | awk '{print $2}')
    print_success "Server endpoint accessible"
    print_info "Endpoint: $current_server"
else
    print_error "Server endpoint check failed"
    exit 1
fi

echo
print_success "All basic ping tests passed!"
print_info "Server connectivity verified without authentication"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"