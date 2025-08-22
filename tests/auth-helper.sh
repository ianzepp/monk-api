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

# Initialize test tenant for the script (call once at script start)
initialize_test_tenant() {
    # Create unique tenant name for this test script
    TEST_TENANT_NAME="test-$(date +%s)"
    
    print_step "Creating test tenant: $TEST_TENANT_NAME"
    
    # Create tenant with root user (quietly)
    if monk tenant create "$TEST_TENANT_NAME" >/dev/null 2>&1; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "Test tenant created successfully"
        fi
    else
        print_error "Failed to create test tenant"
        return 1
    fi
    
    print_step "Authenticating with tenant: $TEST_TENANT_NAME as root"
    
    # Use monk auth login command with tenant and username
    if monk auth login "$TEST_TENANT_NAME" "root"; then
        print_success "Authentication successful"
        return 0
    else
        print_error "Authentication failed"
        return 1
    fi
}

# Test connectivity using existing authentication (call after initialize_test_tenant)
test_connectivity() {
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
}

# Combined initialization and connectivity test (for backward compatibility)
authenticate_and_ping() {
    local test_name="${1:-test}"
    local use_dedicated_db="${2:-false}"
    
    # Initialize tenant and authenticate
    if ! initialize_test_tenant; then
        return 1
    fi
    
    # Test connectivity
    if ! test_connectivity; then
        return 1
    fi
    
    return 0
}

# Cleanup authentication and test tenant
cleanup_auth() {
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_step "Cleaning up authentication and test tenant"
    fi
    
    # Logout to clear stored token
    monk auth logout > /dev/null 2>&1
    
    # Clean up test tenant if we created one
    if [ -n "$TEST_TENANT_NAME" ]; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "Deleting test tenant: $TEST_TENANT_NAME"
        fi
        monk tenant delete "$TEST_TENANT_NAME" >/dev/null 2>&1 || true
    fi
}

# Complete cleanup - auth and database (kept for backward compatibility)
cleanup_auth_and_database() {
    cleanup_auth
    deallocate_test_database
}

# Setup complete cleanup trap
setup_complete_cleanup_trap() {
    trap cleanup_auth_and_database EXIT INT TERM
}