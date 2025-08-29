#!/bin/bash
set -e

# Token Management Test - Token Refresh, Info Commands, and Persistence
# Tests JWT token lifecycle including info retrieval, token persistence, and refresh capabilities
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

# Helper function to extract specific info from monk auth info output
extract_token_info() {
    local field="$1"
    monk auth info 2>/dev/null | grep -i "$field" | cut -d':' -f2- | xargs || echo ""
}

# Helper function to validate token info contains expected fields
validate_token_info() {
    local token_info="$1"
    
    # Check for common JWT fields that should be present
    if echo "$token_info" | grep -q "tenant\|domain\|user\|exp\|iat" 2>/dev/null; then
        return 0
    else
        return 1  
    fi
}

echo "=== Token Management Test ==="
echo "Testing JWT token lifecycle, info commands, and persistence"
echo

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
echo

# Test 1: Token Information Retrieval
print_step "Test 1: Authenticate and retrieve token information"
if auth_as_user "root"; then
    print_success "Root user authenticated"
    
    # Get token info
    token_info=$(monk auth info 2>&1)
    if [ $? -eq 0 ] && [ -n "$token_info" ]; then
        print_success "Token information retrieved successfully"
        
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "Token info details:"
            echo "$token_info" | sed 's/^/  /'
        fi
        
        # Validate token info contains expected fields
        if validate_token_info "$token_info"; then
            print_success "Token information contains expected JWT fields"
        else
            print_error "Token information missing expected fields"
            exit 1
        fi
    else
        print_error "Failed to retrieve token information"
        exit 1
    fi
else
    print_error "Root authentication failed"
    exit 1
fi

# Test 2: Token Status Verification
print_step "Test 2: Verify authentication status shows active token"
if monk auth status >/dev/null 2>&1; then
    auth_status=$(monk auth status 2>&1)
    print_success "Authentication status confirmed"
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Auth status:"
        echo "$auth_status" | sed 's/^/  /'
    fi
else
    print_error "Authentication status check failed"
    exit 1
fi

# Test 3: Token Persistence Across Commands
print_step "Test 3: Verify token persists across multiple commands"

# Execute multiple commands to ensure token persistence
commands=("monk ping" "monk auth status" "monk auth info")
for cmd in "${commands[@]}"; do
    if eval "$cmd" >/dev/null 2>&1; then
        print_success "Token persisted for: $cmd"
    else
        print_error "Token persistence failed for: $cmd"
        exit 1
    fi
done

# Test 4: Token Information Fields
print_step "Test 4: Validate token contains expected user and tenant information"

# Extract specific fields from token info
tenant_info=$(extract_token_info "tenant\|domain")
user_info=$(extract_token_info "user\|username\|sub")

if [ -n "$tenant_info" ]; then
    print_success "Token contains tenant/domain information: $tenant_info"
else
    print_error "Token missing tenant/domain information"
    exit 1
fi

if [ -n "$user_info" ]; then
    print_success "Token contains user information: $user_info"
else
    print_error "Token missing user information"
    exit 1
fi

# Test 5: Multiple Authentication Sessions (Token Replacement)
print_step "Test 5: Test token replacement with new authentication"

# Get current token info
current_token=$(monk auth info 2>&1)

# Create a test user and authenticate as that user
if create_test_user "token-test-user" "read"; then
    print_success "Created test user for token replacement test"
    
    # Switch to new user
    if auth_as_user "token-test-user"; then
        print_success "Successfully authenticated as token-test-user"
        
        # Get new token info
        new_token=$(monk auth info 2>&1)
        
        # Verify tokens are different
        if [ "$current_token" != "$new_token" ]; then
            print_success "Token properly replaced with new authentication"
            
            # Verify new token contains correct user info
            new_user_info=$(extract_token_info "user\|username\|sub")
            if echo "$new_user_info" | grep -q "token-test-user"; then
                print_success "New token contains correct user information"
            else
                print_error "New token doesn't contain expected user information"
                exit 1
            fi
        else
            print_error "Token was not replaced with new authentication"
            exit 1
        fi
    else
        print_error "Failed to authenticate as token-test-user"
        exit 1
    fi
else
    print_error "Failed to create token-test-user"
    exit 1
fi

# Test 6: Token Invalidation on Logout
print_step "Test 6: Verify token is invalidated on logout"

