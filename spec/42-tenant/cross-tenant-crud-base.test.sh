#!/usr/bin/env bash
set -e

# Cross-Tenant CRUD Isolation Test
# Tests that tenant isolation prevents cross-tenant data access
# Creates two tenants with accounts and validates complete isolation

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing cross-tenant CRUD isolation"

# Setup basic server connection
setup_test_basic

# Test Setup: Create Tenant A
print_step "Creating Tenant A with account record"

# Create first isolated tenant
create_isolated_test_tenant "cross-tenant-a" >/dev/null
TENANT_A_NAME="$TEST_TENANT_NAME"
TENANT_A_DB="$TEST_DATABASE_NAME"

print_success "Created Tenant A: $TENANT_A_NAME"

# Authenticate full user for Tenant A
JWT_TOKEN_A=$(get_user_token "$TENANT_A_NAME" "full")
if [[ -z "$JWT_TOKEN_A" || "$JWT_TOKEN_A" == "null" ]]; then
    test_fail "Failed to authenticate full user for Tenant A"
fi

print_success "Tenant A authentication (full) configured"

# Create account schema for Tenant A
account_schema_a=$(cat spec/account.json)
schema_response_a=$(curl -s -X POST "http://localhost:9001/api/describe/account" \
    -H "Authorization: Bearer $JWT_TOKEN_A" \
    -H "Content-Type: application/json" \
    -d "$account_schema_a")

if ! echo "$schema_response_a" | jq -e '.success == true' >/dev/null; then
    test_fail "Failed to create account schema for Tenant A: $schema_response_a"
fi

print_success "Account schema created for Tenant A"

# Create account record in Tenant A
account_data_a=$(generate_test_account "Tenant A User" "usera@example.com" "usera")
account_response_a=$(curl -s -X POST "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN_A" \
    -H "Content-Type: application/json" \
    -d "$account_data_a")

if ! echo "$account_response_a" | jq -e '.success == true' >/dev/null; then
    test_fail "Failed to create account for Tenant A: $account_response_a"
fi

ACCOUNT_A_ID=$(echo "$account_response_a" | jq -r '.data[0].id')
print_success "Created account in Tenant A: $ACCOUNT_A_ID"

# Test Setup: Create Tenant B
print_step "Creating Tenant B with account record"

# Create second isolated tenant
create_isolated_test_tenant "cross-tenant-b" >/dev/null
TENANT_B_NAME="$TEST_TENANT_NAME"
TENANT_B_DB="$TEST_DATABASE_NAME"

print_success "Created Tenant B: $TENANT_B_NAME"

# Authenticate full user for Tenant B
JWT_TOKEN_B=$(get_user_token "$TENANT_B_NAME" "full")
if [[ -z "$JWT_TOKEN_B" || "$JWT_TOKEN_B" == "null" ]]; then
    test_fail "Failed to authenticate full user for Tenant B"
fi

print_success "Tenant B authentication (full) configured"

# Create account schema for Tenant B
schema_response_b=$(curl -s -X POST "http://localhost:9001/api/describe/account" \
    -H "Authorization: Bearer $JWT_TOKEN_B" \
    -H "Content-Type: application/json" \
    -d "$account_schema_a")

if ! echo "$schema_response_b" | jq -e '.success == true' >/dev/null; then
    test_fail "Failed to create account schema for Tenant B: $schema_response_b"
fi

print_success "Account schema created for Tenant B"

# Create account record in Tenant B
account_data_b=$(generate_test_account "Tenant B User" "userb@example.com" "userb")
account_response_b=$(curl -s -X POST "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN_B" \
    -H "Content-Type: application/json" \
    -d "$account_data_b")

if ! echo "$account_response_b" | jq -e '.success == true' >/dev/null; then
    test_fail "Failed to create account for Tenant B: $account_response_b"
fi

ACCOUNT_B_ID=$(echo "$account_response_b" | jq -r '.data[0].id')
print_success "Created account in Tenant B: $ACCOUNT_B_ID"

# Cross-Tenant Isolation Tests
print_step "Testing cross-tenant isolation"

# Test 1: Tenant A cannot see Tenant B's account
print_step "Testing Tenant A cannot read Tenant B's account"

cross_read_response=$(curl -s -X GET "http://localhost:9001/api/data/account/$ACCOUNT_B_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_A" || echo '{"success":false}')

if echo "$cross_read_response" | jq -e '.success == false' >/dev/null; then
    print_success "Tenant A correctly cannot read Tenant B's account"
else
    test_fail "SECURITY VIOLATION: Tenant A can read Tenant B's account: $cross_read_response"
fi

# Test 2: Tenant B cannot see Tenant A's account
print_step "Testing Tenant B cannot read Tenant A's account"

cross_read_response_b=$(curl -s -X GET "http://localhost:9001/api/data/account/$ACCOUNT_A_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_B" || echo '{"success":false}')

if echo "$cross_read_response_b" | jq -e '.success == false' >/dev/null; then
    print_success "Tenant B correctly cannot read Tenant A's account"
else
    test_fail "SECURITY VIOLATION: Tenant B can read Tenant A's account: $cross_read_response_b"
