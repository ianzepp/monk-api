#!/bin/bash
# Common authentication and connectivity helper for tests

# Auto-configure test environment
source "$(dirname "${BASH_SOURCE[0]}")/test-env-setup.sh"

# Source database helper for pooled database management  
source "$(dirname "${BASH_SOURCE[0]}")/10-connection/db-helper.sh"

# Ensure shared test database exists and is initialized
ensure_shared_database() {
    local db_name="$1"
    local db_user="${DB_USER:-$(whoami)}"
    
    # Check if database exists
    if ! psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$db_name" 2>/dev/null; then
        # Database doesn't exist, create it
        if createdb "$db_name" -U "$db_user" 2>/dev/null; then
            if [ "${CLI_VERBOSE:-}" = "true" ]; then
                print_step "Created shared test database: $db_name"
            fi
            
            # Initialize schema
            local schema_file="$(dirname "$0")/../sql/init-schema.sql"
            if [ -f "$schema_file" ]; then
                if psql -U "$db_user" -d "$db_name" -f "$schema_file" >/dev/null 2>&1; then
                    if [ "${CLI_VERBOSE:-}" = "true" ]; then
                        print_step "Initialized shared database schema"
                    fi
                else
                    print_error "Failed to initialize shared database schema"
                    return 1
                fi
            fi
        else
            print_error "Failed to create shared test database: $db_name"
            return 1
        fi
    fi
    
    return 0
}

# Authentication and connectivity helper using monk CLI with shared database
authenticate_and_ping() {
    local test_name="${1:-test}"
    local use_dedicated_db="${2:-false}"
    
    # Only allocate dedicated database if explicitly requested
    if [ "$use_dedicated_db" = "true" ] && ! has_allocated_database; then
        if ! allocate_test_database "$test_name"; then
            print_error "Failed to allocate dedicated test database"
            return 1
        fi
        setup_database_cleanup_trap
    fi
    
    # Determine domain to use
    local test_domain
    if [ "$use_dedicated_db" = "true" ] && has_allocated_database; then
        test_domain=$(get_allocated_database)
    else
        # Use current test database (set by monk test use)
        local test_db_file="${HOME}/.monk-test-database"
        if [ -f "$test_db_file" ]; then
            test_domain=$(cat "$test_db_file")
        else
            test_domain="${MONK_TEST_DATABASE:-monk_api_test_shared_$(whoami)}"
        fi
        
        # Ensure shared database exists and is initialized
        ensure_shared_database "$test_domain"
    fi
    
    print_step "Authenticating with test domain: $test_domain"
    
    # Use monk auth login command
    if monk auth login --domain "$test_domain"; then
        print_success "Authentication successful"
        
        # Test connectivity and database access using monk ping
        print_step "Testing database connectivity"
        local ping_output
        if ping_output=$(monk ping 2>&1); then
            print_success "Database connectivity verified"
            
            # Show ping details in verbose mode
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Ping response:"
                echo "$ping_output" | sed 's/^/  /'
            fi
            
            return 0
        else
            print_error "Database connectivity failed"
            
            # Show ping error details
            print_info "Ping error details:"
            echo "$ping_output" | sed 's/^/  /'
            
            return 1
        fi
    else
        print_error "Authentication failed"
        return 1
    fi
}

# Cleanup authentication
cleanup_auth() {
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_step "Cleaning up authentication"
    fi
    
    # Logout to clear stored token
    monk auth logout > /dev/null 2>&1
}

# Complete cleanup - auth and database
cleanup_auth_and_database() {
    cleanup_auth
    deallocate_test_database
}

# Setup complete cleanup trap
setup_complete_cleanup_trap() {
    trap cleanup_auth_and_database EXIT INT TERM
}