# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"
test_suffix="${args[test_suffix]}"
host="${args[--host]}"

print_info "Creating tenant: $tenant_name"

db_user=$(whoami)

# First create the actual PostgreSQL database
if createdb "$tenant_name" -U "$db_user" 2>/dev/null; then
    print_success "Database '$tenant_name' created successfully"
    
    # Initialize tenant database with required schema tables
    if ! init_tenant_schema "$tenant_name" "$db_user"; then
        # Clean up the database we created
        dropdb "$tenant_name" -U "$db_user" 2>/dev/null || true
        exit 1
    fi
else
    print_error "Failed to create database '$tenant_name'"
    exit 1
fi

# Then insert record into auth database tenants table
sql_insert="INSERT INTO tenants (name, host"
sql_values="VALUES ('$tenant_name', '$host'"

if [ -n "$test_suffix" ]; then
    sql_insert="$sql_insert, test_suffix"
    sql_values="$sql_values, '$test_suffix'"
fi

sql_insert="$sql_insert) $sql_values);"

if psql -U "$db_user" -d monk-api-auth -c "$sql_insert" >/dev/null 2>&1; then
    print_success "Tenant record created in auth database"
    if [ -n "$test_suffix" ]; then
        print_info "Tenant: $tenant_name (test: $test_suffix) on host: $host"
    else
        print_info "Tenant: $tenant_name on host: $host"
    fi
else
    print_error "Failed to create tenant record in auth database"
    # Clean up the database we created
    dropdb "$tenant_name" -U "$db_user" 2>/dev/null || true
    exit 1
fi