fi

# Test 3: Tenant A cannot modify Tenant B's account
print_step "Testing Tenant A cannot update Tenant B's account"

update_data='{"name": "HACKED BY TENANT A"}'
cross_update_response=$(curl -s -X PUT "http://localhost:9001/api/data/account/$ACCOUNT_B_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_A" \
    -H "Content-Type: application/json" \
    -d "$update_data" || echo '{"success":false}')

if echo "$cross_update_response" | jq -e '.success == false' >/dev/null; then
    print_success "Tenant A correctly cannot update Tenant B's account"
else
    test_fail "SECURITY VIOLATION: Tenant A can update Tenant B's account: $cross_update_response"
fi

# Test 4: Tenant B cannot modify Tenant A's account
print_step "Testing Tenant B cannot update Tenant A's account"

update_data_b='{"name": "HACKED BY TENANT B"}'
cross_update_response_b=$(curl -s -X PUT "http://localhost:9001/api/data/account/$ACCOUNT_A_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_B" \
    -H "Content-Type: application/json" \
    -d "$update_data_b" || echo '{"success":false}')

if echo "$cross_update_response_b" | jq -e '.success == false' >/dev/null; then
    print_success "Tenant B correctly cannot update Tenant A's account"
else
    test_fail "SECURITY VIOLATION: Tenant B can update Tenant A's account: $cross_update_response_b"
fi

# Test 5: Tenant A cannot delete Tenant B's account
print_step "Testing Tenant A cannot delete Tenant B's account"

cross_delete_response=$(curl -s -X DELETE "http://localhost:9001/api/data/account/$ACCOUNT_B_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_A" || echo '{"success":false}')

if echo "$cross_delete_response" | jq -e '.success == false' >/dev/null; then
    print_success "Tenant A correctly cannot delete Tenant B's account"
else
    test_fail "SECURITY VIOLATION: Tenant A can delete Tenant B's account: $cross_delete_response"
fi

# Test 6: Tenant B cannot delete Tenant A's account
print_step "Testing Tenant B cannot delete Tenant A's account"

cross_delete_response_b=$(curl -s -X DELETE "http://localhost:9001/api/data/account/$ACCOUNT_A_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_B" || echo '{"success":false}')

if echo "$cross_delete_response_b" | jq -e '.success == false' >/dev/null; then
    print_success "Tenant B correctly cannot delete Tenant A's account"
else
    test_fail "SECURITY VIOLATION: Tenant B can delete Tenant A's account: $cross_delete_response_b"
fi

# Test 7: Verify accounts still exist in their own tenants
print_step "Verifying accounts still exist in their own tenants"

# Verify Tenant A's account still exists and is accessible by Tenant A
verify_a_response=$(curl -s -X GET "http://localhost:9001/api/data/account/$ACCOUNT_A_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_A")

if echo "$verify_a_response" | jq -e '.success == true' >/dev/null; then
    verify_a_name=$(echo "$verify_a_response" | jq -r '.data.name')
    print_success "Tenant A's account still accessible by Tenant A: $verify_a_name"
else
    test_fail "Tenant A cannot access its own account: $verify_a_response"
fi

# Verify Tenant B's account still exists and is accessible by Tenant B
verify_b_response=$(curl -s -X GET "http://localhost:9001/api/data/account/$ACCOUNT_B_ID" \
    -H "Authorization: Bearer $JWT_TOKEN_B")

if echo "$verify_b_response" | jq -e '.success == true' >/dev/null; then
    verify_b_name=$(echo "$verify_b_response" | jq -r '.data.name')
    print_success "Tenant B's account still accessible by Tenant B: $verify_b_name"
else
    test_fail "Tenant B cannot access its own account: $verify_b_response"
fi

# Test 8: List operations isolation
print_step "Testing list operations isolation"

# Tenant A should only see its own account
list_a_response=$(curl -s -X GET "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN_A")

if echo "$list_a_response" | jq -e '.success == true' >/dev/null; then
    list_a_count=$(echo "$list_a_response" | jq '.data | length')
    if [[ "$list_a_count" -eq 1 ]]; then
        print_success "Tenant A listing shows only its own account ($list_a_count record)"
    else
        test_fail "Tenant A listing shows $list_a_count records (expected 1)"
    fi
else
    test_fail "Tenant A cannot list its own accounts: $list_a_response"
fi

# Tenant B should only see its own account
list_b_response=$(curl -s -X GET "http://localhost:9001/api/data/account" \
    -H "Authorization: Bearer $JWT_TOKEN_B")

if echo "$list_b_response" | jq -e '.success == true' >/dev/null; then
    list_b_count=$(echo "$list_b_response" | jq '.data | length')
    if [[ "$list_b_count" -eq 1 ]]; then
        print_success "Tenant B listing shows only its own account ($list_b_count record)"
    else
        test_fail "Tenant B listing shows $list_b_count records (expected 1)"
    fi
else
    test_fail "Tenant B cannot list its own accounts: $list_b_response"
fi

print_success "Cross-tenant CRUD isolation test completed successfully"
print_success "SECURITY VALIDATION: Complete tenant isolation confirmed"
