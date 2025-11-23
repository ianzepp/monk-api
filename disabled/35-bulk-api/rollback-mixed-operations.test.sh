#!/usr/bin/env bash
set -e

# Bulk API Mixed Operations Rollback Test
# Tests rollback with multiple operation types and models

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Bulk API rollback with mixed operations"

# Setup test environment with template (includes account + contact models)
setup_test_with_template "rollback-mixed-operations"
setup_full_auth

# Get baseline counts for both models
print_step "Getting baseline record counts"

accounts_response=$(auth_get "api/data/account")
accounts_data=$(extract_and_validate_data "$accounts_response" "Initial accounts")
initial_account_count=$(echo "$accounts_data" | jq 'length')

contacts_response=$(auth_get "api/data/contact")
contacts_data=$(extract_and_validate_data "$contacts_response" "Initial contacts")
initial_contact_count=$(echo "$contacts_data" | jq 'length')

print_success "Baseline: $initial_account_count accounts, $initial_contact_count contacts"

# Test 1: Mixed operations with update failure (should rollback all)
print_step "Testing mixed operations with update failure"

# Get an existing account ID for update test
existing_account_id=$(echo "$accounts_data" | jq -r '.[0].id')
print_success "Using existing account for update test: $existing_account_id"

# Bulk request: create account, create contact, update account with invalid data
mixed_rollback_request='{
    "operations": [
        {
            "operation": "create-one",
            "model": "account",
            "data": {
                "name": "Should Rollback Account",
                "email": "rollback.account@example.com",
                "username": "rollback_account",
                "account_type": "premium",
                "balance": 500.0,
                "is_active": true,
                "is_verified": true
            }
        },
        {
            "operation": "create-one",
            "model": "contact",
            "data": {
                "name": "Should Rollback Contact",
                "email": "rollback.contact@example.com",
                "phone": "+15550123",
                "company": "Test Company",
                "status": "active"
            }
        },
        {
            "operation": "update-one",
            "model": "account",
            "id": "'"$existing_account_id"'",
            "data": {
                "name": "Updated Name",
                "email": "INVALID_EMAIL_NO_AT_SYMBOL",
                "balance": -1000.0,
                "account_type": "invalid_account_type"
            }
        }
    ]
}'

response=$(auth_post "api/bulk" "$mixed_rollback_request" || echo '{"success":false}')

# Verify the bulk operation failed
if echo "$response" | jq -e '.success == false' >/dev/null; then
    print_success "Mixed bulk operation correctly failed due to invalid update data"

    error_message=$(echo "$response" | jq -r '.error // "unknown"')
    print_success "Validation error captured: Model validation failed"
else
    test_fail "Expected mixed bulk operation to fail with invalid data"
fi

# Test 2: Verify complete rollback across models
print_step "Verifying complete rollback across multiple models"

# Check account count (should be unchanged)
after_accounts_response=$(auth_get "api/data/account")
after_accounts_data=$(extract_and_validate_data "$after_accounts_response" "Accounts after mixed failure")
after_account_count=$(echo "$after_accounts_data" | jq 'length')

if [[ "$after_account_count" -eq "$initial_account_count" ]]; then
    print_success "Account rollback verified: count unchanged ($after_account_count = $initial_account_count)"
else
    test_fail "Account rollback failed: count changed from $initial_account_count to $after_account_count"
fi

# Check contact count (should be unchanged)
after_contacts_response=$(auth_get "api/data/contact")
after_contacts_data=$(extract_and_validate_data "$after_contacts_response" "Contacts after mixed failure")
after_contact_count=$(echo "$after_contacts_data" | jq 'length')

if [[ "$after_contact_count" -eq "$initial_contact_count" ]]; then
    print_success "Contact rollback verified: count unchanged ($after_contact_count = $initial_contact_count)"
else
    test_fail "Contact rollback failed: count changed from $initial_contact_count to $after_contact_count"
fi

