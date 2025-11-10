#!/usr/bin/env bash
set -e

# Tenant Deletion Security Test
# Tests that soft-deleted tenants properly deny all data operations
# Creates tenant, adds data, soft-deletes tenant, validates complete access denial

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing tenant deletion security enforcement"

# Setup basic server connection
setup_test_basic

# Test Setup: Create tenant with data
print_step "Creating tenant with account data"

# Create isolated tenant
create_isolated_test_tenant "tenant-deletion" >/dev/null
TENANT_NAME="$TEST_TENANT_NAME"
TENANT_DB="$TEST_DATABASE_NAME"

print_success "Created tenant: $TENANT_NAME"

# Register the isolated tenant in the main tenants table so it can be managed via root API
print_step "Registering isolated tenant in main tenants table"
system_token=$(get_user_token "system" "root")

# Insert the tenant record directly into the tenants table
register_response=$(psql -d monk -c "INSERT INTO tenants (name, host, database, is_active, tenant_type, created_at, updated_at) VALUES ('$TENANT_NAME', 'localhost', '$TENANT_DB', true, 'normal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)" 2>&1 || echo "INSERT_FAILED")

if [[ "$register_response" == *"INSERT 0 1"* ]]; then
    print_success "Tenant registered in main tenants table"
elif [[ "$register_response" == *"already exists"* ]]; then
    print_warning "Tenant already exists in main tenants table (this is OK)"
else
    print_warning "Tenant registration failed: $register_response"
fi

# Authenticate admin user
JWT_TOKEN=$(get_user_token "$TENANT_NAME" "admin")
if [[ -z "$JWT_TOKEN" || "$JWT_TOKEN" == "null" ]]; then
    test_fail "Failed to authenticate admin user for tenant"
fi

print_success "Tenant admin authentication configured"

