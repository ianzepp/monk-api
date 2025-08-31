#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Data API Record Update Test
# Tests updating records using the template's pre-loaded data

# Source helpers
source "$(dirname "$0")/../curl-helper.sh"
source "$(dirname "$0")/../helpers/test-tenant-helper.sh"

print_step "Testing Data API record updates"

# Wait for server to be ready
wait_for_server

# Setup test environment using fixtures template (includes sample data)
print_step "Creating test tenant from fixtures template"
tenant_name=$(create_test_tenant_from_template "update-record" "basic")
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

# Test 1: Get an existing account to update
print_step "Getting existing account for update testing"

accounts_response=$(auth_get "api/data/account")
assert_success "$accounts_response"

accounts_data=$(extract_data "$accounts_response")
first_account=$(echo "$accounts_data" | jq -r '.[0]')
account_id=$(echo "$first_account" | jq -r '.id')
original_name=$(echo "$first_account" | jq -r '.name')
original_balance=$(echo "$first_account" | jq -r '.balance')

print_success "Selected account for testing: $original_name (ID: $account_id, Balance: $original_balance)"

# Test 2: Update the account record
print_step "Testing PUT /api/data/account/$account_id"

# Create updated account data (only user-defined fields, no system fields)
updated_data='{
    "name": "Updated Test Account",
    "balance": 9999.99,
    "account_type": "premium",
    "is_verified": true
}'

update_response=$(auth_put "api/data/account/$account_id" "$updated_data")
assert_success "$update_response"

# Extract and verify the updated record
updated_record=$(extract_data "$update_response")
if [[ "$updated_record" == "null" ]]; then
    test_fail "Updated record data is null"
fi

# Verify the updates were applied
updated_name=$(echo "$updated_record" | jq -r '.name')
if [[ "$updated_name" == "Updated Test Account" ]]; then
    print_success "Name successfully updated: $updated_name"
else
    test_fail "Expected name 'Updated Test Account', got: '$updated_name'"
fi

updated_balance=$(echo "$updated_record" | jq -r '.balance')
if [[ "$updated_balance" == "9999.99" ]]; then
    print_success "Balance successfully updated: $updated_balance"
else
    test_fail "Expected balance '9999.99', got: '$updated_balance'"
fi

updated_type=$(echo "$updated_record" | jq -r '.account_type')
if [[ "$updated_type" == "premium" ]]; then
    print_success "Account type successfully updated: $updated_type"
else
    test_fail "Expected account_type 'premium', got: '$updated_type'"
fi

updated_verified=$(echo "$updated_record" | jq -r '.is_verified')
if [[ "$updated_verified" == "true" ]]; then
    print_success "Verification status successfully updated: $updated_verified"
else
    test_fail "Expected is_verified 'true', got: '$updated_verified'"
fi

# Test 3: Verify updated_at timestamp changed
print_step "Verifying system timestamps updated"

original_created_at=$(echo "$first_account" | jq -r '.created_at')
updated_created_at=$(echo "$updated_record" | jq -r '.created_at')
updated_at=$(echo "$updated_record" | jq -r '.updated_at')

if [[ "$updated_created_at" == "$original_created_at" ]]; then
    print_success "created_at timestamp preserved: $updated_created_at"
else
    test_fail "created_at should not change during update"
fi

if [[ "$updated_at" != "$original_created_at" ]]; then
    print_success "updated_at timestamp changed: $updated_at"
else
    test_fail "updated_at timestamp should change during update"
fi

# Test 4: Verify record persistence with GET
print_step "Testing GET /api/data/account/$account_id to verify update persistence"

verify_response=$(auth_get "api/data/account/$account_id")
assert_success "$verify_response"

verify_data=$(extract_data "$verify_response")
verify_name=$(echo "$verify_data" | jq -r '.name')
verify_balance=$(echo "$verify_data" | jq -r '.balance')

if [[ "$verify_name" == "Updated Test Account" && "$verify_balance" == "9999.99" ]]; then
    print_success "Updates persisted correctly: $verify_name, balance $verify_balance"
else
    test_fail "Updates not persisted - name: '$verify_name', balance: '$verify_balance'"
fi

# Test 5: Test updating non-existent record
print_step "Testing PUT /api/data/account/00000000-0000-0000-0000-000000000000"

nonexistent_update=$(auth_put "api/data/account/00000000-0000-0000-0000-000000000000" "$updated_data" || echo '{"success":false}')
if echo "$nonexistent_update" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent record update properly returns error"
else
    test_fail "Expected error for non-existent record update: $nonexistent_update"
fi

print_success "Data API record update tests completed successfully"