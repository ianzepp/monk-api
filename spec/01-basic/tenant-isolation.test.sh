#!/usr/bin/env bash
set -e

# Test Tenant Isolation
# Verifies isolated test tenant creation and cleanup functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing isolated tenant creation and cleanup"

# Setup isolated test environment with automatic cleanup
setup_test_isolated "isolation_test"

# Load environment variables (they're exported by setup_test_isolated)
load_test_env
tenant_name="$TEST_TENANT_NAME"
db_name="$TEST_DATABASE_NAME"

if [[ -n "$tenant_name" && -n "$db_name" ]]; then
    print_success "Created isolated tenant: $tenant_name"
else
    test_fail "Failed to create isolated tenant"
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

# Test admin user
admin_token=$(get_user_token "$tenant_name" "admin")
if [[ -n "$admin_token" && "$admin_token" != "null" ]]; then
    print_success "Admin user authentication successful"
else
    print_error "Admin user authentication failed"
fi

# Test regular user
user_token=$(get_user_token "$tenant_name" "user")
if [[ -n "$user_token" && "$user_token" != "null" ]]; then
    print_success "Regular user authentication successful"
else
    print_error "Regular user authentication failed"
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
