#!/usr/bin/env bash
set -e

# Describe API Schema Creation Test
# Tests creating a new schema using the account.json definition

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema creation"

# Setup test environment with empty template and authentication (full)
setup_test_with_template "create-schema" "empty"
setup_full_auth
setup_sudo_auth "Creating account schema for testing"

# Test 1: Create schema using account.json
print_step "Testing POST /api/describe/account"

# Read the account schema file
if [[ ! -f "spec/account.json" ]]; then
    test_fail "Required file spec/account.json not found"
fi

account_schema=$(cat spec/account.json)

# Create the schema (using sudo token for write operation)
response=$(sudo_post "api/describe/account" "$account_schema")
data=$(extract_and_validate_data "$response" "Schema creation result")

# Verify operation result fields
validate_record_fields "$data" "name" "created"

# Check that the correct schema name is returned
schema_name=$(echo "$data" | jq -r '.name')
if [[ "$schema_name" == "account" ]]; then
    print_success "Schema created with correct name: $schema_name"
else
    test_fail "Expected schema name 'account', got: $schema_name"
fi

# Verify operation confirmation
created_status=$(echo "$data" | jq -r '.created')
if [[ "$created_status" == "true" ]]; then
    print_success "Schema creation confirmed: $created_status"
else
    test_fail "Expected created status 'true', got: $created_status"
fi

print_success "Schema creation successful - API returned operation result"

# Test 2: Verify schema exists by retrieving it
print_step "Testing GET /api/describe/account to verify creation"

get_response=$(auth_get "api/describe/account")
schema_json=$(extract_and_validate_data "$get_response" "Retrieved schema data")

# Verify schema_name field exists
retrieved_name=$(echo "$schema_json" | jq -r '.schema_name')
if [[ "$retrieved_name" == "account" ]]; then
    print_success "Schema successfully retrieved with name: $retrieved_name"
else
    test_fail "Expected schema_name 'account', got: $retrieved_name"
fi

# Check for columns array using helper
validate_record_fields "$schema_json" "columns"

# Verify key columns exist in the columns array
if echo "$schema_json" | jq -e '.columns[] | select(.column_name == "email")' >/dev/null; then
    print_success "Schema contains expected 'email' column"
fi
if echo "$schema_json" | jq -e '.columns[] | select(.column_name == "name")' >/dev/null; then
    print_success "Schema contains expected 'name' column"
fi
if echo "$schema_json" | jq -e '.columns[] | select(.column_name == "account_type")' >/dev/null; then
    print_success "Schema contains expected 'account_type' column"
fi

# Test 3: Verify required fields are preserved
print_step "Verifying required field validation"

# Check required columns have required=true
if echo "$schema_json" | jq -e '.columns[] | select(.column_name == "email" and .required == true)' >/dev/null; then
    print_success "Required field 'email' preserved"
else
    test_fail "Required field 'email' not found or not marked as required"
fi

if echo "$schema_json" | jq -e '.columns[] | select(.column_name == "name" and .required == true)' >/dev/null; then
    print_success "Required field 'name' preserved"
else
    test_fail "Required field 'name' not found or not marked as required"
fi

# Test 4: Test duplicate schema creation (should fail)
# Note: Using sudo_post directly for error case
duplicate_response=$(sudo_post "api/describe/account" "$account_schema")
if echo "$duplicate_response" | jq -e '.success == false' >/dev/null; then
    print_success "Duplicate schema creation properly rejected"
else
    test_fail "Expected error when creating duplicate schema"
fi

print_success "Describe API schema creation tests completed successfully"
