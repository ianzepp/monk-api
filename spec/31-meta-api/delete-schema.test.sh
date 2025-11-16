#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Schema Deletion Test
# Tests deleting schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema deletion"

# Setup test environment with template and authentication (full)
setup_test_with_template "delete-schema"
setup_full_auth
setup_sudo_auth "Deleting contact schema for testing"

# Test 1: Verify contact schema exists before deletion
print_step "Verifying contact schema exists before deletion"

pre_delete_response=$(auth_get "api/describe/contact")
assert_success "$pre_delete_response"

pre_delete_schema=$(extract_data "$pre_delete_response")
contact_name=$(echo "$pre_delete_schema" | jq -r '.schema_name')

if [[ "$contact_name" == "contact" ]]; then
    print_success "Contact schema exists and ready for deletion: $contact_name"
else
    test_fail "Expected contact schema, got: '$contact_name'"
fi

# Test 2: Delete the contact schema
print_step "Testing DELETE /api/describe/contact"

delete_response=$(sudo_delete "api/describe/contact")
assert_success "$delete_response"

# Verify deletion response
delete_data=$(extract_data "$delete_response")
deleted_name=$(echo "$delete_data" | jq -r '.name')
deleted_flag=$(echo "$delete_data" | jq -r '.deleted')

if [[ "$deleted_name" == "contact" ]]; then
    print_success "Delete operation returned correct schema name: $deleted_name"
else
    test_fail "Expected deleted name 'contact', got: '$deleted_name'"
fi

if [[ "$deleted_flag" == "true" ]]; then
    print_success "Delete operation confirmed: $deleted_flag"
else
    test_fail "Expected deleted=true, got: '$deleted_flag'"
fi

# Test 3: Verify schema no longer accessible
print_step "Testing GET /api/describe/contact (should fail after deletion)"

post_delete_response=$(auth_get "api/describe/contact" || echo '{"success":false}')
if echo "$post_delete_response" | jq -e '.success == false' >/dev/null; then
    print_success "Deleted schema properly returns error on access"
else
    test_fail "Expected error when accessing deleted schema: $post_delete_response"
fi

# Test 4: Verify account schema remains intact
print_step "Verifying other schemas remain intact"

account_response=$(auth_get "api/describe/account")
assert_success "$account_response"

account_schema=$(extract_data "$account_response")
account_name=$(echo "$account_schema" | jq -r '.schema_name')

if [[ "$account_name" == "account" ]]; then
    print_success "Account schema remains intact after contact deletion: $account_name"
else
    test_fail "Account schema affected by contact deletion: '$account_name'"
fi

# Test 5: Test deleting non-existent schema
test_nonexistent_schema "delete"

# Test 6: Test deleting non-existent schema
nonexistent_delete=$(sudo_delete "api/describe/nonexistent")
if echo "$nonexistent_delete" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent schema deletion properly rejected"
else
    test_fail "Expected error when deleting non-existent schema"
fi

print_success "Describe API schema deletion tests completed successfully"
