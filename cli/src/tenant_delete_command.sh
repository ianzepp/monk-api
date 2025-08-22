# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"
test_suffix="${args[test_suffix]}"

# Build full database name (same logic as create command)
if [ -n "$test_suffix" ]; then
    full_db_name="${tenant_name}_${test_suffix}"
    auth_record_name="$full_db_name"
else
    full_db_name="$tenant_name"
    auth_record_name="$tenant_name"
fi

print_info "Deleting tenant: $tenant_name"
if [ -n "$test_suffix" ]; then
    print_info "Test suffix: $test_suffix"
    print_info "Database name: $full_db_name"
fi

db_user=$(whoami)

# First remove record from auth database tenants table
sql_delete="DELETE FROM tenants WHERE name = '$auth_record_name';"

if psql -U "$db_user" -d monk-api-auth -c "$sql_delete" >/dev/null 2>&1; then
    print_success "Tenant record removed from auth database"
else
    print_error "Failed to remove tenant record from auth database"
    exit 1
fi

# Then drop the actual PostgreSQL database
if dropdb "$full_db_name" -U "$db_user" 2>/dev/null; then
    print_success "Database '$full_db_name' deleted successfully"
else
    print_error "Failed to delete database '$full_db_name'"
    exit 1
fi