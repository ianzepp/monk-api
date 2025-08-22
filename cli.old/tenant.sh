#!/bin/bash
set -e

# Tenant Management CLI - Multi-tenant database management
#
# Usage: monk tenant <command> [options]
#
# Commands:
#   create <name>          Create new tenant database
#   delete <name>          Delete tenant database
#   list                   List all tenant databases
#   use <name>             Switch to tenant database

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Initialize tenant database schema
init_tenant_schema() {
    local tenant_name="$1"
    local db_user="${2:-$(whoami)}"
    
    local schema_file="$(dirname "$0")/../sql/init-tenant.sql"
    if [ -f "$schema_file" ]; then
        print_info "Initializing tenant database schema..."
        if psql -U "$db_user" -d "$tenant_name" -f "$schema_file" >/dev/null 2>&1; then
            print_success "Tenant database schema initialized"
            return 0
        else
            print_error "Failed to initialize tenant database schema"
            return 1
        fi
    else
        print_error "Schema file not found: $schema_file"
        return 1
    fi
}

# Show usage information
show_usage() {
    cat << EOF
Usage: monk tenant <command> [options]

Multi-tenant database management for Monk API.

Commands:
  create <name> [test_suffix] --host <host>  Create new tenant database and record
  delete <name>                              Delete tenant database  
  init <name>                                Truncate and re-initialize tenant database
  list                                       List all tenant databases
  use <name>                                 Switch to tenant database (sets context)

Examples:
  monk tenant create production                                    # Create production tenant on localhost
  monk tenant create staging --host prod-01.db.example.com        # Create staging tenant on remote host
  monk tenant create sky-tower 1234 --host test-01.db.example.com # Create test allocation
  monk tenant init production                                      # Reset production database
  monk tenant list                                                 # List all tenants
  monk tenant use staging                                          # Switch to staging tenant
  monk tenant delete old_tenant                                   # Delete old tenant

Options:
  -v, --verbose           Show detailed information
  -h, --help              Show this help message

Tenant Management:
  Tenants are isolated database environments that allow multiple
  applications or customers to share the same API infrastructure
  while maintaining data separation.

Global Options (from monk test env):
  CLI_BASE_URL        API server URL
  JWT_TOKEN           Authentication token (admin required)

Note: Tenant operations require administrator-level authentication.
EOF
}

# Create new tenant database
cmd_create() {
    # Check for help flag first
    case "${1:-}" in
        -h|--help)
            cat << EOF
Usage: monk tenant create <name> [test_suffix] --host <host>

Create a new tenant database and register it in the auth database.

Arguments:
  name          Name of the tenant database to create
  test_suffix   Optional test suffix for test allocations

Options:
  --host <host> Database host (default: localhost)

Examples:
  monk tenant create production
  monk tenant create staging --host prod-01.db.example.com
  monk tenant create sky-tower 1234 --host test-01.db.example.com

This command will:
1. Create a PostgreSQL database with the given name
2. Initialize it with the required schema tables
3. Register the tenant in the auth database
EOF
            return 0
            ;;
    esac
    
    local tenant_name="$1"
    local test_suffix=""
    local host="localhost"
    
    # Parse all arguments after tenant_name
    shift
    while [ $# -gt 0 ]; do
        case "$1" in
            --host)
                if [ -z "$2" ]; then
                    print_error "--host requires a value"
                    return 1
                fi
                host="$2"
                shift 2
                ;;
            --*)
                print_error "Unknown option: $1"
                return 1
                ;;
            *)
                # If we haven't set test_suffix yet, this is it
                if [ -z "$test_suffix" ]; then
                    test_suffix="$1"
                    shift
                else
                    print_error "Unexpected argument: $1"
                    return 1
                fi
                ;;
        esac
    done
    
    if [ -z "$tenant_name" ]; then
        print_error "Tenant name is required"
        print_info "Usage: monk tenant create <name> [test_suffix] --host <host>"
        return 1
    fi
    
    print_info "Creating tenant: $tenant_name"
    
    local db_user=$(whoami)
    
    # First create the actual PostgreSQL database
    if createdb "$tenant_name" -U "$db_user" 2>/dev/null; then
        print_success "Database '$tenant_name' created successfully"
        
        # Initialize tenant database with required schema tables
        if ! init_tenant_schema "$tenant_name" "$db_user"; then
            # Clean up the database we created
            dropdb "$tenant_name" -U "$db_user" 2>/dev/null || true
            return 1
        fi
    else
        print_error "Failed to create database '$tenant_name'"
        return 1
    fi
    
    # Then insert record into auth database tenants table
    local sql_insert="INSERT INTO tenants (name, host"
    local sql_values="VALUES ('$tenant_name', '$host'"
    
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
        return 1
    fi
}

