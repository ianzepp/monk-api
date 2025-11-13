#!/usr/bin/env bash
set -e

# Documentation API Test
# Tests self-documenting API endpoints for all available APIs

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing self-documenting API endpoints"

# Simple setup for documentation testing
setup_test_basic

# Test auth documentation (merged public + protected)
print_step "Testing GET /docs/auth"
auth_docs=$(api_get "docs/auth")

if echo "$auth_docs" | grep -q "# Auth API"; then
    print_success "Auth documentation retrieved"
else
    test_fail "Auth documentation invalid or missing"
fi

# Verify it contains both public and protected sections
if echo "$auth_docs" | grep -q "POST /auth/login" && echo "$auth_docs" | grep -q "POST /api/auth/sudo"; then
    print_success "Auth documentation contains both public and protected endpoints"
else
    test_fail "Auth documentation missing public or protected sections"
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

# Test sudo API documentation
print_step "Testing GET /docs/sudo"
sudo_docs=$(api_get "docs/sudo")

if echo "$sudo_docs" | grep -q "# Sudo API"; then
    print_success "Sudo API documentation retrieved"
else
    test_fail "Sudo API documentation invalid or missing"
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