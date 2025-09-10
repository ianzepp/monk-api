#!/usr/bin/env bash
set -e

# Describe API Schema Creation Test
# Tests creating a new schema using the account.json definition

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema creation"

# Setup isolated test environment and admin authentication
setup_test_isolated "create-schema"
setup_admin_auth

# Test 1: Create schema using account.json
print_step "Testing POST /api/meta/account"

# Read the account schema file
if [[ ! -f "spec/account.json" ]]; then
    test_fail "Required file spec/account.json not found"
fi

account_schema=$(cat spec/account.json)

# Create the schema
response=$(auth_post "api/meta/account" "$account_schema")
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
print_step "Testing GET /api/meta/account to verify creation"

get_response=$(auth_get "api/meta/account")
schema_json=$(extract_and_validate_data "$get_response" "Retrieved schema data")

# Verify essential properties exist
retrieved_title=$(echo "$schema_json" | jq -r '.title')
if [[ "$retrieved_title" == "Account" ]]; then
    print_success "Schema successfully retrieved with title: $retrieved_title"
else
    test_fail "Expected title 'Account', got: $retrieved_title"
fi

# Check for key properties using helper
validate_record_fields "$schema_json" "properties" "required"
if echo "$schema_json" | jq -e '.properties.email' >/dev/null; then
    print_success "Schema contains expected 'email' property"
fi
if echo "$schema_json" | jq -e '.properties.name' >/dev/null; then
    print_success "Schema contains expected 'name' property"  
fi
if echo "$schema_json" | jq -e '.properties.account_type' >/dev/null; then
    print_success "Schema contains expected 'account_type' property"
fi

# Test 3: Verify required fields are preserved
print_step "Verifying required field validation"

required_fields=$(echo "$schema_json" | jq -r '.required[]')
if echo "$required_fields" | grep -q "email"; then
    print_success "Required field 'email' preserved"
else
    test_fail "Required field 'email' not found in schema"
fi

if echo "$required_fields" | grep -q "name"; then
    print_success "Required field 'name' preserved"
else
    test_fail "Required field 'name' not found in schema"
fi

# Test 4: Test duplicate schema creation (should fail)
test_endpoint_error "POST" "api/meta/account" "$account_schema" "" "Duplicate schema creation"

print_success "Describe API schema creation tests completed successfully"