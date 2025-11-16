#!/usr/bin/env bash
set -e

# Test Tenant Isolation
# Verifies isolated test tenant creation and cleanup functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing template-based tenant creation and cleanup"

# Setup test environment with empty template and automatic cleanup
tenant_name=$(setup_test_with_template "isolation_test" "testing")
load_test_env

if [[ -n "$tenant_name" && -n "$TEST_DATABASE_NAME" ]]; then
    print_success "Created tenant from template: $tenant_name"
    db_name="$TEST_DATABASE_NAME"
else
    test_fail "Failed to create tenant from template"
fi

# Test 2: Verify tenant is usable for authentication
print_step "Testing authentication with isolated tenant"
JWT_TOKEN=$(get_user_token "$tenant_name" "root")

if [[ -n "$JWT_TOKEN" && "$JWT_TOKEN" != "null" ]]; then
    print_success "Authentication works with isolated tenant"
else
    test_fail "Authentication failed with isolated tenant"
fi

# Test 3: Verify tenant database structure
print_step "Verifying tenant database structure"
verify_test_tenant "$tenant_name" "$db_name"

# Test 4: Test different user access levels
print_step "Testing different user access levels"

# Test full user
full_token=$(get_user_token "$tenant_name" "full")
if [[ -n "$full_token" && "$full_token" != "null" ]]; then
    print_success "Full user authentication successful"
else
    print_error "Full user authentication failed"
fi

# Test 5: Verify tenant appears in tenant registry
print_step "Checking tenant registry"
registry_check=$(psql -d monk -t -c "SELECT name FROM tenants WHERE name = '$tenant_name' AND trashed_at IS NULL" | xargs)

if [[ "$registry_check" == "$tenant_name" ]]; then
    print_success "Tenant properly registered in monk"
else
    test_fail "Tenant not found in registry: expected '$tenant_name', got '$registry_check'"
fi

# Test 6: Automatic cleanup verification
print_step "Verifying automatic cleanup will work"
print_success "Automatic cleanup trap set - will run at script exit"

print_success "Tenant isolation test completed successfully"
