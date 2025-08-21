#!/bin/bash
set -e

# Database Pool Setup Test - Tests database allocation and management
# This test validates the database pool system (max 10 databases)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

# Test configuration
TEST_DBS=()

# Cleanup function
cleanup() {
    if [ ${#TEST_DBS[@]} -gt 0 ]; then
        print_step "Cleaning up test databases"
        for db_name in "${TEST_DBS[@]}"; do
            if [ -n "$db_name" ]; then
                monk pool deallocate "$db_name" > /dev/null 2>&1 || true
            fi
        done
    fi
}

# Set trap for cleanup
trap cleanup EXIT

echo "=== Database Pool Setup Test ==="
echo

# Test 1: Check pool manager availability
print_step "Testing database pool manager availability"
if command -v monk >/dev/null 2>&1; then
    print_success "Monk CLI with database pool is available"
else
    print_error "Monk CLI not found in PATH"
    exit 1
fi

# Test 2: Check PostgreSQL connectivity
print_step "Testing PostgreSQL connectivity"
if monk pool status > /dev/null 2>&1; then
    print_success "PostgreSQL is accessible"
else
    print_error "PostgreSQL is not accessible"
    print_info "Please ensure PostgreSQL is running and accessible"
    exit 1
fi

# Test 3: Show initial pool status
print_step "Checking initial pool status"
if pool_status=$(monk pool status 2>&1); then
    print_success "Pool status retrieved"
    echo "$pool_status" | sed 's/^/  /'
else
    print_error "Failed to get pool status"
    exit 1
fi

# Test 4: Allocate a test database
print_step "Testing database allocation"
if test_db=$(monk pool allocate setup_test 2>&1); then
    # Extract just the database name (last line of output)
    test_db=$(echo "$test_db" | tail -n 1 | grep "^monk_api_test_" || echo "")
    
    if [ -n "$test_db" ]; then
        print_success "Database allocated: $test_db"
        TEST_DBS+=("$test_db")
    else
        print_error "Database allocation returned unexpected output"
        exit 1
    fi
else
    print_error "Database allocation failed"
    exit 1
fi

# Test 5: Verify database exists and has required schema
print_step "Verifying allocated database exists and is properly initialized"
# Check database connection and required tables
if command -v whoami >/dev/null 2>&1; then
    db_user=$(whoami)
else
    db_user="${USER:-postgres}"
fi

if psql -U "$db_user" -d "$test_db" -c "SELECT 1;" > /dev/null 2>&1; then
    print_success "Allocated database is accessible"
    
    # Verify required tables exist
    print_step "Verifying required schema tables exist"
    if psql -U "$db_user" -d "$test_db" -c "SELECT COUNT(*) FROM schemas; SELECT COUNT(*) FROM columns;" > /dev/null 2>&1; then
        print_success "Required schema tables (schemas, columns) are present and accessible"
    else
        print_error "Required schema tables are missing or inaccessible"
        exit 1
    fi
else
    print_error "Allocated database is not accessible"
    exit 1
fi

# Test 6: Test pool listing
print_step "Testing pool database listing"
if monk pool list > /dev/null 2>&1; then
    print_success "Pool listing works"
    
    # Verify our database appears in the list
    if monk pool list | grep -q "$test_db"; then
        print_success "Allocated database appears in pool listing"
    else
        print_error "Allocated database not found in pool listing"
        exit 1
    fi
else
    print_error "Pool listing failed"
    exit 1
fi

# Test 7: Test database deallocation
print_step "Testing database deallocation"
if monk pool deallocate "$test_db" > /dev/null 2>&1; then
    print_success "Database deallocated successfully"
    # Remove from our tracking array
    TEST_DBS=()
else
    print_error "Database deallocation failed"
    exit 1
fi

# Test 8: Verify database no longer exists
print_step "Verifying database was removed"
if psql -U "$db_user" -d "$test_db" -c "SELECT 1;" > /dev/null 2>&1; then
    print_error "Database still exists after deallocation"
    exit 1
else
    print_success "Database properly removed"
fi

# Test 9: Test pool capacity (allocate multiple databases)
print_step "Testing pool capacity management"
print_info "Allocating multiple databases to test pool limits..."

allocated_count=0
for i in $(seq 1 5); do
    if db_name=$(monk pool allocate "capacity_test_$i" 2>/dev/null); then
        db_name=$(echo "$db_name" | tail -n 1 | grep "^monk_api_test_" || echo "")
        if [ -n "$db_name" ]; then
            TEST_DBS+=("$db_name")
            allocated_count=$((allocated_count + 1))
        fi
    fi
done

if [ $allocated_count -gt 0 ]; then
    print_success "Allocated $allocated_count test databases for capacity testing"
else
    print_error "Failed to allocate databases for capacity testing"
    exit 1
fi

# Test 10: Final pool status
print_step "Checking final pool status"
if final_status=$(monk pool status 2>&1); then
    print_success "Final pool status:"
    echo "$final_status" | sed 's/^/  /'
else
    print_error "Failed to get final pool status"
    exit 1
fi

echo
print_success "All database pool setup tests passed!"
print_info "The database pool management system is working correctly"