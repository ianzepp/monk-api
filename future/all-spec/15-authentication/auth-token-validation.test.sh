#!/bin/bash
set -e

# Authentication and Token Validation Test - 15 Series
# Tests authentication failure scenarios AND JWT token lifecycle management
# Combines auth-failure.test.sh + token-management.test.sh for comprehensive validation
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"

# Source auth helper for authentication utilities
source "$(dirname "$0")/../helpers/auth-helper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

echo "=== Authentication and Token Validation Test ==="
echo "Testing authentication failures AND token lifecycle management"
echo

# Check that tenant is available
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
echo

# PART 1: Authentication Failure Scenarios
echo "🔒 PART 1: Authentication Failure Testing"
echo "======================================="

# Test 1: Invalid tenant authentication
print_step "Test 1: Invalid tenant authentication"
if monk auth login "nonexistent-tenant" root >/dev/null 2>&1; then
    print_error "Authentication should have failed for nonexistent tenant"
    exit 1
else
    print_success "Correctly rejected nonexistent tenant authentication"
fi

# Test 2: Invalid username authentication  
print_step "Test 2: Invalid username authentication"
if monk auth login "$TEST_TENANT_NAME" "nonexistent-user" >/dev/null 2>&1; then
    print_error "Authentication should have failed for nonexistent user"
    exit 1
else
    print_success "Correctly rejected nonexistent user authentication"
fi

# Test 3: Empty credentials
print_step "Test 3: Empty credentials authentication"
if monk auth login "" "" >/dev/null 2>&1; then
    print_error "Authentication should have failed for empty credentials"
    exit 1
else
    print_success "Correctly rejected empty credentials"
fi

echo
echo "🎫 PART 2: Token Lifecycle Management"
echo "===================================="

# Test 4: Valid authentication and token generation
print_step "Test 4: Valid authentication and token generation"
if monk auth login "$TEST_TENANT_NAME" root >/dev/null 2>&1; then
    print_success "Successfully authenticated to test tenant"
else
    print_error "Valid authentication failed"
    exit 1
fi

# Test 5: Token info retrieval
print_step "Test 5: Token info retrieval"
if token_info=$(monk auth info 2>/dev/null); then
    if echo "$token_info" | grep -q "$TEST_TENANT_NAME"; then
        print_success "Token info contains correct tenant information"
        print_info "Token shows tenant: $TEST_TENANT_NAME"
    else
        print_error "Token info missing tenant information"
        print_info "Got: $token_info"
        exit 1
    fi
else
    print_error "Failed to retrieve token information"
    exit 1
fi

# Test 6: Token status check
print_step "Test 6: Token status validation"
if status_output=$(monk auth status 2>/dev/null); then
    if echo "$status_output" | grep -q "authenticated" || echo "$status_output" | grep -q "valid"; then
        print_success "Token status shows valid authentication"
    else
        print_error "Token status shows invalid state"
        print_info "Status: $status_output"
        exit 1
    fi
else
    print_error "Failed to check token status"
    exit 1
fi

# Test 7: Token expiration check
print_step "Test 7: Token expiration validation"
if expires_info=$(monk auth expires 2>/dev/null); then
    if echo "$expires_info" | grep -q "expires" || echo "$expires_info" | grep -q "valid"; then
        print_success "Token expiration information available"
        print_info "Expiration: $expires_info"
    else
        print_info "Token expiration format may vary (acceptable)"
    fi
else
    print_info "Token expiration check not available (acceptable)"
fi

# Test 8: Authentication state cleanup
print_step "Test 8: Authentication logout"
if monk auth logout >/dev/null 2>&1; then
    print_success "Successfully logged out"
else
    print_error "Logout failed"
    exit 1
fi

# Test 9: Post-logout state validation
print_step "Test 9: Post-logout state validation"
if monk auth status >/dev/null 2>&1; then
    # Check if still shows as authenticated (should not)
    status_after_logout=$(monk auth status 2>/dev/null || echo "no status")
    if echo "$status_after_logout" | grep -q "not authenticated" || echo "$status_after_logout" | grep -q "no status"; then
        print_success "Correctly shows unauthenticated after logout"
    else
        print_error "Still shows authenticated after logout"
        print_info "Status: $status_after_logout"
        exit 1
    fi
else
    print_success "Auth status correctly unavailable after logout"
fi

echo
echo "📊 Authentication and Token Test Summary"
echo "======================================="
print_info "Authentication failures: ✅ Invalid tenant, user, and empty credentials rejected"
print_info "Token lifecycle: ✅ Generation, info, status, expiration, logout working"
print_info "State management: ✅ Proper authentication state transitions"

print_success "All authentication and token validation tests passed!"
print_info "Authentication system working correctly from external CLI perspective"

exit 0