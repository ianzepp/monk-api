# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"

print_info "Re-initializing tenant database: $tenant_name"

db_user=$(whoami)

# Check if database exists
if ! psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$tenant_name" 2>/dev/null; then
    print_error "Database '$tenant_name' does not exist"
    print_info "Use 'monk tenant create $tenant_name' to create it first"
    exit 1
fi

# Drop and recreate database
print_info "Dropping existing database..."
if dropdb "$tenant_name" -U "$db_user" 2>/dev/null; then
    print_success "Database dropped"
else
    print_error "Failed to drop database '$tenant_name'"
    exit 1
fi

print_info "Creating fresh database..."
if createdb "$tenant_name" -U "$db_user" 2>/dev/null; then
    print_success "Database recreated"
else
    print_error "Failed to recreate database '$tenant_name'"
    exit 1
fi

# Initialize with schema
if ! init_tenant_schema "$tenant_name" "$db_user"; then
    exit 1
fi

print_success "Tenant database re-initialized successfully"