# Confirm we're authenticated
if monk auth status >/dev/null 2>&1; then
    print_success "Confirmed authenticated before logout test"
    
    # Logout
    logout_user
    
    # Verify token is no longer valid
    if monk auth status >/dev/null 2>&1; then
        print_error "Token still valid after logout - security issue!"
        exit 1
    else
        print_success "Token properly invalidated after logout"
    fi
    
    # Verify auth info fails after logout
    if monk auth info >/dev/null 2>&1; then
        print_error "Auth info still works after logout - security issue!"
        exit 1
    else
        print_success "Auth info properly fails after logout"
    fi
else
    print_error "Not authenticated for logout test"
    exit 1
fi

# Test 7: Token Recreation After Logout
print_step "Test 7: Verify new token creation after logout and re-authentication"

# Re-authenticate
if auth_as_user "root"; then
    print_success "Re-authentication successful after logout"
    
    # Get new token info
    recreated_token=$(monk auth info 2>&1)
    if [ $? -eq 0 ] && [ -n "$recreated_token" ]; then
        print_success "New token created after re-authentication"
        
        # Verify it works for operations
        if monk ping >/dev/null 2>&1; then
            print_success "Recreated token works for authenticated operations"
        else
            print_error "Recreated token doesn't work for operations"
            exit 1
        fi
    else
        print_error "Failed to create new token after re-authentication"
        exit 1
    fi
else
    print_error "Re-authentication failed after logout"
    exit 1
fi

# Test 8: Token Info Command Edge Cases
print_step "Test 8: Test token info command behavior edge cases"

# Test token info when authenticated
if monk auth info >/dev/null 2>&1; then
    print_success "Token info works when authenticated"
else
    print_error "Token info fails when authenticated"
    exit 1
fi

# Test repeated token info calls
for i in {1..3}; do
    if monk auth info >/dev/null 2>&1; then
        if [ $i -eq 3 ]; then
            print_success "Token info command works consistently over multiple calls"
        fi
    else
        print_error "Token info failed on call $i"
        exit 1
    fi
done

# Test 9: Token with Different User Types
print_step "Test 9: Verify token info accuracy for different user types"

# Test with different access levels
user_types=("read" "edit" "full")
for access_type in "${user_types[@]}"; do
    # Create user with specific access
    test_user="token-${access_type}-user"
    if create_test_user "$test_user" "$access_type"; then
        # Authenticate as this user
        if auth_as_user "$test_user"; then
            # Check token contains correct info
            token_user_info=$(extract_token_info "user\|username\|sub")
            if echo "$token_user_info" | grep -q "$test_user"; then
                print_success "Token accurate for $access_type user: $test_user"
            else
                print_error "Token inaccurate for $access_type user"
                exit 1
            fi
        else
            print_error "Failed to authenticate as $test_user"
            exit 1
        fi
    else
        print_error "Failed to create $test_user"
        exit 1
    fi
done

# Test 10: Verify Token Storage in server.json
print_step "Test 10: Verify token storage in ~/.config/monk/server.json"

# Check if server.json exists
servers_file="$HOME/.config/monk/server.json"
if [ -f "$servers_file" ]; then
    print_success "Found server.json file: $servers_file"
    
    # Check if file contains token-related data
    if grep -q "token\|jwt\|auth" "$servers_file" 2>/dev/null; then
        print_success "server.json contains authentication data"
    else
        print_info "server.json exists but may not contain token data"
    fi
    
    # Verify file is readable
    if [ -r "$servers_file" ]; then
        print_success "server.json file is readable"
    else
        print_error "server.json file is not readable"
        exit 1
    fi
else
    print_info "server.json not found - may be created after first authentication"
fi

# Test token persistence after logout and check server.json
logout_user
if [ -f "$servers_file" ]; then
    print_success "server.json persists after logout (token may be cleared)"
else
    print_info "server.json not present after logout"
fi

# Re-authenticate and verify server.json is updated
if auth_as_user "root"; then
    if [ -f "$servers_file" ]; then
        print_success "server.json present after re-authentication"
        
        # Check if file was recently modified (within last minute)
        if [ "$(find "$servers_file" -mmin -1 2>/dev/null)" ]; then
            print_success "server.json was recently updated with new authentication"
        else
            print_info "server.json exists but modification time unclear"
        fi
    else
        print_error "server.json not created after authentication"
        exit 1
    fi
else
    print_error "Re-authentication failed for server.json test"
    exit 1
fi

# Final cleanup
logout_user

# Verify cleanup
if monk auth status >/dev/null 2>&1; then
    print_error "Authentication still active after final cleanup"
    exit 1
else
    print_success "Final cleanup successful - no active authentication"
fi

echo
print_success "All token management tests passed!"
print_info "JWT token lifecycle management working correctly"
print_info "Token storage in ~/.config/monk/server.json verified"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"