#!/usr/bin/env bash
# Note: Removed set -e to handle errors gracefully

# Meta API Schema Update Test
# Tests updating schemas using the template's pre-loaded schemas

# Source helpers
source "$(dirname "$0")/../curl-helper.sh"
source "$(dirname "$0")/../helpers/test-tenant-helper.sh"

print_step "Testing Meta API schema updates"

# Wait for server to be ready
wait_for_server

# Setup test environment using fixtures template (includes account + contact schemas)
print_step "Creating test tenant from fixtures template"
tenant_name=$(create_test_tenant_from_template "update-schema" "basic")
load_test_env

if [[ -z "$tenant_name" ]]; then
    test_fail "Template cloning failed - fixtures template required for this test"
fi

print_success "Test tenant cloned from template (includes account + contact schemas)"

# Authenticate with admin user
print_step "Setting up authentication for admin user"
JWT_TOKEN=$(get_user_token "$TEST_TENANT_NAME" "admin")

if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
    print_success "Admin authentication configured"
    export JWT_TOKEN
else
    test_fail "Failed to authenticate admin user"
fi

# Test 1: Get existing contact schema to update
print_step "Getting existing contact schema for update"

original_response=$(auth_get "api/meta/contact")
assert_success "$original_response"

original_schema=$(extract_data "$original_response")
original_title=$(echo "$original_schema" | jq -r '.title')

print_success "Retrieved contact schema: $original_title"

# Test 2: Update the contact schema (add new field)
print_step "Testing PUT /api/meta/contact (adding new field)"

# Create updated schema with additional field
updated_schema='{
    "title": "Contact",
    "description": "Updated customer contact management schema",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100,
            "description": "Contact full name"
        },
        "email": {
            "type": "string",
            "format": "email",
            "description": "Contact email address"
        },
        "phone": {
            "type": "string",
            "pattern": "^\\+?[1-9]\\d{1,14}$",
            "description": "Contact phone number"
        },
        "company": {
            "type": "string",
            "maxLength": 100,
            "description": "Company name"
        },
        "status": {
            "type": "string",
            "enum": ["active", "inactive", "prospect"],
            "default": "prospect",
            "description": "Contact status"
        },
        "notes": {
            "type": "string",
            "description": "Additional notes about the contact"
        },
        "priority": {
            "type": "string",
            "enum": ["low", "medium", "high"],
            "default": "medium",
            "description": "Contact priority level"
        }
    },
    "required": ["name", "email"],
    "additionalProperties": false
}'

update_response=$(auth_put "api/meta/contact" "$updated_schema")
assert_success "$update_response"

# Verify update response
update_data=$(extract_data "$update_response")
updated_name=$(echo "$update_data" | jq -r '.name')

if [[ "$updated_name" == "contact" ]]; then
    print_success "Schema update returned correct name: $updated_name"
else
    test_fail "Expected updated name 'contact', got: '$updated_name'"
fi

# Test 3: Verify schema was actually updated
print_step "Testing GET /api/meta/contact to verify update"

verify_response=$(auth_get "api/meta/contact")
assert_success "$verify_response"

updated_schema_data=$(extract_data "$verify_response")

# Check that new field was added
if echo "$updated_schema_data" | jq -e '.properties.priority' >/dev/null; then
    print_success "New 'priority' field successfully added to schema"
else
    test_fail "New 'priority' field not found in updated schema"
fi

# Check that description was updated
updated_description=$(echo "$updated_schema_data" | jq -r '.description')
if echo "$updated_description" | grep -q "Updated customer"; then
    print_success "Schema description successfully updated"
else
    test_fail "Schema description was not updated: '$updated_description'"
fi

# Verify existing fields are preserved
if echo "$updated_schema_data" | jq -e '.properties.email' >/dev/null; then
    print_success "Existing 'email' field preserved during update"
else
    test_fail "Existing 'email' field lost during update"
fi

if echo "$updated_schema_data" | jq -e '.properties.company' >/dev/null; then
    print_success "Existing 'company' field preserved during update"
else
    test_fail "Existing 'company' field lost during update"
fi

# Test 4: Test updating non-existent schema
print_step "Testing PUT /api/meta/nonexistent"

nonexistent_update=$(auth_put "api/meta/nonexistent" "$updated_schema" || echo '{"success":false}')
if echo "$nonexistent_update" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent schema update properly returns error"
else
    test_fail "Expected error for non-existent schema update: $nonexistent_update"
fi

# Test 5: Test updating protected schema
print_step "Testing PUT /api/meta/users (protected schema)"

protected_update=$(auth_put "api/meta/users" "$updated_schema" || echo '{"success":false}')
if echo "$protected_update" | jq -e '.success == false' >/dev/null; then
    print_success "Protected schema update properly returns error"
else
    test_fail "Expected error for protected schema update: $protected_update"
fi

print_success "Meta API schema update tests completed successfully"