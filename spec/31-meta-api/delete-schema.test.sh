#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Schema Deletion Test  
# Tests deleting schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema deletion"

# Setup test environment with template and admin authentication
setup_test_with_template "delete-schema"
setup_admin_auth

# Test 1: Verify contact schema exists before deletion
print_step "Verifying contact schema exists before deletion"

pre_delete_response=$(auth_get "api/meta/contact")
assert_success "$pre_delete_response"

pre_delete_schema=$(extract_data "$pre_delete_response")
contact_title=$(echo "$pre_delete_schema" | jq -r '.title')

if [[ "$contact_title" == "Contact" ]]; then
    print_success "Contact schema exists and ready for deletion: $contact_title"
else
    test_fail "Expected Contact schema, got: '$contact_title'"
fi

# Test 2: Delete the contact schema
print_step "Testing DELETE /api/meta/contact"

delete_response=$(auth_delete "api/meta/contact")
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
print_step "Testing GET /api/meta/contact (should fail after deletion)"

post_delete_response=$(auth_get "api/meta/contact" || echo '{"success":false}')
if echo "$post_delete_response" | jq -e '.success == false' >/dev/null; then
    print_success "Deleted schema properly returns error on access"
else
    test_fail "Expected error when accessing deleted schema: $post_delete_response"
fi

# Test 4: Verify account schema remains intact
print_step "Verifying other schemas remain intact"

account_response=$(auth_get "api/meta/account")
assert_success "$account_response"

account_schema=$(extract_data "$account_response")
account_title=$(echo "$account_schema" | jq -r '.title')

if [[ "$account_title" == "Account" ]]; then
    print_success "Account schema remains intact after contact deletion: $account_title"
else
    test_fail "Account schema affected by contact deletion: '$account_title'"
fi

# Test 5: Test deleting non-existent schema
test_nonexistent_schema "delete"

# Test 6: Test deleting protected schema
test_endpoint_error "DELETE" "api/meta/users" "" "SCHEMA_PROTECTED" "Protected schema deletion"

print_success "Describe API schema deletion tests completed successfully"