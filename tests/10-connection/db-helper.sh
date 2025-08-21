#!/bin/bash
# Database management helper using pooled database approach
# Provides database allocation and cleanup for tests

# Colors for output (only if not already defined)
if [ -z "$RED" ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
    
    print_step() { echo -e "${BLUE}→ $1${NC}"; }
    print_success() { echo -e "${GREEN}✓ $1${NC}"; }
    print_error() { echo -e "${RED}✗ $1${NC}"; }
    print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
fi

# Configuration - Use integrated monk CLI pool management
ALLOCATED_DB=""
ALLOCATED_DB_FILE=""

# Allocate a database for testing
allocate_test_database() {
    local test_name="${1:-test}"
    
    # Create temporary file to store database name
    ALLOCATED_DB_FILE=$(mktemp)
    
    print_step "Allocating test database for: $test_name"
    
    # Check if monk CLI is available
    if ! command -v monk >/dev/null 2>&1; then
        print_error "Monk CLI not found in PATH"
        return 1
    fi
    
    # Allocate database from integrated pool
    if allocated_output=$(monk pool allocate "$test_name" 2>&1); then
        # Extract database name (last line containing the database name)
        ALLOCATED_DB=$(echo "$allocated_output" | tail -n 1 | grep "^monk_api_test_" || echo "")
        
        if [ -n "$ALLOCATED_DB" ]; then
            print_success "Database allocated: $ALLOCATED_DB"
            
            # Store database name for cleanup
            echo "$ALLOCATED_DB" > "$ALLOCATED_DB_FILE"
            
            # Export for other scripts to use
            export MONK_TEST_DATABASE="$ALLOCATED_DB"
            export MONK_TEST_DB_ALLOCATED="true"
            
            return 0
        else
            print_error "Database allocation returned unexpected output"
            echo "$allocated_output" | sed 's/^/  /'
            return 1
        fi
    else
        print_error "Database allocation failed"
        echo "$allocated_output" | sed 's/^/  /'
        return 1
    fi
}

# Deallocate the test database
deallocate_test_database() {
    if [ -n "$ALLOCATED_DB" ] && [ -f "$ALLOCATED_DB_FILE" ]; then
        local db_to_clean="$ALLOCATED_DB"
        
        print_step "Deallocating test database: $db_to_clean"
        
        if monk pool deallocate "$db_to_clean" > /dev/null 2>&1; then
            print_success "Database deallocated: $db_to_clean"
        else
            print_error "Failed to deallocate database: $db_to_clean"
        fi
        
        # Clean up
        rm -f "$ALLOCATED_DB_FILE"
        unset MONK_TEST_DATABASE
        unset MONK_TEST_DB_ALLOCATED
        ALLOCATED_DB=""
        ALLOCATED_DB_FILE=""
    elif [ -n "${MONK_TEST_DATABASE}" ] && [ "${MONK_TEST_DB_ALLOCATED}" = "true" ]; then
        # Handle case where database was allocated in parent process
        print_step "Deallocating test database: $MONK_TEST_DATABASE"
        
        if monk pool deallocate "$MONK_TEST_DATABASE" > /dev/null 2>&1; then
            print_success "Database deallocated: $MONK_TEST_DATABASE"
        else
            print_error "Failed to deallocate database: $MONK_TEST_DATABASE"
        fi
        
        unset MONK_TEST_DATABASE
        unset MONK_TEST_DB_ALLOCATED
    fi
}

# Get the current allocated database name
get_allocated_database() {
    if [ -n "$ALLOCATED_DB" ]; then
        echo "$ALLOCATED_DB"
    elif [ -n "${MONK_TEST_DATABASE}" ]; then
        echo "$MONK_TEST_DATABASE"
    else
        return 1
    fi
}

# Setup trap for automatic cleanup
setup_database_cleanup_trap() {
    trap deallocate_test_database EXIT INT TERM
}

# Check if we have an allocated database
has_allocated_database() {
    [ -n "$ALLOCATED_DB" ] || [ -n "${MONK_TEST_DATABASE}" ]
}