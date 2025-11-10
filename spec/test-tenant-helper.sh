#!/usr/bin/env bash
#
# Isolated Test Tenant Helper
#
# Creates isolated tenant databases for testing with automatic cleanup.
# Uses production tenant naming logic for realistic testing.
#

# Ensure we can access database utilities
command -v psql >/dev/null 2>&1 || { echo "psql not available"; exit 1; }
command -v createdb >/dev/null 2>&1 || { echo "createdb not available"; exit 1; }
command -v dropdb >/dev/null 2>&1 || { echo "dropdb not available"; exit 1; }

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    # Step messages (→) always shown by default
    echo -e "${BLUE}→ $1${NC}" >&2
}

print_success() {
    # Success messages (✓) only shown in verbose mode
    if [[ "${TEST_VERBOSE:-false}" == "true" ]]; then
        echo -e "${GREEN}✓ $1${NC}" >&2
    fi
}

print_error() {
    # Error messages (✗) always shown by default
    echo -e "${RED}✗ $1${NC}" >&2
}

print_warning() {
    # Warning messages (⚠) always shown by default
    echo -e "${YELLOW}⚠ $1${NC}" >&2
}

# Load test environment from temp file (solves subshell variable scoping issues)
load_test_env() {
    if [[ -f /tmp/monk_test_env ]]; then
        source /tmp/monk_test_env
        export TEST_TENANT_NAME
        export TEST_DATABASE_NAME
    fi
}

# Generate tenant database name using production hashing logic
hash_tenant_name() {
    local tenant_name="$1"

    # Match TenantService.tenantNameToDatabase() logic exactly
    # Use openssl for SHA256 (available on most systems)
    local hash=$(echo -n "$tenant_name" | openssl dgst -sha256 -hex | cut -d' ' -f2 | cut -c1-16)
    echo "tenant_${hash}"
}

# Create isolated test tenant from template database (fast cloning)
create_test_tenant_from_template() {
    local test_name="$1"
    local template_name="${2:-basic}"
    local timestamp=$(date +%s)
    local random=$(openssl rand -hex 4)
    local tenant_name="test_${test_name}_${timestamp}_${random}"

    # Generate hashed database name (matching TenantService logic)
    local db_name=$(hash_tenant_name "$tenant_name")

    # Get template database name
    local template_db_name="monk_template_$template_name"

    print_step "Creating tenant from template: $template_name"

    # Check if template exists
    if ! psql -l | grep -q "$template_db_name"; then
        print_error "Template database '$template_db_name' not found"
        print_warning "Run 'npm run fixtures:build $template_name' to create monk_template"
        return 1
    fi

    # 1. Clone database from template (fast!)
    if createdb "$db_name" -T "$template_db_name" 2>/dev/null; then
        print_success "Cloned tenant database from template: $db_name"
    else
        print_error "Failed to clone from template database: $template_db_name"
        return 1
    fi

    # 2. Add tenant to main database registry
    if psql -d monk -c "INSERT INTO tenants (name, database, host, is_active, tenant_type) VALUES ('$tenant_name', '$db_name', 'localhost', true, 'normal')" >/dev/null 2>&1; then
        print_success "Registered tenant in monk"
    else
        print_error "Failed to register tenant"
        dropdb "$db_name" 2>/dev/null || true
        return 1
    fi

    # 3. Export tenant info for test use
    export TEST_TENANT_NAME="$tenant_name"
    export TEST_DATABASE_NAME="$db_name"

    # 4. Save to temp file for reliable access across subshells
    echo "TEST_TENANT_NAME=$tenant_name" > /tmp/monk_test_env
    echo "TEST_DATABASE_NAME=$db_name" >> /tmp/monk_test_env

    print_success "Test tenant ready (cloned from $template_name): $tenant_name → $db_name"

    # Return only the tenant name (stdout)
    echo "$tenant_name"
}

# Create isolated test tenant with fresh database
create_isolated_test_tenant() {
    local test_name="$1"
    local timestamp=$(date +%s)
    local random=$(openssl rand -hex 4)
    local tenant_name="test_${test_name}_${timestamp}_${random}"

    # Generate hashed database name (matching TenantService logic)
    local db_name=$(hash_tenant_name "$tenant_name")

    print_step "Creating isolated test tenant: $tenant_name"

    # 1. Create tenant database
    if createdb "$db_name" 2>/dev/null; then
        print_success "Created tenant database: $db_name"
    else
        print_error "Failed to create tenant database: $db_name"
        return 1
    fi

    # 2. Initialize tenant schema
    if psql -d "$db_name" -f sql/init-tenant.sql >/dev/null 2>&1; then
        print_success "Initialized tenant schema"
    else
        print_error "Failed to initialize tenant schema"
        dropdb "$db_name" 2>/dev/null || true
        return 1
    fi

    # 3. Add tenant to main database registry
    if psql -d monk -c "INSERT INTO tenants (name, database, host, is_active, tenant_type) VALUES ('$tenant_name', '$db_name', 'localhost', true, 'normal')" >/dev/null 2>&1; then
        print_success "Registered tenant in monk"
    else
        print_error "Failed to register tenant"
        dropdb "$db_name" 2>/dev/null || true
        return 1
    fi

    # 4. Create test users with different access levels (matching CHECK constraint)
    local user_sql="
        INSERT INTO users (name, auth, access, access_read, access_edit, access_full) VALUES
        ('Test Root User', 'root', 'root', '{}', '{}', '{}'),
        ('Test Admin User', 'admin', 'full', '{}', '{}', '{}'),
        ('Test Regular User', 'user', 'edit', '{}', '{}', '{}')
        ON CONFLICT (auth) DO NOTHING
    "

    if psql -d "$db_name" -c "$user_sql" >/dev/null 2>&1; then
        print_success "Created test users (root, admin, user)"
    else
        print_error "Failed to create test users"
        cleanup_test_tenant "$tenant_name" "$db_name"
        return 1
    fi

    # 5. Export tenant info for test use
    export TEST_TENANT_NAME="$tenant_name"
    export TEST_DATABASE_NAME="$db_name"

    # 6. Save to temp file for reliable access across subshells
    echo "TEST_TENANT_NAME=$tenant_name" > /tmp/monk_test_env
    echo "TEST_DATABASE_NAME=$db_name" >> /tmp/monk_test_env

    print_success "Test tenant ready: $tenant_name → $db_name"

    # Return only the tenant name (stdout)
    echo "$tenant_name"
}