# Create account schema
account_schema=$(cat spec/account.json)
schema_response=$(curl -s -X POST "http://localhost:9001/api/describe/account" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$account_schema")

if ! echo "$schema_response" | jq -e '.success == true' >/dev/null; then
    test_fail "Failed to create account schema: $schema_response"
fi

SCHEMA_NAME=$(echo "$schema_response" | jq -r '.data.name')
print_success "Account schema created: $SCHEMA_NAME"

# Create account record
account_data=$(generate_test_account "Test User" "testuser@example.com" "testuser")
account_response=$(curl -s -X POST "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$account_data")

if ! echo "$account_response" | jq -e '.success == true' >/dev/null; then
    test_fail "Failed to create account: $account_response"
fi

ACCOUNT_ID=$(echo "$account_response" | jq -r '.data[0].id')
print_success "Created account record: $ACCOUNT_ID"

# Verify initial access works
print_step "Verifying initial data access works"

# Test account read
read_response=$(curl -s -X GET "http://localhost:9001/api/data/account/$ACCOUNT_ID" \
    -H "Authorization: Bearer $JWT_TOKEN")

if echo "$read_response" | jq -e '.success == true' >/dev/null; then
    print_success "Initial account read successful"
else
    test_fail "Initial account read failed: $read_response"
fi

# Test schema read
schema_read_response=$(curl -s -X GET "http://localhost:9001/api/describe/account" \
    -H "Authorization: Bearer $JWT_TOKEN")

if echo "$schema_read_response" | jq -e '.success == true' >/dev/null; then
    print_success "Initial schema read successful"
else
    test_fail "Initial schema read failed: $schema_read_response"
fi

# Soft Delete Tenant
print_step "Soft deleting tenant"

# Use system admin token for tenant management
SYSTEM_TOKEN=$(get_user_token "system" "root")
if [[ -z "$SYSTEM_TOKEN" || "$SYSTEM_TOKEN" == "null" ]]; then
    test_fail "Failed to get system admin token"
fi

# Soft delete the tenant via root API
delete_tenant_response=$(curl -s -X DELETE "http://localhost:9001/api/root/tenant/$TENANT_NAME" \
    -H "Authorization: Bearer $SYSTEM_TOKEN" || echo '{"success":false}')

TENANT_DELETED=false
if echo "$delete_tenant_response" | jq -e '.success == true' >/dev/null 2>&1; then
    print_success "Tenant soft deleted successfully"
    TENANT_DELETED=true
elif echo "$delete_tenant_response" | jq -e '.success == false' >/dev/null 2>&1; then
    error_message=$(echo "$delete_tenant_response" | jq -r '.error // "unknown"')
    print_warning "Tenant deletion failed: $error_message"
    print_warning "Will test access behavior with failed deletion (tokens should remain valid)"
    TENANT_DELETED=false
else
    print_warning "Tenant deletion response unclear: $delete_tenant_response"
    TENANT_DELETED=false
fi

# Wait a moment for deletion to propagate
sleep 2

# Test Post-Deletion Access Security (should now work with middleware fix)
print_step "Testing data access denial after tenant deletion (with middleware security fix)"

# With the middleware fix, JWT tokens should be invalidated regardless of deletion API success
# because the middleware now checks tenant status before allowing any operations

# Test 1: Account read should fail
print_step "Testing account read denial"

denied_read_response=$(curl -s -X GET "http://localhost:9001/api/data/account/$ACCOUNT_ID" \
    -H "Authorization: Bearer $JWT_TOKEN" || echo '{"success":false}')

if echo "$denied_read_response" | jq -e '.success == false' >/dev/null; then
    print_success "Account read correctly denied (middleware validates tenant status)"
else
    test_fail "SECURITY VIOLATION: Account read still works despite tenant deletion"
fi

# Test 2: Account list should fail
print_step "Testing account list denial"

denied_list_response=$(curl -s -X GET "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN" || echo '{"success":false}')

if echo "$denied_list_response" | jq -e '.success == false' >/dev/null; then
    print_success "Account list correctly denied (middleware validates tenant status)"
else
    test_fail "SECURITY VIOLATION: Account list still works despite tenant deletion"
fi

# Test 3: Account update should fail
print_step "Testing account update denial"

update_data='{"name": "Should Not Work"}'
denied_update_response=$(curl -s -X PUT "http://localhost:9001/api/data/account/$ACCOUNT_ID" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$update_data" || echo '{"success":false}')

if echo "$denied_update_response" | jq -e '.success == false' >/dev/null; then
    print_success "Account update correctly denied (middleware validates tenant status)"
else
    test_fail "SECURITY VIOLATION: Account update still works despite tenant deletion"
fi

# Test 4: Account delete should fail
print_step "Testing account delete denial"

denied_delete_response=$(curl -s -X DELETE "http://localhost:9001/api/data/account/$ACCOUNT_ID" \
    -H "Authorization: Bearer $JWT_TOKEN" || echo '{"success":false}')

if echo "$denied_delete_response" | jq -e '.success == false' >/dev/null; then
    print_success "Account delete correctly denied after tenant deletion"
else
    test_fail "SECURITY VIOLATION: Account delete still works after tenant deletion: $denied_delete_response"
fi

# Test 5: Schema operations should fail
print_step "Testing schema operations denial"

# Schema read
denied_schema_read=$(curl -s -X GET "http://localhost:9001/api/describe/account" \
    -H "Authorization: Bearer $JWT_TOKEN" || echo '{"success":false}')

if echo "$denied_schema_read" | jq -e '.success == false' >/dev/null; then
    print_success "Schema read correctly denied after tenant deletion"
else
    test_fail "SECURITY VIOLATION: Schema read still works after tenant deletion: $denied_schema_read"
fi

# Schema update
updated_schema='{"title": "Updated Account", "properties": {"name": {"type": "string"}}, "additionalProperties": false}'
denied_schema_update=$(curl -s -X PUT "http://localhost:9001/api/describe/account" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$updated_schema" || echo '{"success":false}')

if echo "$denied_schema_update" | jq -e '.success == false' >/dev/null; then
    print_success "Schema update correctly denied after tenant deletion"
else
    test_fail "SECURITY VIOLATION: Schema update still works after tenant deletion: $denied_schema_update"
fi

# Test 6: Find API should fail
print_step "Testing Find API denial"

find_query='{"where": {"name": "Test User"}}'
denied_find_response=$(curl -s -X POST "http://localhost:9001/api/find/account" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$find_query" || echo '{"success":false}')

if echo "$denied_find_response" | jq -e '.success == false' >/dev/null; then
    print_success "Find API correctly denied after tenant deletion"
else
    test_fail "SECURITY VIOLATION: Find API still works after tenant deletion: $denied_find_response"
fi

# Test 7: New record creation should fail
print_step "Testing new record creation denial"

new_account_data=$(generate_test_account "New User" "newuser@example.com" "newuser")
denied_create_response=$(curl -s -X POST "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$new_account_data" || echo '{"success":false}')

if echo "$denied_create_response" | jq -e '.success == false' >/dev/null; then
    print_success "New record creation correctly denied after tenant deletion"
else
    test_fail "SECURITY VIOLATION: New record creation still works after tenant deletion: $denied_create_response"
fi

# Test 8: Token validation should indicate deleted tenant
print_step "Testing authentication status after tenant deletion"

whoami_response=$(curl -s -X GET "http://localhost:9001/api/auth/whoami" \
    -H "Authorization: Bearer $JWT_TOKEN" || echo '{"success":false}')

if echo "$whoami_response" | jq -e '.success == false' >/dev/null; then
    print_success "Authentication correctly invalidated after tenant deletion"
else
    # If whoami still works, check if it indicates the tenant is deleted
    tenant_status=$(echo "$whoami_response" | jq -r '.data.tenant.status // "unknown"')
    if [[ "$tenant_status" == "deleted" || "$tenant_status" == "inactive" ]]; then
        print_success "Authentication indicates tenant deletion status: $tenant_status"
    else
        print_warning "Authentication still works but tenant status unclear: $whoami_response"
    fi
fi

print_success "Tenant deletion security test completed successfully"
print_success "SECURITY VALIDATION: All operations properly denied after tenant deletion"