# Delete tenant database
cmd_delete() {
    # Check for help flag first
    case "${1:-}" in
        -h|--help)
            cat << EOF
Usage: monk tenant delete <name>

Delete a tenant database and remove it from the auth database.

Arguments:
  name          Name of the tenant database to delete

Examples:
  monk tenant delete old_tenant
  monk tenant delete test_db

This command will:
1. Remove the tenant record from the auth database
2. Drop the PostgreSQL database completely
EOF
            return 0
            ;;
    esac
    
    local tenant_name="$1"
    
    if [ -z "$tenant_name" ]; then
        print_error "Tenant name is required"
        print_info "Usage: monk tenant delete <name>"
        return 1
    fi
    
    print_info "Deleting tenant: $tenant_name"
    
    local db_user=$(whoami)
    
    # First remove record from auth database tenants table
    local sql_delete="DELETE FROM tenants WHERE name = '$tenant_name';"
    
    if psql -U "$db_user" -d monk-api-auth -c "$sql_delete" >/dev/null 2>&1; then
        print_success "Tenant record removed from auth database"
    else
        print_error "Failed to remove tenant record from auth database"
        return 1
    fi
    
    # Then drop the actual PostgreSQL database
    if dropdb "$tenant_name" -U "$db_user" 2>/dev/null; then
        print_success "Database '$tenant_name' deleted successfully"
    else
        print_error "Failed to delete database '$tenant_name'"
        return 1
    fi
}

