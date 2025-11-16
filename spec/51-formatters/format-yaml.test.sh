#!/usr/bin/env bash
set -e

# Format API YAML Test
# Tests YAML format encoding/decoding with POST /auth/login

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing YAML format functionality"

# Setup test environment
setup_test_without_template "format-yaml"

print_step "Testing YAML request and response"

# YAML format login request body
yaml_request='tenant: toon-test
username: root
format: yaml'

# Make request with YAML Content-Type and Accept headers
response=$(curl -s -X POST "http://localhost:${PORT}/auth/login" \
    -H "Content-Type: application/yaml" \
    -H "Accept: application/yaml" \
    -d "$yaml_request")

# Verify response is in YAML format (starts with "success:")
if echo "$response" | grep -q "^success:"; then
    print_success "Response is in YAML format"
else
    test_fail "Expected YAML format response, got: $(echo "$response" | head -c 100)"
fi

# Verify successful auth
if echo "$response" | grep -q "success: true"; then
    print_success "YAML login successful"
else
    test_fail "YAML login failed"
fi

# Verify token is present
if echo "$response" | grep -q "token:"; then
    print_success "YAML response contains token"
else
    test_fail "YAML response missing token"
fi

print_success "YAML format functionality tests completed successfully"
