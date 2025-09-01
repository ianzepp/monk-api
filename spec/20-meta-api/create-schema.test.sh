#!/usr/bin/env bash
set -e

# Meta API Schema Creation Test
# Tests creating a new schema using the account.json definition

# Source helpers
source "$(dirname "$0")/../curl-helper.sh"
source "$(dirname "$0")/../helpers/test-tenant-helper.sh"

print_step "Testing Meta API schema creation"

# Wait for server to be ready
wait_for_server

# Setup isolated test environment
print_step "Creating isolated test tenant"
setup_isolated_test

# Authenticate with admin user (has schema creation privileges)
print_step "Setting up authentication for admin user"
JWT_TOKEN=$(get_user_token "$TEST_TENANT_NAME" "admin")

if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
    print_success "Admin authentication configured"
    export JWT_TOKEN
else
    test_fail "Failed to authenticate admin user"
fi

# Test 1: Create schema using account.json
print_step "Testing POST /api/meta/account"

# Read the account schema file
if [[ ! -f "spec/account.json" ]]; then
    test_fail "Required file spec/account.json not found"
fi

account_schema=$(cat spec/account.json)

# Create the schema
response=$(auth_post "api/meta/account" "$account_schema")

# Verify successful creation
assert_success "$response"
assert_has_field "data.name" "$response"
assert_has_field "data.created" "$response"

# Check that the correct schema name is returned
schema_name=$(echo "$response" | jq -r '.data.name')
if [[ "$schema_name" == "account" ]]; then
    print_success "Schema created with correct name: $schema_name"
else
    test_fail "Expected schema name 'account', got: $schema_name"
fi

# Verify operation confirmation
created_status=$(echo "$response" | jq -r '.data.created')
if [[ "$created_status" == "true" ]]; then
    print_success "Schema creation confirmed: $created_status"
else
    test_fail "Expected created status 'true', got: $created_status"
fi

print_success "Schema creation successful - API returned operation result"

# Test 2: Verify schema exists by retrieving it
print_step "Testing GET /api/meta/account to verify creation"

get_response=$(auth_get "api/meta/account")
assert_success "$get_response"

# Extract and parse the schema JSON using the helper function
schema_json=$(extract_data "$get_response")
if [[ "$schema_json" == "null" ]]; then
    test_fail "Schema data is null in GET response"
fi

# Verify essential properties exist
retrieved_title=$(echo "$schema_json" | jq -r '.title')
if [[ "$retrieved_title" == "Account" ]]; then
    print_success "Schema successfully retrieved with title: $retrieved_title"
else
    test_fail "Expected title 'Account', got: $retrieved_title"
fi

# Check for key properties
if echo "$schema_json" | jq -e '.properties.email' >/dev/null; then
    print_success "Schema contains expected 'email' property"
else
    test_fail "Schema missing expected 'email' property"
fi

if echo "$schema_json" | jq -e '.properties.name' >/dev/null; then
    print_success "Schema contains expected 'name' property"
else
    test_fail "Schema missing expected 'name' property"
fi

if echo "$schema_json" | jq -e '.properties.account_type' >/dev/null; then
    print_success "Schema contains expected 'account_type' property"
else
    test_fail "Schema missing expected 'account_type' property"
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
print_step "Testing duplicate schema creation"

duplicate_response=$(auth_post "api/meta/account" "$account_schema" || echo '{"success":false}')
if echo "$duplicate_response" | jq -e '.success == false' >/dev/null; then
    print_success "Duplicate schema creation properly rejected"
else
    print_warning "Duplicate schema creation did not fail as expected"
fi

print_success "Meta API schema creation tests completed successfully"