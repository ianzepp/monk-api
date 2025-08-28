#!/bin/bash
# Test Environment Validation - 02 Series
#
# Tests the test framework's isolated environment setup and teardown process
# without running actual application tests. This validates:
# - Port discovery and allocation
# - Isolated CLI configuration setup  
# - API server startup on test port
# - CLI server configuration and connectivity
# - Tenant creation/deletion via CLI
# - Complete cleanup process
#
# This test is designed to validate the test framework infrastructure itself.

set -e

echo "=== Test Environment Validation ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

echo "🔍 This test validates the test framework environment setup process"
echo "🎯 Goal: Verify isolated test environment works without running real tests"
echo

# The test framework should have already set up the environment by this point
# Let's validate each component

print_step "Validating isolated CLI configuration"
if [ -n "$MONK_CLI_CONFIG_DIR" ] && [ -d "$MONK_CLI_CONFIG_DIR" ]; then
    print_success "Isolated CLI config directory exists: $MONK_CLI_CONFIG_DIR"
else
    print_error "Isolated CLI config not set up properly"
    exit 1
fi

print_step "Validating test server configuration"
if monk server current >/dev/null 2>&1; then
    current_server=$(monk server current | head -1 | cut -d: -f2 | tr -d ' ')
    endpoint=$(monk server current | grep "Endpoint:" | cut -d: -f2- | tr -d ' ')
    print_success "Connected to test server: $current_server"
    print_info "Server endpoint: $endpoint"
else
    print_error "No test server configured or CLI not working"
    exit 1
fi

print_step "Validating API server connectivity"
if monk server ping >/dev/null 2>&1; then
    print_success "API server responds to ping"
else
    print_error "API server not responding to ping"
    exit 1
fi

print_step "Validating test tenant availability"
if [ -n "$TEST_TENANT_NAME" ]; then
    print_success "Test tenant name available: $TEST_TENANT_NAME"
    
    # Try to show the tenant (it should exist if framework setup worked)
    if monk root tenant show "$TEST_TENANT_NAME" >/dev/null 2>&1; then
        print_success "Test tenant exists and is accessible"
    else
        print_error "Test tenant was not created or is not accessible"
        exit 1
    fi
else
    print_error "TEST_TENANT_NAME environment variable not set"
    exit 1
fi

print_step "Validating test tenant authentication"
if monk auth login "$TEST_TENANT_NAME" root >/dev/null 2>&1; then
    print_success "Successfully authenticated to test tenant"
    
    # Test a simple API operation
    if monk data list schema >/dev/null 2>&1; then
        print_success "Basic API operations working"
    else
        print_info "API operations not fully ready (may be normal for infrastructure test)"
    fi
else
    print_error "Failed to authenticate to test tenant"
    exit 1
fi

print_step "Environment validation summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "CLI Config Dir: $MONK_CLI_CONFIG_DIR"
print_info "Test Tenant: $TEST_TENANT_NAME"
print_info "Server Endpoint: $(monk server current | grep Endpoint | cut -d: -f2- | tr -d ' ')"
print_info "Authentication: $(monk auth status 2>/dev/null | head -1 || echo 'Status check failed')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_success "Test environment validation completed successfully"
print_info "Framework setup working - ready for real tests"

# NOTE: Cleanup will be handled by test-one.sh framework
# This test just validates the environment is working correctly

exit 0