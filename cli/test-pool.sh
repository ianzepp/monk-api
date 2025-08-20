#!/bin/bash
set -e

# Test Pool Management - Integrated database pool operations

# Load common functions
source "$(dirname "$0")/common.sh"

# Configuration
MAX_DATABASES=10
DB_PREFIX="monk_api_test"
POOL_DIR="${HOME}/.monk-db-pool"
LOCK_FILE="${POOL_DIR}/.pool.lock"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }

# Ensure pool directory exists
mkdir -p "$POOL_DIR"

# Lock mechanism for concurrent access
acquire_lock() {
    local timeout=30
    local count=0
    
    while [ -f "$LOCK_FILE" ] && [ $count -lt $timeout ]; do
        sleep 1
        count=$((count + 1))
    done
    
    if [ $count -eq $timeout ]; then
        print_error "Could not acquire database pool lock after ${timeout}s"
        return 1
    fi
    
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
}

# Get database user (try common PostgreSQL setups)
get_db_user() {
    if command -v whoami >/dev/null 2>&1; then
        whoami
    else
        echo "${USER:-postgres}"
    fi
}

# Check if PostgreSQL is accessible
check_postgres() {
    local db_user=$(get_db_user)
    
    if ! pg_isready -U "$db_user" > /dev/null 2>&1; then
        print_error "PostgreSQL is not accessible with user '$db_user'"
        print_info "Please ensure PostgreSQL is running and accessible"
        return 1
    fi
}

# Get list of existing pool databases
get_pool_databases() {
    local db_user=$(get_db_user)
    psql -U "$db_user" -t -c "SELECT datname FROM pg_database WHERE datname LIKE '${DB_PREFIX}_%';" 2>/dev/null | grep -v '^$' | tr -d ' '
}

# Count active pool databases
count_pool_databases() {
    get_pool_databases | wc -l | tr -d ' '
}

# Allocate a new database from the pool
allocate_database() {
    local test_name="${1:-test}"
    local db_user=$(get_db_user)
    
    acquire_lock
    
    check_postgres || { release_lock; return 1; }
    
    local current_count=$(count_pool_databases)
    
    if [ "$current_count" -ge "$MAX_DATABASES" ]; then
        print_error "Database pool is full ($current_count/$MAX_DATABASES databases)"
        print_info "Use 'monk test pool cleanup' to free up space"
        release_lock
        return 1
    fi
    
    # Generate unique database name
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local random_suffix=$(shuf -i 1000-9999 -n 1 2>/dev/null || echo $((RANDOM % 9000 + 1000)))
    local db_name="${DB_PREFIX}_${test_name}_${timestamp}_${random_suffix}"
    
    print_step "Allocating database: $db_name"
    
    # Create database
    if createdb "$db_name" -U "$db_user" 2>/dev/null; then
        # Store allocation info
        local allocation_file="${POOL_DIR}/${db_name}.info"
        cat > "$allocation_file" << EOF
database_name=$db_name
test_name=$test_name
allocated_at=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
allocated_by=$$
db_user=$db_user
EOF
        
        print_success "Database allocated: $db_name"
        print_info "Pool usage: $((current_count + 1))/$MAX_DATABASES"
        
        release_lock
        echo "$db_name"
        return 0
    else
        print_error "Failed to create database: $db_name"
        release_lock
        return 1
    fi
}

# Deallocate a database back to the pool
deallocate_database() {
    local db_name="$1"
    local db_user=$(get_db_user)
    
    if [ -z "$db_name" ]; then
        print_error "Database name required"
        return 1
    fi
    
    acquire_lock
    
    check_postgres || { release_lock; return 1; }
    
    print_step "Deallocating database: $db_name"
    
    # Drop database
    if dropdb "$db_name" -U "$db_user" 2>/dev/null; then
        # Remove allocation info
        rm -f "${POOL_DIR}/${db_name}.info"
        
        print_success "Database deallocated: $db_name"
        
        local remaining_count=$(count_pool_databases)
        print_info "Pool usage: $remaining_count/$MAX_DATABASES"
    else
        print_error "Failed to drop database: $db_name"
        release_lock
        return 1
    fi
    
    release_lock
}

# List all databases in the pool
list_databases() {
    print_step "Active test databases in pool:"
    
    local databases=$(get_pool_databases)
    local count=$(echo "$databases" | grep -c . || echo "0")
    
    if [ "$count" -eq 0 ]; then
        print_info "No databases in pool"
        return 0
    fi
    
    printf "%-40s %-15s %-20s %s\n" "Database Name" "Test Name" "Allocated At" "Status"
    echo "--------------------------------------------------------------------------------"
    
    echo "$databases" | while read -r db_name; do
        local info_file="${POOL_DIR}/${db_name}.info"
        if [ -f "$info_file" ]; then
            local test_name=$(grep "test_name=" "$info_file" | cut -d'=' -f2)
            local allocated_at=$(grep "allocated_at=" "$info_file" | cut -d'=' -f2)
            printf "%-40s %-15s %-20s %s\n" "$db_name" "$test_name" "$allocated_at" "Active"
        else
            printf "%-40s %-15s %-20s %s\n" "$db_name" "Unknown" "Unknown" "Orphaned"
        fi
    done
    
    echo
    print_info "Pool usage: $count/$MAX_DATABASES"
}