# List all tenant databases
cmd_list() {
    print_info "Listing all tenant databases"
    echo
    
    local db_user=$(whoami)
    
    # Print header
    printf "%-30s %-20s %-8s %-8s %-8s %-8s %s\n" \
        "TENANT" \
        "HOST" \
        "STATUS" \
        "DB" \
        "SCHEMAS" \
        "COLUMNS" \
        "CREATED"
    echo "$(printf '%.s-' {1..100})"
    
    # Get tenant records from auth database
    local tenants_query="SELECT name, host, test_suffix, is_active, created_at FROM tenants ORDER BY name, test_suffix;"
    
    # Use temporary file to avoid pipe subshell issues
    local temp_file=$(mktemp)
    if psql -U "$db_user" -d monk-api-auth -t -c "$tenants_query" 2>/dev/null > "$temp_file"; then
        while IFS='|' read -r name host test_suffix is_active created_at; do
            # Clean up the fields (remove leading/trailing spaces)
            name=$(echo "$name" | xargs)
            host=$(echo "$host" | xargs) 
            test_suffix=$(echo "$test_suffix" | xargs)
            is_active=$(echo "$is_active" | xargs)
            
            # Skip empty lines
            [ -z "$name" ] && continue
            
            # Build display name
            local display_name="$name"
            if [ -n "$test_suffix" ] && [ "$test_suffix" != "" ]; then
                display_name="$name (test: $test_suffix)"
            fi
            
            # Get database stats if host is localhost
            local schemas="?"
            local columns="?"
            local status="remote"
            
            if [ "$host" = "localhost" ]; then
                # Check if database exists locally
                if psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$name" 2>/dev/null; then
                    status="local"
                    # Count tables in public schema
                    local schema_count
                    if schema_count=$(psql -U "$db_user" -d "$name" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null); then
                        schemas=$(echo "$schema_count" | xargs)
                    fi
                    
                    # Count columns across all tables in public schema
                    local column_count
                    if column_count=$(psql -U "$db_user" -d "$name" -t -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public';" 2>/dev/null); then
                        columns=$(echo "$column_count" | xargs)
                    fi
                else
                    status="missing"
                fi
            fi
            
            # Format active status
            local active_display="inactive"
            if [ "$is_active" = "t" ]; then
                active_display="active"
            fi
            
            # Format created date
            local created_display=$(echo "$created_at" | cut -d'.' -f1)
            
            printf "%-30s %-20s %-8s %-8s %-8s %-8s %s\n" \
                "$display_name" \
                "$host" \
                "$active_display" \
                "$status" \
                "$schemas" \
                "$columns" \
                "$created_display"
                
        done < "$temp_file"
        rm -f "$temp_file"
    else
        rm -f "$temp_file"
        print_error "Failed to query tenants from auth database"
        return 1
    fi
}

# Initialize/re-initialize tenant database
cmd_init() {
    # Check for help flag first
    case "${1:-}" in
        -h|--help)
            cat << EOF
Usage: monk tenant init <name>

Re-initialize an existing tenant database by dropping and recreating it.

Arguments:
  name          Name of the existing tenant database to re-initialize

Examples:
  monk tenant init production
  monk tenant init test_db

This command will:
1. Drop the existing PostgreSQL database completely
2. Recreate the database with the same name
3. Initialize it with the required schema tables
4. Keep the tenant record in auth database intact
EOF
            return 0
            ;;
    esac
    
    local tenant_name="$1"
    
    if [ -z "$tenant_name" ]; then
        print_error "Tenant name is required"
        print_info "Usage: monk tenant init <name>"
        return 1
    fi
    
    print_info "Re-initializing tenant database: $tenant_name"
    
    local db_user=$(whoami)
    
    # Check if database exists
    if ! psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$tenant_name" 2>/dev/null; then
        print_error "Database '$tenant_name' does not exist"
        print_info "Use 'monk tenant create $tenant_name' to create it first"
        return 1
    fi
    
    # Drop and recreate database
    print_info "Dropping existing database..."
    if dropdb "$tenant_name" -U "$db_user" 2>/dev/null; then
        print_success "Database dropped"
    else
        print_error "Failed to drop database '$tenant_name'"
        return 1
    fi
    
    print_info "Creating fresh database..."
    if createdb "$tenant_name" -U "$db_user" 2>/dev/null; then
        print_success "Database recreated"
    else
        print_error "Failed to recreate database '$tenant_name'"
        return 1
    fi
    
    # Initialize with schema
    if ! init_tenant_schema "$tenant_name" "$db_user"; then
        return 1
    fi
    
    print_success "Tenant database re-initialized successfully"
}

# Switch to tenant database
cmd_use() {
    local tenant_name="$1"
    
    if [ -z "$tenant_name" ]; then
        print_error "Tenant name is required"
        print_info "Usage: monk tenant use <name>"
        return 1
    fi
    
    print_info "Switching to tenant: $tenant_name"
    
    # Store tenant context in environment
    export CLI_TENANT="$tenant_name"
    
    # Optionally store in config file for persistence
    local config_dir="$HOME/.monk"
    mkdir -p "$config_dir"
    echo "$tenant_name" > "$config_dir/current_tenant"
    
    print_success "Switched to tenant '$tenant_name'"
    print_info "Use 'monk auth login --domain $tenant_name' to authenticate"
}

# Main command handling
main() {
    if [ $# -eq 0 ]; then
        show_usage
        return 1
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        create)
            cmd_create "$@"
            ;;
        delete)
            cmd_delete "$@"
            ;;
        init)
            cmd_init "$@"
            ;;
        list)
            cmd_list "$@"
            ;;
        use)
            cmd_use "$@"
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            print_info "Available commands: create, delete, init, list, use"
            print_info "Use 'monk tenant --help' for more information"
            return 1
            ;;
    esac
}

main "$@"