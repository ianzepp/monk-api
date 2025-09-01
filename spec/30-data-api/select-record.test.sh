#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Data API Record Selection Test
# Tests retrieving records using the template's pre-loaded data

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Data API record selection"

# Setup test environment with template and admin authentication
setup_test_with_template "select-record"
setup_admin_auth

# Test 1: Get all accounts from template data
print_step "Testing GET /api/data/account (list all records)"

response=$(auth_get "api/data/account")
assert_success "$response"

# Extract and verify the account list
accounts_data=$(extract_data "$response")
if [[ "$accounts_data" == "null" ]]; then
    test_fail "No account data returned"
fi

# Check that we have the expected number of accounts from template
account_count=$(echo "$accounts_data" | jq 'length')
if [[ "$account_count" -eq 5 ]]; then
    print_success "Retrieved all accounts from template: $account_count records"
else
    test_fail "Expected 5 accounts from template, got: $account_count"
fi

# Get the first account for individual record testing
first_account_id=$(echo "$accounts_data" | jq -r '.[0].id')
first_account_name=$(echo "$accounts_data" | jq -r '.[0].name')

print_success "Sample account from template: $first_account_name (ID: $first_account_id)"

# Test 2: Get specific account by ID
print_step "Testing GET /api/data/account/$first_account_id (specific record)"

get_response=$(auth_get "api/data/account/$first_account_id")
assert_success "$get_response"

# Extract and verify the specific record
record_data=$(extract_data "$get_response")
if [[ "$record_data" == "null" ]]; then
    test_fail "Record data is null in response"
fi

retrieved_id=$(echo "$record_data" | jq -r '.id')
if [[ "$retrieved_id" == "$first_account_id" ]]; then
    print_success "Retrieved correct record by ID: $retrieved_id"
else
    test_fail "Expected ID '$first_account_id', got: '$retrieved_id'"
fi

retrieved_name=$(echo "$record_data" | jq -r '.name')
if [[ "$retrieved_name" == "$first_account_name" ]]; then
    print_success "Record has correct name: $retrieved_name"
else
    test_fail "Expected name '$first_account_name', got: '$retrieved_name'"
fi

# Test 3: Get all contacts from template data
print_step "Testing GET /api/data/contact (verify second schema)"

contact_response=$(auth_get "api/data/contact")
assert_success "$contact_response"

contacts_data=$(extract_data "$contact_response")
contact_count=$(echo "$contacts_data" | jq 'length')

if [[ "$contact_count" -eq 6 ]]; then
    print_success "Retrieved all contacts from template: $contact_count records"
else
    test_fail "Expected 6 contacts from template, got: $contact_count"
fi

# Sample contact verification
first_contact_name=$(echo "$contacts_data" | jq -r '.[0].name')
print_success "Sample contact from template: $first_contact_name"

# Test 4: Test non-existent record
print_step "Testing GET /api/data/account/00000000-0000-0000-0000-000000000000"

nonexistent_response=$(auth_get "api/data/account/00000000-0000-0000-0000-000000000000" || echo '{"success":false}')
if echo "$nonexistent_response" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent record properly returns error"
else
    test_fail "Expected error for non-existent record: $nonexistent_response"
fi

print_success "Data API record selection tests completed successfully"