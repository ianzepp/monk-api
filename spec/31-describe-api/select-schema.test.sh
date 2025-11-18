#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Schema Selection Test
# Tests retrieving schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema selection"

# Setup test environment with template and authentication (full)
setup_test_with_template "select-schema"
setup_full_auth

# Test 1: Get account schema from template
print_step "Testing GET /api/describe/account"

response=$(auth_get "api/describe/account")
assert_success "$response"

# Extract and verify the schema
schema_data=$(extract_data "$response")
if [[ "$schema_data" == "null" ]]; then
    test_fail "Schema data is null in response"
fi

# Verify essential schema properties
schema_name=$(echo "$schema_data" | jq -r '.schema_name')
if [[ "$schema_name" == "account" ]]; then
    print_success "Account schema retrieved with correct name: $schema_name"
else
    test_fail "Expected schema_name 'account', got: '$schema_name'"
fi

# Check for key columns
if echo "$schema_data" | jq -e '.columns[] | select(.column_name == "email")' >/dev/null; then
    print_success "Schema contains expected 'email' column"
else
    test_fail "Schema missing expected 'email' column"
fi

if echo "$schema_data" | jq -e '.columns[] | select(.column_name == "name")' >/dev/null; then
    print_success "Schema contains expected 'name' column"
else
    test_fail "Schema missing expected 'name' column"
fi

# Test 2: Get contact schema from template
print_step "Testing GET /api/describe/contact"

contact_response=$(auth_get "api/describe/contact")
assert_success "$contact_response"

contact_schema=$(extract_data "$contact_response")
contact_name=$(echo "$contact_schema" | jq -r '.schema_name')

if [[ "$contact_name" == "contact" ]]; then
    print_success "Contact schema retrieved with correct name: $contact_name"
else
    test_fail "Expected schema_name 'contact', got: '$contact_name'"
fi

# Verify contact-specific columns
if echo "$contact_schema" | jq -e '.columns[] | select(.column_name == "company")' >/dev/null; then
    print_success "Contact schema contains expected 'company' column"
else
    test_fail "Contact schema missing expected 'company' column"
fi

if echo "$contact_schema" | jq -e '.columns[] | select(.column_name == "status")' >/dev/null; then
    print_success "Contact schema contains expected 'status' column"
else
    test_fail "Contact schema missing expected 'status' column"
fi

# Test 3: Test non-existent schema
test_nonexistent_schema "get"

# Test 4: Verify required fields are present
print_step "Verifying schema required fields"

if echo "$schema_data" | jq -e '.columns[] | select(.column_name == "email" and .required == true)' >/dev/null; then
    print_success "Account schema has required 'email' field"
else
    test_fail "Account schema missing required 'email' field"
fi

if echo "$contact_schema" | jq -e '.columns[] | select(.column_name == "name" and .required == true)' >/dev/null; then
    print_success "Contact schema has required 'name' field"
else
    test_fail "Contact schema missing required 'name' field"
fi

print_success "Describe API schema selection tests completed successfully"
