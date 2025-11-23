#!/usr/bin/env bash
set -e

# Data API Record Creation Test
# Tests creating a new record using the built-in users model

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Data API record creation"

# Setup test environment with template and authentication (full)
setup_test_with_template "create-record"
setup_full_auth

# Test 1: Create a new account record (model already exists from template)
print_step "Testing POST /api/data/account"

# Generate test account data using helper
account_data=$(generate_test_account "Test User" "testuser@example.com" "testuser123")

# Create the record
response=$(auth_post "api/data/account" "$account_data")
records_array=$(extract_and_validate_data "$response" "Created record data")

# Get the first record from the array
record_data=$(echo "$records_array" | jq -r '.[0]')
if [[ "$record_data" == "null" ]]; then
    test_fail "First record is null in response array"
fi

# Check that an ID was generated
record_id=$(echo "$record_data" | jq -r '.id')
if [[ -n "$record_id" && "$record_id" != "null" && "$record_id" != "" ]]; then
    print_success "Record created with ID: $record_id"
else
    test_fail "Expected record ID to be generated, got: $record_id"
fi

# Verify the record contains our input data
record_name=$(echo "$record_data" | jq -r '.name')
if [[ "$record_name" == "Test User" ]]; then
    print_success "Record contains correct name: $record_name"
else
    test_fail "Expected name 'Test User', got: $record_name"
fi

record_email=$(echo "$record_data" | jq -r '.email')
if [[ "$record_email" == "testuser@example.com" ]]; then
    print_success "Record contains correct email: $record_email"
else
    test_fail "Expected email 'testuser@example.com', got: $record_email"
fi

record_username=$(echo "$record_data" | jq -r '.username')
if [[ "$record_username" == "testuser123" ]]; then
    print_success "Record contains correct username: $record_username"
else
    test_fail "Expected username 'testuser123', got: $record_username"
fi

record_account_type=$(echo "$record_data" | jq -r '.account_type')
if [[ "$record_account_type" == "personal" ]]; then
    print_success "Record contains correct account_type: $record_account_type"
else
    test_fail "Expected account_type 'personal', got: $record_account_type"
fi

# Test 3: Verify record exists by retrieving it
print_step "Testing GET /api/data/account/$record_id to verify creation"

get_response=$(auth_get "api/data/account/$record_id")
retrieved_data=$(extract_and_validate_data "$get_response" "Retrieved record data")

retrieved_id=$(echo "$retrieved_data" | jq -r '.id')
if [[ "$retrieved_id" == "$record_id" ]]; then
    print_success "Retrieved record has matching ID: $retrieved_id"
else
    test_fail "Expected retrieved ID '$record_id', got: '$retrieved_id'"
fi

retrieved_name=$(echo "$retrieved_data" | jq -r '.name')
if [[ "$retrieved_name" == "Test User" ]]; then
    print_success "Retrieved record has correct name: $retrieved_name"
else
    test_fail "Expected retrieved name 'Test User', got: '$retrieved_name'"
fi

# Test 4: Verify system fields are automatically populated
print_step "Verifying system fields are populated"
validate_system_timestamps "$record_data"

# Note: Tenant isolation is handled at the database level, not in record fields

print_success "Data API record creation tests completed successfully"