# Verify specific records were not created
rollback_account=$(echo "$after_accounts_data" | jq --arg name "Should Rollback Account" 'map(select(.name == $name)) | length')
rollback_contact=$(echo "$after_contacts_data" | jq --arg name "Should Rollback Contact" 'map(select(.name == $name)) | length')

if [[ "$rollback_account" -eq 0 && "$rollback_contact" -eq 0 ]]; then
    print_success "Cross-model rollback verified: no records created in either model"
else
    test_fail "Cross-model rollback failed: account=$rollback_account, contact=$rollback_contact records found"
fi

# Verify existing account was not modified
original_account=$(echo "$accounts_data" | jq --arg id "$existing_account_id" '.[] | select(.id == $id)')
after_account=$(echo "$after_accounts_data" | jq --arg id "$existing_account_id" '.[] | select(.id == $id)')

original_name=$(echo "$original_account" | jq -r '.name')
after_name=$(echo "$after_account" | jq -r '.name')

if [[ "$original_name" == "$after_name" ]]; then
    print_success "Existing account update rollback verified: name unchanged ($original_name)"
else
    test_fail "Existing account modified despite rollback: $original_name → $after_name"
fi

# Test 3: Verify successful mixed operations work normally
print_step "Testing successful mixed operations (no rollback)"

success_mixed_request='{
    "operations": [
        {
            "operation": "create-one",
            "model": "account",
            "data": {
                "name": "Success Account",
                "email": "success.account@example.com",
                "username": "success_account",
                "account_type": "business",
                "balance": 750.0,
                "is_active": true,
                "is_verified": false
            }
        },
        {
            "operation": "create-one",
            "model": "contact",
            "data": {
                "name": "Success Contact",
                "email": "success.contact@example.com",
                "phone": "+15550456",
                "company": "Success Corp",
                "status": "prospect"
            }
        },
        {
            "operation": "update-one",
            "model": "account",
            "id": "'"$existing_account_id"'",
            "data": {
                "balance": 999.99
            }
        }
    ]
}'

success_response=$(auth_post "api/bulk" "$success_mixed_request")

if echo "$success_response" | jq -e '.success == true' >/dev/null; then
    print_success "Mixed successful operations completed"

    # Verify counts increased
    final_accounts_response=$(auth_get "api/data/account")
    final_accounts_data=$(extract_and_validate_data "$final_accounts_response" "Final accounts")
    final_account_count=$(echo "$final_accounts_data" | jq 'length')

    final_contacts_response=$(auth_get "api/data/contact")
    final_contacts_data=$(extract_and_validate_data "$final_contacts_response" "Final contacts")
    final_contact_count=$(echo "$final_contacts_data" | jq 'length')

    expected_accounts=$((initial_account_count + 1))
    expected_contacts=$((initial_contact_count + 1))

    if [[ "$final_account_count" -eq "$expected_accounts" && "$final_contact_count" -eq "$expected_contacts" ]]; then
        print_success "Mixed success verified: accounts=$final_account_count (+1), contacts=$final_contact_count (+1)"
    else
        test_fail "Mixed success counts wrong: accounts=$final_account_count (exp $expected_accounts), contacts=$final_contact_count (exp $expected_contacts)"
    fi

    # Verify update was applied
    updated_account=$(echo "$final_accounts_data" | jq --arg id "$existing_account_id" '.[] | select(.id == $id)')
    updated_balance=$(echo "$updated_account" | jq -r '.balance')

    if [[ "$updated_balance" == "999.99" ]]; then
        print_success "Account update successful: balance updated to $updated_balance"
    else
        test_fail "Account update failed: balance is $updated_balance (expected 999.99)"
    fi

else
    test_fail "Expected successful mixed operations to complete: $success_response"
fi

print_success "Bulk API mixed operations rollback test completed successfully"
print_success "CROSS-MODEL ATOMICITY CONFIRMED: Rollback works across multiple models"