# Clean up old databases (older than specified time)
cleanup_old() {
    local max_age_hours="${1:-24}"
    local db_user=$(get_db_user)
    
    acquire_lock
    
    check_postgres || { release_lock; return 1; }
    
    print_step "Cleaning up databases older than $max_age_hours hours"
    
    # Get cutoff time (portable across macOS and Linux)
    local cutoff_time
    if date -d "$max_age_hours hours ago" +%s >/dev/null 2>&1; then
        # GNU date (Linux)
        cutoff_time=$(date -d "$max_age_hours hours ago" +%s)
    elif date -v-"${max_age_hours}H" +%s >/dev/null 2>&1; then
        # BSD date (macOS)
        cutoff_time=$(date -v-"${max_age_hours}H" +%s)
    else
        # Fallback: assume all databases are old
        cutoff_time=$(date +%s)
    fi
    
    local cleaned_count=0
    local databases=$(get_pool_databases)
    
    echo "$databases" | while read -r db_name; do
        local info_file="${POOL_DIR}/${db_name}.info"
        local should_clean=false
        
        if [ -f "$info_file" ]; then
            local allocated_time=$(grep "allocated_at=" "$info_file" | cut -d'=' -f2)
            if [ -n "$allocated_time" ]; then
                local db_time
                if date -d "$allocated_time" +%s >/dev/null 2>&1; then
                    # GNU date
                    db_time=$(date -d "$allocated_time" +%s)
                elif date -j -f "%Y-%m-%d %H:%M:%S %Z" "$allocated_time" +%s >/dev/null 2>&1; then
                    # BSD date
                    db_time=$(date -j -f "%Y-%m-%d %H:%M:%S %Z" "$allocated_time" +%s)
                else
                    db_time=0
                fi
                
                if [ "$db_time" -lt "$cutoff_time" ]; then
                    should_clean=true
                fi
            fi
        else
            # Orphaned database - clean it up
            should_clean=true
        fi
        
        if [ "$should_clean" = true ]; then
            print_step "Cleaning up old database: $db_name"
            if dropdb "$db_name" -U "$db_user" 2>/dev/null; then
                rm -f "$info_file"
                print_success "Cleaned up: $db_name"
                cleaned_count=$((cleaned_count + 1))
            else
                print_error "Failed to clean up: $db_name"
            fi
        fi
    done
    
    release_lock
    
    if [ "$cleaned_count" -eq 0 ]; then
        print_info "No databases needed cleanup"
    else
        print_success "Cleaned up $cleaned_count databases"
    fi
}

# Clean up all databases in the pool
cleanup_all() {
    local db_user=$(get_db_user)
    
    acquire_lock
    
    check_postgres || { release_lock; return 1; }
    
    print_step "Cleaning up all databases in pool"
    
    local databases=$(get_pool_databases)
    local cleaned_count=0
    
    echo "$databases" | while read -r db_name; do
        if [ -n "$db_name" ]; then
            print_step "Cleaning up database: $db_name"
            if dropdb "$db_name" -U "$db_user" 2>/dev/null; then
                rm -f "${POOL_DIR}/${db_name}.info"
                print_success "Cleaned up: $db_name"
                cleaned_count=$((cleaned_count + 1))
            else
                print_error "Failed to clean up: $db_name"
            fi
        fi
    done
    
    release_lock
    
    print_success "Pool cleanup complete"
}

# Show pool status
show_status() {
    check_postgres || return 1
    
    local current_count=$(count_pool_databases)
    echo "Database Pool Status:"
    echo "  Active databases: $current_count/$MAX_DATABASES"
    echo "  Available slots: $((MAX_DATABASES - current_count))"
}

# Manage database pool (enhanced version)
manage_pool() {
    local operation="$1"
    shift
    
    case "$operation" in
        status)
            print_header "Database Pool Status"
            show_status
            ;;
        list)
            print_header "Active Test Databases"
            list_databases
            ;;
        cleanup)
            print_header "Database Pool Cleanup"
            cleanup_old "${1:-24}"
            ;;
        cleanup-all)
            print_header "Database Pool Full Cleanup"
            print_info "This will remove ALL test databases"
            cleanup_all
            ;;
        allocate)
            # Internal operation for test-run.sh
            allocate_database "${1:-test}"
            ;;
        deallocate)
            # Internal operation for test-run.sh
            deallocate_database "$1"
            ;;
        *)
            print_error "Unknown pool operation: $operation"
            print_info "Available operations: status, list, cleanup, cleanup-all"
            print_info "Internal operations: allocate, deallocate"
            return 1
            ;;
    esac
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    manage_pool "$@"
fi