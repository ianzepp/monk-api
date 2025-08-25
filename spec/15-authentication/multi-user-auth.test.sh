#!/bin/bash
set -e

# Multi-User Authentication Test - Different Access Levels
# Tests authentication with different user types and access levels (read, edit, full)
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

echo "=== Multi-User Authentication Test ==="
echo "Testing authentication with different access levels (read, edit, full)"
echo

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
echo

# Setup: Authenticate as root to create test users
print_step "Setup: Authenticate as root to create test users"
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root for setup"
    exit 1
fi

# Create test users with different access levels
print_step "Creating test users with different access levels"

# Test users to create
TEST_USERS=("test-read-user:read" "test-edit-user:edit" "test-full-user:full")

for user_spec in "${TEST_USERS[@]}"; do
    IFS=':' read -r username access <<< "$user_spec"
    if create_test_user "$username" "$access"; then
        print_success "Created user: $username (access: $access)"
    else
        print_error "Failed to create user: $username"
        exit 1
    fi
done

# Test 1: Read User Authentication
print_step "Test 1: Authenticate as read-only user"
logout_user
if auth_as_user "test-read-user"; then
    print_success "Read user authentication successful"
    
    # Verify read access works
    if monk ping >/dev/null 2>&1; then
        print_success "Read user can access system (ping successful)"
    else
        print_error "Read user cannot access system"
        exit 1
    fi
    
    # Verify auth info works
    if monk auth info >/dev/null 2>&1; then
        print_success "Read user can check auth info"
    else
        print_error "Read user cannot check auth info"
        exit 1
    fi
else
    print_error "Read user authentication failed"
    exit 1
fi

# Test 2: Edit User Authentication
print_step "Test 2: Authenticate as edit user"
logout_user
if auth_as_user "test-edit-user"; then
    print_success "Edit user authentication successful"
    
    # Verify edit access works
    if monk ping >/dev/null 2>&1; then
        print_success "Edit user can access system (ping successful)"
    else
        print_error "Edit user cannot access system"
        exit 1
    fi
    
    # Verify auth info works
    if monk auth info >/dev/null 2>&1; then
        print_success "Edit user can check auth info"
    else
        print_error "Edit user cannot check auth info"
        exit 1
    fi
else
    print_error "Edit user authentication failed"
    exit 1
fi

# Test 3: Full Access User Authentication
print_step "Test 3: Authenticate as full access user"
logout_user
if auth_as_user "test-full-user"; then
    print_success "Full user authentication successful"
    
    # Verify full access works
    if monk ping >/dev/null 2>&1; then
        print_success "Full user can access system (ping successful)"
    else
        print_error "Full user cannot access system"
        exit 1
    fi
    
    # Verify auth info works
    if monk auth info >/dev/null 2>&1; then
        print_success "Full user can check auth info"
    else
        print_error "Full user cannot check auth info"
        exit 1
    fi
else
    print_error "Full user authentication failed"
    exit 1
fi

# Test 4: Multiple User Session Switching
print_step "Test 4: Test switching between different user sessions"

# Switch to read user
if auth_as_user "test-read-user"; then
    read_user_info=$(monk auth info 2>&1 | grep -o "test-read-user" || echo "")
    if [ -n "$read_user_info" ]; then
        print_success "Successfully switched to read user session"
    else
        print_error "Session switch to read user failed"
        exit 1
    fi
else
    print_error "Failed to switch to read user"
    exit 1
fi

# Switch to edit user
if auth_as_user "test-edit-user"; then
    edit_user_info=$(monk auth info 2>&1 | grep -o "test-edit-user" || echo "")
    if [ -n "$edit_user_info" ]; then
        print_success "Successfully switched to edit user session"
    else
        print_error "Session switch to edit user failed"
        exit 1
    fi
else
    print_error "Failed to switch to edit user"
    exit 1
fi

# Switch back to root
if auth_as_user "root"; then
    root_user_info=$(monk auth info 2>&1 | grep -o "root" || echo "")
    if [ -n "$root_user_info" ]; then
        print_success "Successfully switched back to root user session"
    else
        print_error "Session switch back to root failed"
        exit 1
    fi
else
    print_error "Failed to switch back to root"
    exit 1
fi

# Test 5: Verify User Isolation
print_step "Test 5: Verify each user maintains separate session context"

# Test that logging out affects only current session
auth_as_user "test-read-user"
if monk auth status >/dev/null 2>&1; then
    print_success "Read user session active before logout test"
    
    # Logout and verify
    logout_user
    if monk auth status >/dev/null 2>&1; then
        print_error "User still authenticated after logout - session isolation issue"
        exit 1
    else
        print_success "User session properly isolated - logout works correctly"
    fi
else
    print_error "Read user session not active for isolation test"
    exit 1
fi

# Cleanup: Logout any remaining session
logout_user

echo
print_success "All multi-user authentication tests passed!"
print_info "Test users and tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"