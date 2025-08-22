#!/bin/bash
set -e

# ===================================================================
# EXAMPLE TEST SCRIPT - Recommended Pattern for Monk API Tests
# ===================================================================
#
# This script demonstrates the recommended pattern for writing test
# scripts that use tenant-based authentication with the Monk API.
#
# Key Principles:
# - One tenant per test script (created once, used throughout)
# - All tests use the same authenticated session
# - Automatic cleanup on success or failure
# - Clear error handling and reporting
#
# Usage:
#   ./tests/test-example.sh
#
# Requirements:
#   - Monk API server running (npm start)
#   - monk CLI available in PATH
#
# ===================================================================

# Auto-configure test environment
source "$(dirname "$0")/test-env-setup.sh"

# Source auth helper for tenant management
source "$(dirname "$0")/auth-helper.sh"

# Colors for output (if not already defined)
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
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

# Test configuration
echo "=== Example Test Script ==="
echo "This demonstrates the recommended test pattern for Monk API"
echo

# ===================================================================
# STEP 1: ONE-TIME SETUP - Initialize test tenant and authenticate
# ===================================================================
print_step "Setting up test environment (one-time per script)"

# Initialize tenant and authenticate - call this ONCE per script
if ! initialize_test_tenant; then
    print_error "Failed to initialize test tenant"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
print_info "Authenticated as: root user"
echo

# Optional: Test basic connectivity (this function is available but not required)
if ! test_connectivity; then
    print_error "Initial connectivity test failed"
    cleanup_auth
    exit 1
fi

echo

# ===================================================================
# STEP 2: RUN YOUR TESTS - All tests use the same authenticated session
# ===================================================================

print_step "Test Case 1: Basic API Operations"
# Example: Test ping (already authenticated)
if monk ping >/dev/null 2>&1; then
    print_success "Ping test passed"
else
    print_error "Ping test failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 2: Meta API Operations"
# Example: List schemas (should return empty array for new tenant)
if schema_result=$(monk meta list 2>/dev/null); then
    print_success "Meta list schemas successful"
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Schema result: $schema_result"
    fi
else
    print_error "Meta list schemas failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 3: Authentication Status Check"
# Example: Verify authentication status
if monk auth status >/dev/null 2>&1; then
    print_success "Authentication status verified"
else
    print_error "Authentication status check failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 4: Token Information"
# Example: Check JWT token contents (optional)
if monk auth info >/dev/null 2>&1; then
    print_success "JWT token information accessible"
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "JWT details:"
        monk auth info 2>/dev/null | sed 's/^/  /'
    fi
else
    print_error "JWT token information failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 5: Custom Test Logic"
# Add your specific test cases here
# Examples:
# - monk data create user_schema < test-data.json
# - monk data list user_schema
# - monk meta create schema < schema.yaml
# - etc.

# Simulate a custom test
sleep 0.5  # Simulate test work
print_success "Custom test logic completed"

echo

# ===================================================================
# STEP 3: CLEANUP - Always cleanup at the end (success or failure)
# ===================================================================

print_step "Cleaning up test environment"
cleanup_auth
print_success "Test cleanup completed"

echo
print_success "🎉 All example tests passed!"
print_info "Test tenant $TEST_TENANT_NAME was created and cleaned up successfully"

# ===================================================================
# PATTERN SUMMARY FOR REFERENCE:
# ===================================================================
cat << 'EOF'

📋 PATTERN SUMMARY:
==================

1. Source required helpers:
   source "$(dirname "$0")/test-env-setup.sh"
   source "$(dirname "$0")/auth-helper.sh"

2. Initialize tenant ONCE per script:
   if ! initialize_test_tenant; then
       print_error "Failed to initialize test tenant"
       exit 1
   fi

3. Run all your tests using $TEST_TENANT_NAME:
   # All monk commands now use authenticated session
   monk meta list
   monk data create schema
   monk ping
   # etc.

4. Cleanup at the end:
   cleanup_auth

5. Error handling - always cleanup on failure:
   if ! some_test; then
       cleanup_auth
       exit 1
   fi

Available Helper Functions:
- initialize_test_tenant()  : Creates tenant + authenticates (call once)
- test_connectivity()       : Tests ping/connectivity (optional)
- cleanup_auth()           : Logout + delete tenant (call at end)
- authenticate_and_ping()  : Legacy function (backward compatibility)

Global Variables:
- $TEST_TENANT_NAME        : Contains the created tenant name

EOF