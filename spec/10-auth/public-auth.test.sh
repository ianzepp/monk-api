#!/usr/bin/env bash
set -e

# Public Authentication Test
# Tests public auth endpoints (login, register, refresh) without JWT requirements

# Source curl helper
source "$(dirname "$0")/../curl-helper.sh"

print_step "Testing public authentication endpoints"

# Wait for server to be ready
wait_for_server

# Test login endpoint
print_step "Testing POST /auth/login"
response=$(login_user "system" "root")
assert_success "$response"
assert_has_field "data.token" "$response"
assert_has_field "data.user" "$response"

# Extract token for further tests
JWT_TOKEN=$(echo "$response" | jq -r '.data.token')
export JWT_TOKEN

print_success "Login successful - JWT token obtained"

# # Test token refresh
# print_step "Testing POST /auth/refresh"
# refresh_response=$(api_post "auth/refresh" "{\"token\":\"$JWT_TOKEN\"}")
# assert_success "$refresh_response"
# assert_has_field "data.token" "$refresh_response"

# print_success "Token refresh successful"

# Test login with invalid credentials
print_step "Testing login with invalid tenant"
invalid_response=$(api_post "auth/login" '{"tenant":"nonexistent","username":"test"}')
assert_error "$invalid_response"
assert_error_code "AUTH_FAILED" "$invalid_response"

print_success "Invalid login properly rejected"

# Test missing fields
print_step "Testing login with missing tenant"
missing_tenant=$(api_post "auth/login" '{"username":"test"}')
assert_error "$missing_tenant"
assert_error_code "TENANT_MISSING" "$missing_tenant"

print_success "Missing tenant field properly validated"

print_step "Testing login with missing username"
missing_username=$(api_post "auth/login" '{"tenant":"system"}')
assert_error "$missing_username"
assert_error_code "USERNAME_MISSING" "$missing_username"

print_success "Missing username field properly validated"

print_success "Public authentication tests completed successfully"
