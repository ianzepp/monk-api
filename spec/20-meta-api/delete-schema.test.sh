#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Meta API Schema Deletion Test  
# Tests deleting schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../curl-helper.sh"
source "$(dirname "$0")/../helpers/test-tenant-helper.sh"

print_step "Testing Meta API schema deletion"

# Wait for server to be ready
wait_for_server

# Setup test environment using fixtures template (includes account + contact schemas)
print_step "Creating test tenant from fixtures template"
tenant_name=$(create_test_tenant_from_template "delete-schema" "basic")
load_test_env

if [[ -z "$tenant_name" ]]; then
    test_fail "Template cloning failed - fixtures template required for this test"
fi

print_success "Test tenant cloned from template (includes account + contact schemas)"

# Authenticate with admin user
print_step "Setting up authentication for admin user"
JWT_TOKEN=$(get_user_token "$TEST_TENANT_NAME" "admin")

if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
    print_success "Admin authentication configured"
    export JWT_TOKEN
else
    test_fail "Failed to authenticate admin user"
fi

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
print_step "Testing DELETE /api/meta/nonexistent"

nonexistent_delete=$(auth_delete "api/meta/nonexistent" || echo '{"success":false}')
if echo "$nonexistent_delete" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent schema deletion properly returns error"
else
    test_fail "Expected error for non-existent schema deletion: $nonexistent_delete"
fi

# Test 6: Test deleting protected schema
print_step "Testing DELETE /api/meta/users (protected schema)"

protected_delete=$(auth_delete "api/meta/users" || echo '{"success":false}')
if echo "$protected_delete" | jq -e '.success == false' >/dev/null; then
    print_success "Protected schema deletion properly returns error"
else
    test_fail "Expected error for protected schema deletion: $protected_delete"
fi

print_success "Meta API schema deletion tests completed successfully"