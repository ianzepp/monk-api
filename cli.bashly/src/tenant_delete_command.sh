# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"

print_info "Deleting tenant: $tenant_name"

db_user=$(whoami)

# First remove record from auth database tenants table
sql_delete="DELETE FROM tenants WHERE name = '$tenant_name';"

if psql -U "$db_user" -d monk-api-auth -c "$sql_delete" >/dev/null 2>&1; then
    print_success "Tenant record removed from auth database"
else
    print_error "Failed to remove tenant record from auth database"
    exit 1
fi

# Then drop the actual PostgreSQL database
if dropdb "$tenant_name" -U "$db_user" 2>/dev/null; then
    print_success "Database '$tenant_name' deleted successfully"
else
    print_error "Failed to delete database '$tenant_name'"
    exit 1
fi