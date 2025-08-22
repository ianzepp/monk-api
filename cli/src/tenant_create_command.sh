# Check dependencies
check_dependencies

# Get arguments from bashly
tenant_name="${args[name]}"
host="${args[--host]}"
force_flag="${args[--force]}"

# Generate database name: monk-api$ + snake_case conversion
database_name="monk-api\$$(echo "$tenant_name" | sed 's/[^a-zA-Z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g' | tr '[:upper:]' '[:lower:]')"

print_info "Creating tenant: $tenant_name"
print_info "Database name: $database_name"

db_user=$(whoami)

# Check if database already exists
if psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$database_name" 2>/dev/null; then
    if [ "$force_flag" = "1" ]; then
        print_info "Database '$database_name' exists, dropping it (--force flag)"
        
        # Remove tenant record from auth database first
        sql_delete="DELETE FROM tenants WHERE database = '$database_name';"
        if ! psql -U "$db_user" -d monk-api-auth -c "$sql_delete" >/dev/null 2>&1; then
            print_info "No existing tenant record found in auth database (continuing)"
        fi
        
        # Drop the existing database
        if ! dropdb "$database_name" -U "$db_user" 2>/dev/null; then
            print_error "Failed to drop existing database '$database_name'"
            exit 1
        fi
        print_success "Existing database '$database_name' dropped"
    else
        print_error "Database '$database_name' already exists (use --force to override)"
        exit 1
    fi
fi

# First create the actual PostgreSQL database
if createdb "$database_name" -U "$db_user" 2>/dev/null; then
    print_success "Database '$database_name' created successfully"
    
    # Initialize tenant database with required schema tables
    if ! init_tenant_schema "$database_name" "$db_user"; then
        # Clean up the database we created
        dropdb "$database_name" -U "$db_user" 2>/dev/null || true
        exit 1
    fi
    
    # Insert default root user for the tenant
    root_user_sql="INSERT INTO users (tenant_name, name, access) VALUES ('$tenant_name', 'root', 'root');"
    if ! psql -U "$db_user" -d "$database_name" -c "$root_user_sql" >/dev/null 2>&1; then
        print_error "Failed to create root user for tenant"
        # Clean up the database we created
        dropdb "$database_name" -U "$db_user" 2>/dev/null || true
        exit 1
    fi
    print_success "Root user created for tenant"
else
    print_error "Failed to create database '$database_name'"
    exit 1
fi

# Then insert record into auth database tenants table
sql_insert="INSERT INTO tenants (name, host, database) VALUES ('$tenant_name', '$host', '$database_name');"

if psql -U "$db_user" -d monk-api-auth -c "$sql_insert" >/dev/null 2>&1; then
    print_success "Tenant record created in auth database"
    print_info "Tenant: $tenant_name on host: $host"
    print_info "Database: $database_name"
else
    print_error "Failed to create tenant record in auth database"
    # Clean up the database we created
    dropdb "$database_name" -U "$db_user" 2>/dev/null || true
    exit 1
fi