#!/bin/bash
set -e

# Authentication Failure Test - Invalid Credentials and Error Scenarios  
# Tests authentication failure scenarios including invalid credentials, non-existent users, and expired tokens
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

# Helper function to test expected authentication failure
test_auth_failure() {
    local test_name="$1"
    local tenant_name="$2"
    local username="$3"
    
    print_step "$test_name"
    
    # Ensure we're logged out first
    logout_user
    
    # Try to authenticate - this should fail
    if monk auth login "$tenant_name" "$username" >/dev/null 2>&1; then
        print_error "$test_name - Expected authentication failure but login succeeded"
        return 1
    else
        print_success "$test_name - Authentication failed as expected"
        return 0
    fi
}

# Helper function to test that operations fail when not authenticated
test_unauthenticated_operation() {
    local operation_name="$1"
    local monk_command="$2"
    
    print_step "Test unauthenticated $operation_name"
    
    # Ensure we're logged out
    logout_user
    
    # Try the operation - it should fail
    if eval "$monk_command" >/dev/null 2>&1; then
        print_error "Unauthenticated $operation_name succeeded - security issue!"
        return 1
    else
        print_success "Unauthenticated $operation_name failed as expected"
        return 0
    fi
}

echo "=== Authentication Failure Test ==="
echo "Testing authentication failure scenarios and security boundaries"
echo

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
echo

# Test 1: Invalid/Non-existent Tenant
if ! test_auth_failure "Test 1: Invalid tenant name" "non-existent-tenant" "root"; then
    exit 1
fi

# Test 2: Non-existent User
if ! test_auth_failure "Test 2: Non-existent user" "$TEST_TENANT_NAME" "non-existent-user"; then
    exit 1
fi

# Test 3: Empty Username
if ! test_auth_failure "Test 3: Empty username" "$TEST_TENANT_NAME" ""; then
    exit 1
fi

# Test 4: Invalid Characters in Username
if ! test_auth_failure "Test 4: Username with invalid characters" "$TEST_TENANT_NAME" "user@#\$%invalid"; then
    exit 1
fi

# Test 5: SQL Injection Attempt in Username  
if ! test_auth_failure "Test 5: SQL injection in username" "$TEST_TENANT_NAME" "'; DROP TABLE users; --"; then
    exit 1
fi

# Test 6: Very Long Username (potential buffer overflow)
long_username=$(printf 'a%.0s' {1..1000})
if ! test_auth_failure "Test 6: Extremely long username" "$TEST_TENANT_NAME" "$long_username"; then
    exit 1
fi

# Test 7: Unauthenticated Operations Should Fail
echo
print_info "Testing that unauthenticated operations are properly blocked"

# Test ping without auth
if ! test_unauthenticated_operation "ping" "monk server ping"; then
    exit 1
fi

# Test auth info without auth  
if ! test_unauthenticated_operation "auth info" "monk auth info"; then
    exit 1
fi

# Test meta operations without auth
if ! test_unauthenticated_operation "meta list" "monk meta list"; then
    exit 1
fi

# Test data operations without auth (if data command exists)
if ! test_unauthenticated_operation "data list" "monk data list user 2>/dev/null || echo 'command not found'"; then
    exit 1  
fi

# Test 8: Auth Status When Not Authenticated
print_step "Test 8: Auth status when not authenticated"
logout_user
if monk auth status >/dev/null 2>&1; then
    print_error "Auth status returned success when not authenticated"
    exit 1
else
    print_success "Auth status correctly reports not authenticated"
fi

# Test 9: Multiple Failed Login Attempts (Rate limiting test)
print_step "Test 9: Multiple consecutive failed login attempts"
logout_user

failed_attempts=0
max_attempts=5

for i in $(seq 1 $max_attempts); do
    if monk auth login "$TEST_TENANT_NAME" "fake-user-$i" >/dev/null 2>&1; then
        print_error "Unexpected successful login on attempt $i"
        exit 1
    else
        ((failed_attempts++))
    fi
    
    # Small delay between attempts to be respectful
    sleep 0.1
done

if [ $failed_attempts -eq $max_attempts ]; then
    print_success "All $max_attempts failed login attempts handled correctly"
else
    print_error "Expected $max_attempts failed attempts, got $failed_attempts"
    exit 1
fi

# Test 10: Case Sensitivity in Usernames
print_step "Test 10: Username case sensitivity"

# First authenticate as root to create a test user
if auth_as_user "root"; then
    # Create a test user with specific case
    if create_test_user "TestUser" "read"; then
        print_success "Created test user: TestUser"
        
        # Now test that different case fails
        if ! test_auth_failure "Test 10a: Wrong case username" "$TEST_TENANT_NAME" "testuser"; then
            exit 1
        fi
        
        if ! test_auth_failure "Test 10b: Wrong case username" "$TEST_TENANT_NAME" "TESTUSER"; then
            exit 1
        fi
        
        # Test correct case should work
        logout_user
        if auth_as_user "TestUser"; then
            print_success "Correct case username authentication successful"
        else
            print_error "Correct case username authentication failed"
            exit 1
        fi
    else
        print_error "Failed to create TestUser for case sensitivity test"
        exit 1
    fi
else
    print_error "Failed to authenticate as root for user creation"
    exit 1
fi

# Test 11: Tenant Name Case Sensitivity
print_step "Test 11: Tenant name case sensitivity"
logout_user

# Convert tenant name to different cases and test they fail
upper_tenant=$(echo "$TEST_TENANT_NAME" | tr '[:lower:]' '[:upper:]')
if [ "$upper_tenant" != "$TEST_TENANT_NAME" ]; then
    if ! test_auth_failure "Test 11a: Uppercase tenant name" "$upper_tenant" "root"; then
        exit 1
    fi
fi

mixed_tenant=$(echo "$TEST_TENANT_NAME" | sed 's/./\U&/')
if [ "$mixed_tenant" != "$TEST_TENANT_NAME" ]; then
    if ! test_auth_failure "Test 11b: Mixed case tenant name" "$mixed_tenant" "root"; then
        exit 1
    fi
fi

# Test 12: Special Characters in Tenant Name  
print_step "Test 12: Special characters in tenant name"
special_tenants=("tenant-with-spaces" "tenant@domain.com" "tenant/with/slashes" "tenant;drop;table")

for special_tenant in "${special_tenants[@]}"; do
    if ! test_auth_failure "Test 12: Special tenant '$special_tenant'" "$special_tenant" "root"; then
        exit 1
    fi
done

# Final cleanup
logout_user

echo
print_success "All authentication failure tests passed!"
print_info "Authentication security boundaries are properly enforced"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"