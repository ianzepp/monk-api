#!/usr/bin/env bash
set -e

# Protected Auth API Test
# Tests protected auth endpoints that require JWT authentication

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing protected Auth API endpoints"

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
print_step "Testing GET /api/auth/whoami"
response=$(auth_get "api/auth/whoami")
assert_success "$response"
assert_has_field "data.id" "$response"
assert_has_field "data.access" "$response"

print_success "Whoami endpoint returns user information"

# Test whoami without authentication
print_step "Testing whoami without JWT token"
unauth_response=$(api_get_with_status "api/auth/whoami")
if [[ "$unauth_response" =~ HTTP_STATUS:401$ ]]; then
    print_success "Whoami properly requires authentication"
else
    test_fail "Whoami should return 401 without JWT: $unauth_response"
fi

# Test sudo privilege escalation
print_step "Testing POST /api/auth/sudo"
sudo_response=$(auth_post "api/auth/sudo" '{"reason":"Testing privilege escalation"}')
assert_success "$sudo_response"
assert_has_field "data.root_token" "$sudo_response"
assert_has_field "data.expires_in" "$sudo_response"

# Verify token expiration warning
expires_in=$(echo "$sudo_response" | jq -r '.data.expires_in')
if [[ "$expires_in" -eq 900 ]]; then
    print_success "Root token has correct 15-minute expiration"
else
    test_fail "Root token should expire in 900 seconds, got: $expires_in"
fi

print_success "Sudo privilege escalation successful"

print_success "Protected Auth API tests completed successfully"
