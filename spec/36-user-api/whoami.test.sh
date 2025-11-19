#!/usr/bin/env bash
set -e

# User API Test - Whoami Endpoint
# Tests user identity endpoint that requires JWT authentication

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing User API whoami endpoint"

# Setup test tenant from template
tenant_name=$(setup_test_with_template "whoami_test" "testing")
load_test_env

# Authenticate as root user for sudo privilege testing
print_step "Setting up authentication for root user"
JWT_TOKEN=$(get_user_token "$tenant_name" "root")
if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
    print_success "Authentication (root) configured"
    export JWT_TOKEN
else
    test_fail "Failed to authenticate root user"
fi

# Test whoami endpoint
print_step "Testing GET /api/user/whoami"
response=$(auth_get "api/user/whoami")
assert_success "$response"
assert_has_field "data.id" "$response"
assert_has_field "data.access" "$response"

print_success "Whoami endpoint returns user information"

# Test whoami without authentication
print_step "Testing whoami without JWT token"
unauth_response=$(api_get_with_status "api/user/whoami")
if [[ "$unauth_response" =~ HTTP_STATUS:401$ ]]; then
    print_success "Whoami properly requires authentication"
else
    test_fail "Whoami should return 401 without JWT: $unauth_response"
fi

print_success "User API whoami tests completed successfully"
