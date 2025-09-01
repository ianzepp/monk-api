#!/usr/bin/env bash
set -e

# Bulk API Simple Create Test
# Tests basic bulk account creation with 1 operation containing 2 records

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Bulk API simple account creation"

# Setup test environment with template (includes account schema)
setup_test_with_template "create-accounts-simple"
setup_admin_auth

# Test: Create 2 accounts in single bulk operation
print_step "Testing bulk create with 2 accounts"

# Bulk request with object wrapper format (per fixed documentation)
bulk_request='{
    "operations": [
        {
            "operation": "createAll",
            "schema": "account",
            "data": [
                {
                    "name": "Bulk User 1",
                    "email": "bulk1@example.com",
                    "username": "bulk1",
                    "account_type": "personal",
                    "balance": 100.0,
                    "is_active": true,
                    "is_verified": false
                },
                {
                    "name": "Bulk User 2", 
                    "email": "bulk2@example.com",
                    "username": "bulk2",
                    "account_type": "business",
                    "balance": 250.0,
                    "is_active": true,
                    "is_verified": true
                }
            ]
        }
    ]
}'

response=$(auth_post "api/bulk" "$bulk_request")

# Check if bulk API is working
if echo "$response" | jq -e '.success == true' >/dev/null; then
    print_success "Bulk API request succeeded"
    
    # Extract operation result
    operation_result=$(echo "$response" | jq -r '.data[0]')
    operation_type=$(echo "$operation_result" | jq -r '.operation')
    result_data=$(echo "$operation_result" | jq -r '.result')
    
    print_success "Operation: $operation_type"
    
    # Verify 2 records were created
    record_count=$(echo "$result_data" | jq 'length')
    if [[ "$record_count" -eq 2 ]]; then
        print_success "Bulk create returned $record_count records"
    else
        test_fail "Expected 2 records, got: $record_count"
    fi
    
    # Verify record details
    user1_name=$(echo "$result_data" | jq -r '.[0].name')
    user2_name=$(echo "$result_data" | jq -r '.[1].name')
    
    if [[ "$user1_name" == "Bulk User 1" && "$user2_name" == "Bulk User 2" ]]; then
        print_success "Both records created correctly: $user1_name, $user2_name"
    else
        test_fail "Record names incorrect: $user1_name, $user2_name"
    fi
    
    # Test record IDs were generated
    user1_id=$(echo "$result_data" | jq -r '.[0].id')
    user2_id=$(echo "$result_data" | jq -r '.[1].id')
    
    if [[ -n "$user1_id" && "$user1_id" != "null" && -n "$user2_id" && "$user2_id" != "null" ]]; then
        print_success "Record IDs generated: $user1_id, $user2_id"
    else
        test_fail "Record IDs not generated properly"
    fi
    
else
    print_step "Bulk API request failed - analyzing error"
    error_message=$(echo "$response" | jq -r '.error // "unknown error"')
    error_code=$(echo "$response" | jq -r '.error_code // "unknown"')
    
    print_warning "Bulk API Error: $error_message (Code: $error_code)"
    print_warning "Full response: $response"
    
    # This indicates the bulk API is broken as suspected
    test_fail "Bulk API is not functional - needs implementation work"
fi

print_success "Bulk API simple create test completed"