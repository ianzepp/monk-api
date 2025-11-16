#!/usr/bin/env bash
set -e

# Format API TOON Test
# Tests TOON format encoding/decoding with POST /auth/login

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing TOON format functionality"

# Setup test environment
setup_test_without_template "format-toon"

print_step "Testing TOON request and response"

# TOON format login request body
toon_request='tenant: toon-test
username: root
format: toon'

# Make request with TOON Content-Type and Accept headers
response=$(curl -s -X POST "http://localhost:${PORT}/auth/login" \
    -H "Content-Type: application/toon" \
    -H "Accept: application/toon" \
    -d "$toon_request")

# Verify response is in TOON format (starts with "success:")
if echo "$response" | grep -q "^success:"; then
    print_success "Response is in TOON format"
else
    test_fail "Expected TOON format response, got: $(echo "$response" | head -c 100)"
fi

# Verify successful auth
if echo "$response" | grep -q "success: true"; then
    print_success "TOON login successful"
else
    test_fail "TOON login failed"
fi

# Verify token is present
if echo "$response" | grep -q "token:"; then
    print_success "TOON response contains token"
else
    test_fail "TOON response missing token"
fi

print_success "TOON format functionality tests completed successfully"
