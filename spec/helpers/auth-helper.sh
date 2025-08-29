#!/bin/bash
# Common authentication and connectivity helper for tests

# Auto-configure test environment
source "$(dirname "${BASH_SOURCE[0]}")/test-env-setup.sh"

# Note: Database pool management was removed - tenant management now handled by test-one.sh

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

# Authenticate with the test tenant (expects $TEST_TENANT_NAME to exist)
auth_as_user() {
    local username="${1:-root}"
    
    if [ -z "$TEST_TENANT_NAME" ]; then
        print_error "TEST_TENANT_NAME not available - should be set by test-one.sh"
        return 1
    fi
    
    print_step "Authenticating as user: $username"
    
    # Use monk auth login command with tenant and username
    if monk auth login "$TEST_TENANT_NAME" "$username"; then
        print_success "Authentication successful"
        return 0
    else
        print_error "Authentication failed"
        return 1
    fi
}

# Create additional user in the test tenant
create_test_user() {
    local username="$1"
    local access="${2:-read}"
    
    if [ -z "$TEST_TENANT_NAME" ] || [ -z "$username" ]; then
        print_error "create_test_user requires TEST_TENANT_NAME and username"
        return 1
    fi
    
    print_step "Creating test user: $username (access: $access)"
    
    # Insert user into the tenant's users table
    local user_sql="INSERT INTO users (tenant_name, name, access) VALUES ('$TEST_TENANT_NAME', '$username', '$access');"
    if psql -U "$(whoami)" -d "monk-api\$$TEST_TENANT_NAME" -c "$user_sql" >/dev/null 2>&1; then
        print_success "User $username created"
        return 0
    else
        print_error "Failed to create user $username"
        return 1
    fi
}

# Test connectivity using existing authentication
test_connectivity() {
    print_step "Testing database connectivity"
    local ping_output
    if ping_output=$(monk server ping 2>&1); then
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

# Legacy function for backward compatibility (now just does auth)
authenticate_and_ping() {
    local test_name="${1:-test}"
    local use_dedicated_db="${2:-false}"
    
    # Authenticate as root
    if ! auth_as_user "root"; then
        return 1
    fi
    
    # Test connectivity
    if ! test_connectivity; then
        return 1
    fi
    
    return 0
}

# Logout from current authentication (tenant cleanup handled by test-one.sh)
logout_user() {
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_step "Logging out current user"
    fi
    
    # Logout to clear stored token
    monk auth logout > /dev/null 2>&1
}

# Legacy cleanup function (now just logs out)
cleanup_auth() {
    logout_user
}

# Complete cleanup - auth only (database cleanup handled by test-one.sh)
cleanup_auth_and_database() {
    cleanup_auth
    # Note: Database cleanup now handled by test-one.sh tenant management
}

# Setup complete cleanup trap
setup_complete_cleanup_trap() {
    trap cleanup_auth_and_database EXIT INT TERM
}