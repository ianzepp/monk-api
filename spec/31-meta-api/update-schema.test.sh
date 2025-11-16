#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Describe API Schema Update Test
# Tests updating schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Describe API schema updates"

# Setup test environment with template and authentication (full)
setup_test_with_template "update-schema"
setup_full_auth
setup_sudo_auth "Updating schema metadata and adding columns"

# Test 1: Get existing contact schema
print_step "Getting existing contact schema"

original_response=$(auth_get "api/describe/contact")
assert_success "$original_response"

original_schema=$(extract_data "$original_response")
original_name=$(echo "$original_schema" | jq -r '.schema_name')
original_status=$(echo "$original_schema" | jq -r '.status')

print_success "Retrieved contact schema: $original_name (status: $original_status)"

# Test 2: Update the schema metadata (status field)
print_step "Testing PUT /api/describe/contact (updating status)"

# Schema updates only support the 'status' field
update_payload=$(jq -n '{ "status": "active" }')

update_response=$(sudo_put "api/describe/contact" "$update_payload")
assert_success "$update_response"

# Verify update response
update_data=$(extract_data "$update_response")
updated_status=$(echo "$update_data" | jq -r '.status')

if [[ "$updated_status" == "active" ]]; then
    print_success "Schema status updated to: $updated_status"
else
    test_fail "Expected updated status 'active', got: '$updated_status'"
fi

# Test 3: Verify schema metadata was updated
print_step "Testing GET /api/describe/contact to verify metadata update"

verify_response=$(auth_get "api/describe/contact")
assert_success "$verify_response"

updated_schema_data=$(extract_data "$verify_response")
verified_status=$(echo "$updated_schema_data" | jq -r '.status')

if [[ "$verified_status" == "active" ]]; then
    print_success "Schema status persisted: $verified_status"
else
    test_fail "Expected persisted status 'active', got: '$verified_status'"
fi

# Verify existing columns are preserved
if echo "$updated_schema_data" | jq -e '.columns[] | select(.column_name == "email")' >/dev/null; then
    print_success "Existing 'email' column preserved during update"
else
    test_fail "Existing 'email' column lost during update"
fi

if echo "$updated_schema_data" | jq -e '.columns[] | select(.column_name == "company")' >/dev/null; then
    print_success "Existing 'company' column preserved during update"
else
    test_fail "Existing 'company' column lost during update"
fi

# Test 4: Add a new column using column endpoint
print_step "Testing POST /api/describe/contact/priority (adding new column)"

priority_column=$(jq -n '{
    "type": "text",
    "enum_values": ["low", "medium", "high"],
    "default_value": "medium",
    "description": "Contact priority level"
}')

column_response=$(sudo_post "api/describe/contact/priority" "$priority_column")
assert_success "$column_response"

# Verify the new column was added
column_verify_response=$(auth_get "api/describe/contact")
column_verify_data=$(extract_data "$column_verify_response")

if echo "$column_verify_data" | jq -e '.columns[] | select(.column_name == "priority")' >/dev/null; then
    print_success "New 'priority' column successfully added"
else
    test_fail "New 'priority' column not found after creation"
fi

# Test 5: Test updating non-existent schema
status_update='{"status": "active"}'
nonexistent_response=$(sudo_put "api/describe/nonexistent" "$status_update")
if echo "$nonexistent_response" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent schema update properly rejected"
else
    test_fail "Expected error when updating non-existent schema"
fi

print_success "Describe API schema update tests completed successfully"