# Terminate connections to specific tenant database before cleanup
terminate_tenant_connections() {
    local db_name="$1"

    if [[ -z "$db_name" ]]; then
        print_warning "No database name provided to terminate_tenant_connections"
        return 0
    fi

    # Terminate connections only to specific tenant database
    # Exclude our own connection (pg_backend_pid)
    psql -d monk -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db_name' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

    # Small delay to allow termination to complete
    sleep 0.5
}

# Clean up test tenant and all associated data (deferred - does nothing)
cleanup_test_tenant() {
    local tenant_name="$1"
    local db_name="$2"

    # Deferred cleanup - do nothing during test run
    # All test databases will be cleaned up at the end of the test suite
    return 0
}

# Setup trap for automatic cleanup on script exit
setup_test_cleanup_trap() {
    local tenant_name="$1"
    local db_name="$2"

    # Set trap to cleanup on exit (normal or error)
    trap "cleanup_test_tenant '$tenant_name' '$db_name'" EXIT
}

# Create test tenant for current test and setup cleanup
setup_isolated_test() {
    local test_name="${1:-$(basename "$0" .test.sh)}"

    # Create isolated tenant
    local tenant_name=$(create_isolated_test_tenant "$test_name")

    if [[ -z "$tenant_name" ]]; then
        print_error "Failed to create test tenant"
        exit 1
    fi

    # Setup automatic cleanup
    setup_test_cleanup_trap "$tenant_name" "$TEST_DATABASE_NAME"

    # Export for curl helper
    export TEST_TENANT_NAME="$tenant_name"
    export TEST_DATABASE_NAME

    print_success "Isolated test environment ready"
}

# Mass cleanup of all test databases (called at end of test suite)
cleanup_all_test_databases() {
    print_step "Cleaning up all test databases and tenants"

    local cleanup_count=0
    local error_count=0

    # Get all test tenant names from registry
    local test_tenants=$(psql -d monk -t -c "SELECT name FROM tenants WHERE name LIKE 'test_%'" 2>/dev/null | xargs)

    if [[ -z "$test_tenants" ]]; then
        print_success "No test tenants found to cleanup"
        return 0
    fi

    # Collect database names to drop first (before deleting registry)
    local databases_to_drop=()

    # Process each test tenant to collect database names
    for tenant_name in $test_tenants; do
        if [[ -n "$tenant_name" ]]; then
            # Get database name for this tenant
            local db_name=$(psql -d monk -t -c "SELECT database FROM tenants WHERE name = '$tenant_name'" 2>/dev/null | xargs)

            if [[ -n "$db_name" ]]; then
                databases_to_drop+=("$db_name")
            fi
        fi
    done

    # Drop all databases first
    for db_name in "${databases_to_drop[@]}"; do
        if dropdb "$db_name" 2>/dev/null; then
            print_success "Dropped test database: $db_name"
            cleanup_count=$((cleanup_count + 1))
        else
            print_warning "Database $db_name has active connections - will retry"
        fi
    done

    # Then clean up tenant registry
    psql -d monk -c "DELETE FROM tenants WHERE name LIKE 'test_%'" >/dev/null 2>&1 || true

    # Also clean up any orphaned test databases
    local test_dbs=$(psql -l | grep "tenant_[a-f0-9]" | awk '{print $1}' | grep -E "tenant_[a-f0-9]{16}" || true)

    for db_name in $test_dbs; do
        if [[ -n "$db_name" ]]; then
            # Check if this is a test database (not a production one)
            local tenant_count=$(psql -d monk -t -c "SELECT COUNT(*) FROM tenants WHERE database = '$db_name'" 2>/dev/null | xargs)

            if [[ "$tenant_count" == "0" ]]; then
                # Second pass cleanup for databases with active connections
                if dropdb "$db_name" 2>/dev/null; then
                    print_success "Dropped test database (second pass): $db_name"
                    cleanup_count=$((cleanup_count + 1))
                else
                    print_error "Failed to drop database: $db_name"
                    error_count=$((error_count + 1))
                fi
            fi
        fi
    done

    print_success "Test database cleanup completed: $cleanup_count databases dropped, $error_count errors"
}

# Verify test tenant is working
verify_test_tenant() {
    local tenant_name="$1"
    local db_name="$2"

    # Check tenant exists in registry
    local tenant_exists=$(psql -d monk -t -c "SELECT COUNT(*) FROM tenants WHERE name = '$tenant_name' AND trashed_at IS NULL" 2>/dev/null | xargs)

    if [[ "$tenant_exists" != "1" ]]; then
        print_error "Test tenant not found in registry: $tenant_name"
        return 1
    fi

    # Check database exists and has users
    local user_count=$(psql -d "$db_name" -t -c "SELECT COUNT(*) FROM users" 2>/dev/null | xargs)

    if [[ "$user_count" -ge "3" ]]; then
        print_success "Test tenant verified: $user_count users available"
        return 0
    else
        print_error "Test tenant database invalid: $user_count users found"
        return 1
    fi
}
