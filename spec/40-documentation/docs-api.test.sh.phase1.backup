#!/usr/bin/env bash
set -e

# Documentation API Test
# Tests self-documenting API endpoints for all available APIs

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing self-documenting API endpoints"

# Simple setup for documentation testing
setup_test_basic

# Test public auth documentation
print_step "Testing GET /docs/public-auth"
public_auth_docs=$(api_get "docs/public-auth")

# Verify it's markdown content
if echo "$public_auth_docs" | grep -q "# Public Authentication API"; then
    print_success "Public auth documentation retrieved"
else
    test_fail "Public auth documentation invalid or missing"
fi

# Test protected auth documentation  
print_step "Testing GET /docs/auth"
auth_docs=$(api_get "docs/auth")

if echo "$auth_docs" | grep -q "# Protected Auth API"; then
    print_success "Protected auth documentation retrieved"
else
    test_fail "Protected auth documentation invalid or missing"
fi

# Test data API documentation
print_step "Testing GET /docs/data"
data_docs=$(api_get "docs/data")

if echo "$data_docs" | grep -q "# Data API"; then
    print_success "Data API documentation retrieved"
else
    test_fail "Data API documentation invalid or missing"  
fi

# Test file API documentation
print_step "Testing GET /docs/file"
file_docs=$(api_get "docs/file")

if echo "$file_docs" | grep -q "# File API"; then
    print_success "File API documentation retrieved"
else
    test_fail "File API documentation invalid or missing"
fi

# Test root API documentation
print_step "Testing GET /docs/root"
root_docs=$(api_get "docs/root")

if echo "$root_docs" | grep -q "# Root API"; then
    print_success "Root API documentation retrieved"
else
    test_fail "Root API documentation invalid or missing"
fi

# Test invalid API documentation
print_step "Testing GET /docs/invalid-api"
invalid_response=$(api_get_with_status "docs/invalid-api")
if [[ "$invalid_response" =~ HTTP_STATUS:404$ ]]; then
    print_success "Invalid API documentation properly returns 404"
else
    test_fail "Invalid API should return 404: $invalid_response"
fi

print_success "Documentation API tests completed successfully"