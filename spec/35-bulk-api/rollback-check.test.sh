#!/usr/bin/env bash
set -e

# Bulk API Transaction Rollback Test
# Tests that failed operations trigger complete rollback of all operations

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Bulk API transaction rollback behavior"

# Setup test environment with template (includes account schema)
setup_test_with_template "rollback-check"
setup_admin_auth

# Get initial record count for baseline
print_step "Getting baseline account count"

initial_response=$(auth_get "api/data/account")
initial_data=$(extract_and_validate_data "$initial_response" "Initial accounts")
initial_count=$(echo "$initial_data" | jq 'length')

print_success "Initial account count: $initial_count"

# Test 1: Transaction rollback with validation failure
print_step "Testing rollback with validation failure (invalid email)"

# Bulk request: 2 valid creates + 1 invalid create (should rollback all)
rollback_request='{
    "operations": [
        {
            "operation": "create-all",
            "schema": "account",
            "data": [
                {
                    "name": "Should Rollback 1",
                    "email": "rollback1@example.com",
                    "username": "rollback1",
                    "account_type": "personal",
                    "balance": 100.0,
                    "is_active": true,
                    "is_verified": false
                }
            ]
        },
        {
            "operation": "create-all", 
            "schema": "account",
            "data": [
                {
                    "name": "Should Rollback 2",
                    "email": "rollback2@example.com",
                    "username": "rollback2",
                    "account_type": "business",
                    "balance": 200.0,
                    "is_active": true,
                    "is_verified": true
                }
            ]
        },
        {
            "operation": "create-all",
            "schema": "account", 
            "data": [
                {
                    "name": "Invalid Record",
                    "email": "INVALID_EMAIL_FORMAT",
                    "username": "invalid",
                    "account_type": "invalid_type_should_fail",
                    "balance": -999,
                    "is_active": true,
                    "is_verified": false
                }
            ]
        }
    ]
}'

response=$(auth_post "api/bulk" "$rollback_request" || echo '{"success":false}')

# Verify the bulk operation failed
if echo "$response" | jq -e '.success == false' >/dev/null; then
    print_success "Bulk operation correctly failed due to invalid data"
    
    error_message=$(echo "$response" | jq -r '.error // "unknown"')
    print_success "Error captured: $error_message"
else
    test_fail "Expected bulk operation to fail with invalid data: $response"
fi

# Test 2: Verify rollback - no records should have been created
print_step "Verifying transaction rollback (no records created)"

after_failure_response=$(auth_get "api/data/account")
after_failure_data=$(extract_and_validate_data "$after_failure_response" "Accounts after failure")
after_failure_count=$(echo "$after_failure_data" | jq 'length')

if [[ "$after_failure_count" -eq "$initial_count" ]]; then
    print_success "ROLLBACK VERIFIED: Account count unchanged ($after_failure_count = $initial_count)"
else
    test_fail "ROLLBACK FAILED: Account count changed from $initial_count to $after_failure_count"
fi

# Verify specific records were not created
rollback_found=$(echo "$after_failure_data" | jq --arg name "Should Rollback 1" 'map(select(.name == $name)) | length')
if [[ "$rollback_found" -eq 0 ]]; then
    print_success "First record correctly rolled back (not found in database)"
else
    test_fail "ROLLBACK FAILED: First record was created despite transaction failure"
fi

rollback2_found=$(echo "$after_failure_data" | jq --arg name "Should Rollback 2" 'map(select(.name == $name)) | length')
if [[ "$rollback2_found" -eq 0 ]]; then
    print_success "Second record correctly rolled back (not found in database)"
else
    test_fail "ROLLBACK FAILED: Second record was created despite transaction failure"
fi

# Test 3: Verify successful operations work normally
print_step "Testing successful bulk operations (no rollback needed)"

success_request='{
    "operations": [
        {
            "operation": "create-all",
            "schema": "account",
            "data": [
                {
                    "name": "Success User 1",
                    "email": "success1@example.com", 
                    "username": "success1",
                    "account_type": "personal",
                    "balance": 300.0,
                    "is_active": true,
                    "is_verified": false
                },
                {
                    "name": "Success User 2",
                    "email": "success2@example.com",
                    "username": "success2", 
                    "account_type": "premium",
                    "balance": 400.0,
                    "is_active": true,
                    "is_verified": true
                }
            ]
        }
    ]
}'

success_response=$(auth_post "api/bulk" "$success_request")

if echo "$success_response" | jq -e '.success == true' >/dev/null; then
    print_success "Successful bulk operation completed"
    
    # Verify records were actually created
    after_success_response=$(auth_get "api/data/account")
    after_success_data=$(extract_and_validate_data "$after_success_response" "Accounts after success")
    after_success_count=$(echo "$after_success_data" | jq 'length')
    
    expected_count=$((initial_count + 2))
    if [[ "$after_success_count" -eq "$expected_count" ]]; then
        print_success "SUCCESS VERIFIED: Account count increased by 2 ($after_success_count = $initial_count + 2)"
    else
        test_fail "SUCCESS INCOMPLETE: Expected $expected_count accounts, got $after_success_count"
    fi
    
    # Verify specific records exist
    success1_found=$(echo "$after_success_data" | jq --arg name "Success User 1" 'map(select(.name == $name)) | length')
    success2_found=$(echo "$after_success_data" | jq --arg name "Success User 2" 'map(select(.name == $name)) | length')
    
    if [[ "$success1_found" -eq 1 && "$success2_found" -eq 1 ]]; then
        print_success "Both success records correctly created and persisted"
    else
        test_fail "Success records not found: User 1=$success1_found, User 2=$success2_found"
    fi
    
else
    test_fail "Expected successful bulk operation to succeed: $success_response"
fi

print_success "Bulk API transaction rollback test completed successfully"
print_success "ATOMICITY CONFIRMED: Failed operations rollback, successful operations commit"