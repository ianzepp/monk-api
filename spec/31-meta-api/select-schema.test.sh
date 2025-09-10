#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Schema Selection Test
# Tests retrieving schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema selection"

# Setup test environment with template and admin authentication
setup_test_with_template "select-schema"
setup_admin_auth

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
schema_title=$(echo "$schema_data" | jq -r '.title')
if [[ "$schema_title" == "Account" ]]; then
    print_success "Account schema retrieved with correct title: $schema_title"
else
    test_fail "Expected title 'Account', got: '$schema_title'"
fi

# Check for key properties
if echo "$schema_data" | jq -e '.properties.email' >/dev/null; then
    print_success "Schema contains expected 'email' property"
else
    test_fail "Schema missing expected 'email' property"
fi

if echo "$schema_data" | jq -e '.properties.name' >/dev/null; then
    print_success "Schema contains expected 'name' property"
else
    test_fail "Schema missing expected 'name' property"
fi

# Test 2: Get contact schema from template
print_step "Testing GET /api/describe/contact"

contact_response=$(auth_get "api/describe/contact")
assert_success "$contact_response"

contact_schema=$(extract_data "$contact_response")
contact_title=$(echo "$contact_schema" | jq -r '.title')

if [[ "$contact_title" == "Contact" ]]; then
    print_success "Contact schema retrieved with correct title: $contact_title"
else
    test_fail "Expected title 'Contact', got: '$contact_title'"
fi

# Verify contact-specific properties
if echo "$contact_schema" | jq -e '.properties.company' >/dev/null; then
    print_success "Contact schema contains expected 'company' property"
else
    test_fail "Contact schema missing expected 'company' property"
fi

if echo "$contact_schema" | jq -e '.properties.status' >/dev/null; then
    print_success "Contact schema contains expected 'status' property"
else
    test_fail "Contact schema missing expected 'status' property"
fi

# Test 3: Test non-existent schema
test_nonexistent_schema "get"

# Test 4: Verify required fields are present
print_step "Verifying schema required fields"

account_required=$(echo "$schema_data" | jq -r '.required[]')
if echo "$account_required" | grep -q "email"; then
    print_success "Account schema has required 'email' field"
else
    test_fail "Account schema missing required 'email' field"
fi

contact_required=$(echo "$contact_schema" | jq -r '.required[]')
if echo "$contact_required" | grep -q "name"; then
    print_success "Contact schema has required 'name' field"
else
    test_fail "Contact schema missing required 'name' field"
fi

print_success "Describe API schema selection tests completed successfully"
