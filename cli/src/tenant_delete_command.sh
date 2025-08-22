# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"

print_info "Deleting tenant: $tenant_name"

db_user=$(whoami)

# Get database name from tenant record
database_name=$(psql -U "$db_user" -d monk-api-auth -t -c "SELECT database FROM tenants WHERE name = '$tenant_name';" 2>/dev/null | tr -d ' ')

if [ -z "$database_name" ]; then
    print_error "Tenant '$tenant_name' not found in auth database"
    exit 1
fi

print_info "Database name: $database_name"

# Check if database exists
if ! psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$database_name" 2>/dev/null; then
    print_error "Database '$database_name' does not exist"
    exit 1
fi

# First remove record from auth database tenants table
sql_delete="DELETE FROM tenants WHERE name = '$tenant_name';"

if psql -U "$db_user" -d monk-api-auth -c "$sql_delete" >/dev/null 2>&1; then
    print_success "Tenant record removed from auth database"
else
    print_error "Failed to remove tenant record from auth database"
    exit 1
fi

# Then drop the actual PostgreSQL database
if dropdb "$database_name" -U "$db_user" 2>/dev/null; then
    print_success "Database '$database_name' deleted successfully"
else
    print_error "Failed to delete database '$database_name'"
    exit 1
fi