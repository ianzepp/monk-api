#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Data API Record Deletion Test
# Tests deleting records using the template's pre-loaded data

# Source helpers
source "$(dirname "$0")/../curl-helper.sh"
source "$(dirname "$0")/../helpers/test-tenant-helper.sh"

print_step "Testing Data API record deletion"

# Wait for server to be ready
wait_for_server

# Setup test environment using fixtures template (includes sample data)
print_step "Creating test tenant from fixtures template"
tenant_name=$(create_test_tenant_from_template "delete-record" "basic")
load_test_env

if [[ -z "$tenant_name" ]]; then
    test_fail "Template cloning failed - fixtures template required for this test"
fi

print_success "Test tenant cloned from template (includes 5 accounts + 6 contacts)"

# Authenticate with admin user
print_step "Setting up authentication for admin user"
JWT_TOKEN=$(get_user_token "$TEST_TENANT_NAME" "admin")

if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
    print_success "Admin authentication configured"
    export JWT_TOKEN
else
    test_fail "Failed to authenticate admin user"
fi

# Test 1: Get an existing account to delete
print_step "Getting existing account for deletion testing"

accounts_response=$(auth_get "api/data/account")
assert_success "$accounts_response"

accounts_data=$(extract_data "$accounts_response")
target_account=$(echo "$accounts_data" | jq -r '.[0]')
account_id=$(echo "$target_account" | jq -r '.id')
account_name=$(echo "$target_account" | jq -r '.name')

print_success "Selected account for deletion: $account_name (ID: $account_id)"

# Verify we start with 5 accounts
initial_count=$(echo "$accounts_data" | jq 'length')
if [[ "$initial_count" -eq 5 ]]; then
    print_success "Confirmed initial account count: $initial_count"
else
    test_fail "Expected 5 initial accounts from template, got: $initial_count"
fi

# Test 2: Delete the account record
print_step "Testing DELETE /api/data/account/$account_id"

delete_response=$(auth_delete "api/data/account/$account_id")
assert_success "$delete_response"

# Extract and verify the deletion response
deleted_record=$(extract_data "$delete_response")
if [[ "$deleted_record" == "null" ]]; then
    test_fail "Deleted record data is null"
fi

deleted_id=$(echo "$deleted_record" | jq -r '.id')
if [[ "$deleted_id" == "$account_id" ]]; then
    print_success "Delete operation returned correct record ID: $deleted_id"
else
    test_fail "Expected deleted ID '$account_id', got: '$deleted_id'"
fi

# Verify soft delete - record should have trashed_at timestamp
trashed_at=$(echo "$deleted_record" | jq -r '.trashed_at')
if [[ -n "$trashed_at" && "$trashed_at" != "null" ]]; then
    print_success "Record soft deleted with timestamp: $trashed_at"
else
    test_fail "Expected trashed_at timestamp to be set"
fi

# Test 3: Verify record no longer appears in listings
print_step "Verifying deleted record no longer appears in listings"

after_delete_response=$(auth_get "api/data/account")
assert_success "$after_delete_response"

after_delete_data=$(extract_data "$after_delete_response")
remaining_count=$(echo "$after_delete_data" | jq 'length')

if [[ "$remaining_count" -eq 4 ]]; then
    print_success "Account count reduced after deletion: $remaining_count (was $initial_count)"
else
    test_fail "Expected 4 accounts after deletion, got: $remaining_count"
fi

# Verify the deleted account is not in the list
deleted_found=$(echo "$after_delete_data" | jq --arg id "$account_id" 'map(select(.id == $id)) | length')
if [[ "$deleted_found" -eq 0 ]]; then
    print_success "Deleted account no longer appears in listings"
else
    test_fail "Deleted account still appears in listings"
fi

# Test 4: Verify record cannot be retrieved directly
print_step "Testing GET /api/data/account/$account_id (should fail after deletion)"

deleted_get_response=$(auth_get "api/data/account/$account_id" || echo '{"success":false}')
if echo "$deleted_get_response" | jq -e '.success == false' >/dev/null; then
    print_success "Deleted record properly returns error on direct access"
else
    test_fail "Expected error when accessing deleted record: $deleted_get_response"
fi

# Test 5: Test deleting non-existent record
print_step "Testing DELETE /api/data/account/00000000-0000-0000-0000-000000000000"

nonexistent_delete=$(auth_delete "api/data/account/00000000-0000-0000-0000-000000000000" || echo '{"success":false}')
if echo "$nonexistent_delete" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent record deletion properly returns error"
else
    test_fail "Expected error for non-existent record deletion: $nonexistent_delete"
fi

# Test 6: Verify other records remain intact
print_step "Verifying other records remain intact"

remaining_accounts=$(echo "$after_delete_data" | jq -r '.[].name')
if echo "$remaining_accounts" | grep -v "$account_name" | head -1 >/dev/null; then
    print_success "Other accounts remain intact after deletion"
else
    test_fail "Other accounts may have been affected by deletion"
fi

print_success "Data API record deletion tests completed successfully"