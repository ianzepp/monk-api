#!/usr/bin/env bash
set -e

# API Discovery Test
# Tests the root endpoint for API discovery and documentation links

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing API discovery endpoint"

# Simple setup for public endpoint testing
setup_test_default

# Test root endpoint
print_step "Testing GET /"
response=$(api_get "")
assert_success "$response"
assert_has_field "data.name" "$response"
assert_has_field "data.endpoints" "$response"
assert_has_field "data.documentation" "$response"

print_success "Root endpoint responds with API catalog"

# Verify documentation structure
doc_auth=$(echo "$response" | jq -r '.data.documentation.auth // empty')
if [[ -z "$doc_auth" ]]; then
    test_fail "Missing auth documentation array"
fi

# Verify all expected APIs are documented
expected_apis=("auth" "data" "describe" "file" "bulk" "find" "sudo")
for api in "${expected_apis[@]}"; do
    if echo "$response" | jq -e ".data.documentation.$api" >/dev/null; then
        print_success "Documentation available for $api API"
    else
        print_error "Missing documentation for $api API"
    fi
done

print_success "API discovery test completed successfully"
