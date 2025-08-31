#!/usr/bin/env bash
set -e

# Test Tenant Isolation 
# Verifies isolated test tenant creation and cleanup functionality

# Source helpers
source "$(dirname "$0")/../curl-helper.sh"
source "$(dirname "$0")/../helpers/test-tenant-helper.sh"

print_step "Testing isolated tenant creation and cleanup"

# Wait for server to be ready
wait_for_server

# Test 1: Create isolated test tenant
print_step "Creating isolated test tenant"
tenant_name=$(create_isolated_test_tenant "isolation_test")

if [[ -n "$tenant_name" ]]; then
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
verify_test_tenant "$tenant_name" "$TEST_DATABASE_NAME"

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
registry_check=$(psql -d monk_main -t -c "SELECT name FROM tenants WHERE name = '$tenant_name' AND trashed_at IS NULL" | xargs)

if [[ "$registry_check" == "$tenant_name" ]]; then
    print_success "Tenant properly registered in monk_main"
else
    test_fail "Tenant not found in registry: expected '$tenant_name', got '$registry_check'"
fi

# Test 6: Manual cleanup test
print_step "Testing manual tenant cleanup"
cleanup_test_tenant "$tenant_name" "$TEST_DATABASE_NAME"

# Verify cleanup worked
cleanup_check=$(psql -d monk_main -t -c "SELECT COUNT(*) FROM tenants WHERE name = '$tenant_name'" | xargs)
if [[ "$cleanup_check" == "0" ]]; then
    print_success "Tenant cleanup successful"
else
    print_warning "Tenant cleanup incomplete (registry entries: $cleanup_check)"
fi

# Verify database was dropped
if psql -l | grep -q "$TEST_DATABASE_NAME"; then
    print_warning "Tenant database still exists after cleanup"
else
    print_success "Tenant database properly dropped"
fi

print_success "Tenant isolation test completed successfully"