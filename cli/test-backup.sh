#!/bin/bash
set -e

# Test Management CLI - Run and manage monk API tests
#
# Usage: monk test <command> [options]
#
# Commands:
#   all [pattern]           Run tests (all if no pattern, or matching pattern)
#   run <operation>         Manage test run environments
#   pool <operation>        Manage database pool
#   env [var_name]          Show test environment variables
#
# Test Pattern Examples:
#   monk test all            # Run all tests in numerical order
#   monk test all 00         # Run all tests in 00-* directories
#   monk test all 00-49      # Run tests in ranges 00 through 49
#   monk test all meta-api   # Run all tests matching *meta-api*
#   monk test all connection # Run all tests matching *connection*
#
# Test Run Examples:
#   monk test run main                    # Test current main branch HEAD
#   monk test run main abc123             # Test specific commit abc123
#   monk test run feature/API-281         # Test feature branch HEAD
#   monk test run feature/API-281 --clean # Force fresh build
#   monk test diff main feature/API-281   # Compare two versions
#   monk test run list                    # List all test environments
#   monk test run delete main-abc123      # Clean up test environment
#
# Pool Operations:
#   monk test pool status    # Show database pool status
#   monk test pool list      # List active test databases
#   monk test pool cleanup   # Clean up old databases
#
# Environment Examples:
#   monk test env            # Show all test environment variables
#   monk test env CLI_BASE_URL   # Show just the API server URL
#   monk test env JWT_TOKEN      # Show current JWT token

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Test configuration
TEST_BASE_DIR="../monk-api-test/tests"
DB_POOL_MANAGER="../monk-api-test/scripts/db-pool-manager.sh"
RUN_HISTORY_DIR="../monk-api-test/run-history"
ACTIVE_RUN_FILE="$RUN_HISTORY_DIR/.active-run"
API_SOURCE_DIR="../monk-api-hono"
PORT_TRACKER_FILE="$RUN_HISTORY_DIR/.port-tracker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
}

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

# Show usage information
show_usage() {
    cat << EOF
Usage: monk test <command> [options]

Test management and execution for Monk API test suite.

Commands:
  all [pattern]           Run tests (all if no pattern, or matching pattern)
  run <operation>         Manage test run environments
  pool <operation>        Manage database pool for testing
  env [var_name]          Show test environment variables

Test Patterns (for 'all' command):
  (no pattern)            Run all tests in numerical order (00-99)
  00                      Run all tests in 00-* directories
  00-49                   Run tests in ranges 00 through 49
  meta-api                Run all tests with 'meta-api' in path/name
  connection              Run all tests with 'connection' in path/name
  lifecycle               Run all tests with 'lifecycle' in path/name

Test Run Operations:
  <branch> [git-ref]      Create/update test environment for git reference
  list                    List all test run environments  
  delete <name>           Delete test run environment
  current                 Show current active test run
  diff <run1> <run2>      Compare test results between two environments

Pool Operations:
  status                  Show database pool status
  list                    List all active test databases  
  cleanup                 Clean up old test databases (24h+)
  cleanup-all             Clean up all test databases

Environment Variables:
  (no var_name)           Show all test environment variables
  CLI_BASE_URL            Show API server URL
  JWT_TOKEN               Show current JWT token
  DATABASE_URL            Show database connection URL
  TEST_DATABASE           Show current test database name

Examples:
  monk test all                    # Run complete test suite
  monk test all 00                 # Run setup tests only
  monk test all 10-29              # Run connection and meta API tests
  monk test all meta-api           # Run all meta API related tests
  monk test run main               # Test current main branch HEAD
  monk test run main abc123        # Test specific commit abc123
  monk test run feature/API-281    # Test feature branch HEAD
  monk test diff main feature/API-281  # Compare main vs feature branch
  monk test pool status            # Check database pool usage
  monk test env                    # Show current environment variables

Options:
  -v, --verbose           Show detailed test output
  -h, --help              Show this help message

Test Directory Structure:
  00-09: Setup and infrastructure tests
  10-19: Connection and authentication tests  
  20-29: Meta API tests
  30-39: Data API tests
  50-59: Integration tests
  60-69: Lifecycle tests
  70-79: Validation tests
  90-99: Error handling tests
EOF
}

# Check if test directory exists
check_test_directory() {
    if [ ! -d "$TEST_BASE_DIR" ]; then
        print_error "Test directory not found: $TEST_BASE_DIR"
        print_info "Make sure you're running this from the monk-cli directory"
        exit 1
    fi
}

# Find all test scripts (portable across Unix/Linux/macOS)
find_all_tests() {
    find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r file; do
        if [ -x "$file" ]; then
            echo "$file"
        fi
    done | sort
}

# Find tests matching a pattern (portable across Unix/Linux/macOS)
find_tests_by_pattern() {
    local pattern="$1"
    local temp_file
    
    # Create temporary file (portable across systems)
    if command -v mktemp >/dev/null 2>&1; then
        temp_file=$(mktemp)
    else
        temp_file="/tmp/monk_test_$$_$(date +%s)"
        touch "$temp_file"
    fi
    
    # Check if pattern is a number range (e.g., "00", "00-49") - portable regex
    if echo "$pattern" | grep -E '^[0-9]{2}(-[0-9]{2})?$' >/dev/null 2>&1; then
        # Extract start and end numbers using portable methods
        local start_num
        local end_num
        
        if echo "$pattern" | grep -q '-'; then
            start_num=$(echo "$pattern" | cut -d'-' -f1)
            end_num=$(echo "$pattern" | cut -d'-' -f2)
        else
            start_num="$pattern"
            end_num="$pattern"
        fi
        
        # Find tests in numeric range using portable approach
        for dir in "$TEST_BASE_DIR"/*; do
            if [ -d "$dir" ]; then
                local dir_name=$(basename "$dir")
                # Extract directory number using portable methods
                local dir_num=$(echo "$dir_name" | grep -o '^[0-9][0-9]' | head -1)
                
                if [ -n "$dir_num" ] && [ "$dir_num" -ge "$start_num" ] && [ "$dir_num" -le "$end_num" ]; then
                    # Find all executable .sh files in this directory (portable)
                    find "$dir" -name "*.sh" -type f | while read -r test_file; do
                        if [ -x "$test_file" ]; then
                            echo "$test_file"
                        fi
                    done >> "$temp_file"
                fi
            fi
        done
    else
        # Wildcard pattern matching (portable using grep)
        find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r test_file; do
            if [ -x "$test_file" ] && echo "$test_file" | grep -q "$pattern"; then
                echo "$test_file"
            fi
        done >> "$temp_file"
    fi
    
    # Sort and output the results
    if [ -s "$temp_file" ]; then
        sort "$temp_file"
    fi
    
    # Clean up
    rm -f "$temp_file"
}

# Run a single test
run_single_test() {
    local test_path="$1"
    local test_name=$(basename "$test_path" .sh)
    local test_dir=$(dirname "$test_path")
    
    print_step "Running: $test_name"
    
    if [ ! -x "$test_path" ]; then
        print_error "$test_name (not executable)"
        return 1
    fi
    
    # Change to test directory and run the test
    local start_time=$(date +%s)
    local test_output
    local test_result=0
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        # Show output in verbose mode
        (cd "$test_dir" && "./$(basename "$test_path")")
        test_result=$?
    else
        # Capture output and only show if test fails
        if test_output=$(cd "$test_dir" && "./$(basename "$test_path")" 2>&1); then
            test_result=0
        else
            test_result=$?
        fi
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ $test_result -eq 0 ]; then
        print_success "$test_name (${duration}s)"
        return 0
    else
        print_error "$test_name (${duration}s)"
        if [ "$CLI_VERBOSE" != "true" ] && [ -n "$test_output" ]; then
            echo "Test output:"
            echo "$test_output" | sed 's/^/  /'
        fi
        return 1
    fi
}

# Run all tests
run_all_tests() {
    print_header "Running All Tests"
    print_info "Executing complete test suite in numerical order"
    echo
    
    local tests_run=0
    local tests_passed=0
    local tests_failed=0
    local failed_tests=()
    
    # Use the comprehensive test runner from monk-api-test
    local comprehensive_runner="$TEST_BASE_DIR/run-all-tests.sh"
    
    if [ -x "$comprehensive_runner" ]; then
        print_info "Using comprehensive test runner"
        if [ "$CLI_VERBOSE" = "true" ]; then
            "$comprehensive_runner"
        else
            "$comprehensive_runner" 2>&1
        fi
        local result=$?
        
        if [ $result -eq 0 ]; then
            print_success "All tests passed!"
        else
            print_error "Some tests failed (exit code: $result)"
        fi
        
        return $result
    else
        # Fallback: run individual tests
        print_info "Running individual tests (comprehensive runner not found)"
        
        local all_tests
        all_tests=$(find_all_tests)
        
        if [ -z "$all_tests" ]; then
            print_error "No tests found"
            return 1
        fi
        
        while IFS= read -r test_path; do
            tests_run=$((tests_run + 1))
            
            if run_single_test "$test_path"; then
                tests_passed=$((tests_passed + 1))
            else
                tests_failed=$((tests_failed + 1))
                failed_tests+=("$(basename "$test_path" .sh)")
            fi
        done << EOF
$all_tests
EOF
        
        # Results summary
        print_header "Test Results Summary"
        echo "Tests Run: $tests_run"
        echo "Tests Passed: $tests_passed"
        echo "Tests Failed: $tests_failed"
        
        if [ $tests_failed -eq 0 ]; then
            print_success "All tests passed!"
            return 0
        else
            print_error "Failed tests:"
            for failed_test in "${failed_tests[@]}"; do
                echo "  - $failed_test"
            done
            return 1
        fi
    fi
}

# Run tests matching pattern (now used by 'all' command)
run_tests_with_pattern() {
    local pattern="$1"
    
    if [ -z "$pattern" ]; then
        # No pattern means run all tests
        run_all_tests
        return $?
    fi
    
    print_header "Running Tests Matching: $pattern"
    
    local matching_tests
    matching_tests=$(find_tests_by_pattern "$pattern")
    
    if [ -z "$matching_tests" ]; then
        print_error "No tests found matching pattern: $pattern"
        print_info "Available patterns: 00, 00-49, meta-api, connection, lifecycle, etc."
        return 1
    fi
    
    local test_count
    test_count=$(echo "$matching_tests" | wc -l | tr -d ' ')
    print_info "Found $test_count matching tests"
    echo
    
    local tests_run=0
    local tests_passed=0
    local tests_failed=0
    local failed_tests=()
    
    while IFS= read -r test_path; do
        if [ -n "$test_path" ]; then
            tests_run=$((tests_run + 1))
            
            if run_single_test "$test_path"; then
                tests_passed=$((tests_passed + 1))
            else
                tests_failed=$((tests_failed + 1))
                failed_tests+=("$(basename "$test_path" .sh)")
            fi
        fi
    done << EOF
$matching_tests
EOF
    
    # Results summary
    print_header "Pattern Test Results"
    echo "Pattern: $pattern"
    echo "Tests Run: $tests_run"
    echo "Tests Passed: $tests_passed"
    echo "Tests Failed: $tests_failed"
    
    if [ $tests_failed -eq 0 ]; then
        print_success "All pattern tests passed!"
        return 0
    else
        print_error "Failed tests:"
        for failed_test in "${failed_tests[@]}"; do
            echo "  - $failed_test"
        done
        return 1
    fi
}

# Manage database pool
manage_pool() {
    local operation="$1"
    
    if [ ! -x "$DB_POOL_MANAGER" ]; then
        print_error "Database pool manager not found: $DB_POOL_MANAGER"
        print_info "Make sure monk-api-test is set up correctly"
        return 1
    fi
    
    case "$operation" in
        status)
            print_header "Database Pool Status"
            "$DB_POOL_MANAGER" status
            ;;
        list)
            print_header "Active Test Databases"
            "$DB_POOL_MANAGER" list
            ;;
        cleanup)
            print_header "Database Pool Cleanup"
            "$DB_POOL_MANAGER" cleanup-old
            ;;
        cleanup-all)
            print_header "Database Pool Full Cleanup"
            print_info "This will remove ALL test databases"
            "$DB_POOL_MANAGER" cleanup-all
            ;;
        *)
            print_error "Unknown pool operation: $operation"
            print_info "Available operations: status, list, cleanup, cleanup-all"
            return 1
            ;;
    esac
}

# Manage git-aware test run environments
manage_test_runs() {
    local branch_or_operation="$1"
    shift
    
    # Ensure run history directory exists
    mkdir -p "$RUN_HISTORY_DIR"
    
    # Check if this is a standard operation or a git reference
    case "$branch_or_operation" in
        list)
            list_test_runs
            ;;
        delete)
            delete_test_run "$1"
            ;;
        current)
            show_current_test_run
            ;;
        diff)
            compare_test_runs "$1" "$2"
            ;;
        *)
            # Treat as git reference (branch/commit)
            create_or_update_test_run "$branch_or_operation" "$@"
            ;;
    esac
}

# Get next available port for test runs
get_next_port() {
    local start_port=3000
    local max_attempts=50
    
    # Initialize port tracker if it doesn't exist
    if [ ! -f "$PORT_TRACKER_FILE" ]; then
        echo "$start_port" > "$PORT_TRACKER_FILE"
    fi
    
    # Check existing run ports to avoid conflicts
    local used_ports=""
    if [ -d "$RUN_HISTORY_DIR" ]; then
        for run_dir in "$RUN_HISTORY_DIR"/*; do
            if [ -d "$run_dir" ] && [ -f "$run_dir/.run-info" ]; then
                local port=$(grep "server_port=" "$run_dir/.run-info" 2>/dev/null | cut -d'=' -f2)
                if [ -n "$port" ]; then
                    used_ports="$used_ports $port"
                fi
            fi
        done
    fi
    
    # Find next available port
    local test_port=$start_port
    for i in $(seq 1 $max_attempts); do
        if ! echo "$used_ports" | grep -q " $test_port "; then
            # Check if port is actually available
            if ! lsof -i ":$test_port" >/dev/null 2>&1; then
                echo "$test_port"
                return 0
            fi
        fi
        test_port=$((test_port + 1))
    done
    
    print_error "Could not find available port after $max_attempts attempts"
    return 1
}

# Generate run name from git reference
generate_run_name() {
    local git_ref="$1"
    local commit_ref="$2"
    
    # Clean up branch name (replace slashes with dashes)
    local clean_branch=$(echo "$git_ref" | sed 's/[^a-zA-Z0-9._-]/-/g')
    
    # If specific commit provided, use it
    if [ -n "$commit_ref" ]; then
        # Get short commit hash
        local short_commit
        if short_commit=$(cd "$API_SOURCE_DIR" && git rev-parse --short "$commit_ref" 2>/dev/null); then
            echo "${clean_branch}-${short_commit}"
        else
            echo "${clean_branch}-${commit_ref}"
        fi
    else
        # Use current HEAD of the branch
        local short_commit
        if short_commit=$(cd "$API_SOURCE_DIR" && git rev-parse --short "$git_ref" 2>/dev/null); then
            echo "${clean_branch}-${short_commit}"
        else
            echo "$clean_branch"
        fi
    fi
}

# Create or update git-aware test run environment
create_or_update_test_run() {
    local git_ref="$1"
    local commit_ref=""
    local clean_build=false
    local port=""
    local description=""
    
    if [ -z "$git_ref" ]; then
        print_error "Git reference required"
        print_info "Usage: monk test run <branch> [commit] [--clean] [--port PORT]"
        return 1
    fi
    
    # Parse additional arguments
    shift
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clean)
                clean_build=true
                shift
                ;;
            --port)
                port="$2"
                shift 2
                ;;
            --description)
                description="$2"
                shift 2
                ;;
            -*)
                print_error "Unknown option: $1"
                return 1
                ;;
            *)
                # Assume it's a commit reference
                if [ -z "$commit_ref" ]; then
                    commit_ref="$1"
                    shift
                else
                    print_error "Too many arguments: $1"
                    return 1
                fi
                ;;
        esac
    done
    
    # Validate API source directory
    if [ ! -d "$API_SOURCE_DIR" ]; then
        print_error "API source directory not found: $API_SOURCE_DIR"
        return 1
    fi
    
    # Validate git reference
    local target_ref="$git_ref"
    if [ -n "$commit_ref" ]; then
        target_ref="$commit_ref"
    fi
    
    if ! (cd "$API_SOURCE_DIR" && git rev-parse --verify "$target_ref" >/dev/null 2>&1); then
        print_error "Invalid git reference: $target_ref"
        print_info "Make sure the branch/commit exists in $API_SOURCE_DIR"
        return 1
    fi
    
    # Generate run name and setup paths
    local run_name=$(generate_run_name "$git_ref" "$commit_ref")
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    local api_build_dir="$run_dir/api-build"
    local existing_run=false
    
    if [ -d "$run_dir" ]; then
        existing_run=true
        if [ "$clean_build" = true ]; then
            print_step "Clean build requested - removing existing environment: $run_name"
            rm -rf "$run_dir"
            existing_run=false
        else
            print_step "Updating existing test run environment: $run_name"
        fi
    else
        print_step "Creating new test run environment: $run_name"
    fi
    
    # Create run directory
    mkdir -p "$run_dir"
    
    # Handle database allocation
    local db_name=""
    if [ "$existing_run" = true ] && [ -f "$run_dir/.run-info" ]; then
        # Reuse existing database
        db_name=$(grep "database_name=" "$run_dir/.run-info" | cut -d'=' -f2)
        print_info "Reusing existing database: $db_name"
    else
        # Allocate new database from pool
        if db_name=$("$DB_POOL_MANAGER" allocate "$run_name" 2>&1); then
            db_name=$(echo "$db_name" | tail -n 1 | grep "^monk_api_test_" || echo "")
            if [ -z "$db_name" ]; then
                print_error "Failed to get database name from pool"
                return 1
            fi
        else
            print_error "Failed to allocate database from pool"
            return 1
        fi
    fi
    
    # Handle port allocation
    if [ -z "$port" ]; then
        if [ "$existing_run" = true ] && [ -f "$run_dir/.run-info" ]; then
            # Reuse existing port
            port=$(grep "server_port=" "$run_dir/.run-info" | cut -d'=' -f2)
        else
            # Get next available port
            port=$(get_next_port)
            if [ -z "$port" ]; then
                print_error "Failed to allocate port"
                return 1
            fi
        fi
    fi
    
    # Handle API build (smart caching)
    setup_api_build "$api_build_dir" "$git_ref" "$commit_ref" "$clean_build"
    local build_result=$?
    
    if [ $build_result -ne 0 ]; then
        print_error "API build failed"
        return 1
    fi
    
    # Get actual commit hash for metadata
    local actual_commit
    actual_commit=$(cd "$api_build_dir" && git rev-parse HEAD)
    local short_commit
    short_commit=$(cd "$api_build_dir" && git rev-parse --short HEAD)
    
    # Create/update run info file
    cat > "$run_dir/.run-info" << EOF
name=$run_name
created_at=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
updated_at=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
description=$description
database_name=$db_name
server_port=$port
git_branch=$git_ref
git_commit_full=$actual_commit
git_commit_short=$short_commit
build_clean=$clean_build
EOF
    
    # Create/update environment file
    cat > "$run_dir/.env.test-run" << EOF
# Test Run Environment: $run_name
# Git Reference: $git_ref ($short_commit)
# Updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# API Server Configuration
CLI_BASE_URL=http://localhost:$port
SERVER_PORT=$port

# Database Configuration  
TEST_DATABASE=$db_name
MONK_TEST_DATABASE=$db_name

# Git Information
GIT_BRANCH=$git_ref
GIT_COMMIT=$actual_commit
GIT_COMMIT_SHORT=$short_commit

# Test Run Info
TEST_RUN_NAME=$run_name
TEST_RUN_DESCRIPTION=$description
EOF
    
    if [ "$existing_run" = true ]; then
        print_success "Test run environment updated: $run_name"
    else
        print_success "Test run environment created: $run_name"
    fi
    
    print_info "Git Reference: $git_ref ($short_commit)"
    print_info "Database: $db_name"
    print_info "Server Port: $port"
    if [ -n "$description" ]; then
        print_info "Description: $description"
    fi
    
    # Set as active run
    echo "$run_name" > "$ACTIVE_RUN_FILE"
    print_success "Activated test run: $run_name"
    
    # Start the API server
    start_test_run_server "$run_name"
}

# Smart API build setup with git caching
setup_api_build() {
    local build_dir="$1"
    local git_ref="$2"
    local commit_ref="$3"
    local clean_build="$4"
    
    local target_ref="$git_ref"
    if [ -n "$commit_ref" ]; then
        target_ref="$commit_ref"
    fi
    
    if [ "$clean_build" = true ] && [ -d "$build_dir" ]; then
        print_step "Clean build: removing existing API build directory"
        rm -rf "$build_dir"
    fi
    
    if [ -d "$build_dir" ]; then
        # Existing build - update incrementally
        print_step "Updating existing API build"
        
        cd "$build_dir"
        
        # Fetch latest changes
        if ! git fetch origin >/dev/null 2>&1; then
            print_error "Failed to fetch from origin"
            return 1
        fi
        
        # Check if we need to update
        local current_commit=$(git rev-parse HEAD)
        local target_commit
        if ! target_commit=$(git rev-parse "$target_ref" 2>/dev/null); then
            print_error "Failed to resolve target reference: $target_ref"
            return 1
        fi
        
        if [ "$current_commit" = "$target_commit" ]; then
            print_info "API build is already up to date ($target_commit)"
        else
            print_step "Checking out $target_ref ($target_commit)"
            if ! git checkout "$target_ref" >/dev/null 2>&1; then
                print_error "Failed to checkout $target_ref"
                return 1
            fi
            
            # Update dependencies and rebuild
            print_step "Updating dependencies"
            if ! npm install >/dev/null 2>&1; then
                print_error "npm install failed"
                return 1
            fi
            
            print_step "Building API"
            if ! npm run build >/dev/null 2>&1; then
                print_error "npm run build failed"
                return 1
            fi
            
            print_success "API build updated to $target_ref"
        fi
    else
        # Fresh build - clone and setup
        print_step "Creating fresh API build"
        
        # Clone the API source
        if ! git clone "$API_SOURCE_DIR" "$build_dir" >/dev/null 2>&1; then
            print_error "Failed to clone API source"
            return 1
        fi
        
        cd "$build_dir"
        
        # Checkout target reference
        print_step "Checking out $target_ref"
        if ! git checkout "$target_ref" >/dev/null 2>&1; then
            print_error "Failed to checkout $target_ref"
            return 1
        fi
        
        # Install dependencies
        print_step "Installing dependencies"
        if ! npm install >/dev/null 2>&1; then
            print_error "npm install failed"
            return 1
        fi
        
        # Build
        print_step "Building API"
        if ! npm run build >/dev/null 2>&1; then
            print_error "npm run build failed"
            return 1
        fi
        
        print_success "Fresh API build completed"
    fi
    
    return 0
}

# Start API server for test run
start_test_run_server() {
    local run_name="$1"
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    local api_build_dir="$run_dir/api-build"
    
    if [ ! -f "$run_dir/.run-info" ]; then
        print_error "Test run info not found: $run_name"
        return 1
    fi
    
    local port=$(grep "server_port=" "$run_dir/.run-info" | cut -d'=' -f2)
    local db_name=$(grep "database_name=" "$run_dir/.run-info" | cut -d'=' -f2)
    
    print_step "Starting API server for test run: $run_name"
    
    # Check if server is already running on this port
    if lsof -i ":$port" >/dev/null 2>&1; then
        print_info "Server already running on port $port"
        return 0
    fi
    
    # Start server in background
    cd "$api_build_dir"
    PORT="$port" DATABASE_URL="postgresql://$(whoami)@localhost:5432/$db_name" npm run start > /dev/null 2>&1 &
    local server_pid=$!
    
    # Store server PID
    echo "$server_pid" > "$run_dir/.server-pid"
    
    # Wait a moment and check if it started
    sleep 2
    if ps -p "$server_pid" > /dev/null 2>&1; then
        print_success "API server started on port $port (PID: $server_pid)"
        
        # Authenticate with this server
        print_step "Authenticating with test database: $db_name"
        if CLI_BASE_URL="http://localhost:$port" monk auth login --domain "$db_name"; then
            print_success "Authentication successful"
        else
            print_error "Authentication failed"
            return 1
        fi
    else
        print_error "Failed to start API server"
        return 1
    fi
}

# Compare test results between two test runs
compare_test_runs() {
    local run1="$1"
    local run2="$2"
    
    if [ -z "$run1" ] || [ -z "$run2" ]; then
        print_error "Two test run names required"
        print_info "Usage: monk test diff <run1> <run2>"
        return 1
    fi
    
    local run1_dir="$RUN_HISTORY_DIR/$run1"
    local run2_dir="$RUN_HISTORY_DIR/$run2"
    
    # Validate both test runs exist
    if [ ! -d "$run1_dir" ]; then
        print_error "Test run not found: $run1"
        return 1
    fi
    
    if [ ! -d "$run2_dir" ]; then
        print_error "Test run not found: $run2"
        return 1
    fi
    
    print_header "Test Run Comparison: $run1 vs $run2"
    
    # Show git info for both runs
    if [ -f "$run1_dir/.run-info" ] && [ -f "$run2_dir/.run-info" ]; then
        local run1_commit=$(grep "git_commit_short=" "$run1_dir/.run-info" | cut -d'=' -f2)
        local run1_branch=$(grep "git_branch=" "$run1_dir/.run-info" | cut -d'=' -f2)
        local run2_commit=$(grep "git_commit_short=" "$run2_dir/.run-info" | cut -d'=' -f2)
        local run2_branch=$(grep "git_branch=" "$run2_dir/.run-info" | cut -d'=' -f2)
        
        echo "Run 1: $run1_branch ($run1_commit)"
        echo "Run 2: $run2_branch ($run2_commit)"
        echo
    fi
    
    # Ensure both servers are running
    ensure_test_run_server "$run1"
    ensure_test_run_server "$run2"
    
    # Run tests on both environments in parallel
    print_step "Running tests on both environments"
    
    # TODO: Implement parallel test execution and comparison
    print_info "Test comparison functionality coming soon..."
    print_info "For now, you can manually run tests on each environment:"
    echo "  1. monk test run use $run1 && monk test all"
    echo "  2. monk test run use $run2 && monk test all"
}

# Ensure test run server is running
ensure_test_run_server() {
    local run_name="$1"
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    
    if [ ! -f "$run_dir/.run-info" ]; then
        print_error "Test run not found: $run_name"
        return 1
    fi
    
    local port=$(grep "server_port=" "$run_dir/.run-info" | cut -d'=' -f2)
    
    # Check if server is running
    if lsof -i ":$port" >/dev/null 2>&1; then
        print_info "Server for $run_name is already running on port $port"
        return 0
    fi
    
    # Start the server
    start_test_run_server "$run_name"
}

# List all test run environments
list_test_runs() {
    print_header "Test Run Environments"
    
    if [ ! -d "$RUN_HISTORY_DIR" ] || [ -z "$(ls -A "$RUN_HISTORY_DIR" 2>/dev/null)" ]; then
        print_info "No test run environments found"
        print_info "Use 'monk test run create <name>' to create one"
        return 0
    fi
    
    local active_run=""
    if [ -f "$ACTIVE_RUN_FILE" ]; then
        active_run=$(cat "$ACTIVE_RUN_FILE")
    fi
    
    printf "%-20s %-10s %-20s %-30s %s\n" "Name" "Port" "Created" "Database" "Description"
    echo "--------------------------------------------------------------------------------"
    
    for run_dir in "$RUN_HISTORY_DIR"/*; do
        if [ -d "$run_dir" ] && [ "$(basename "$run_dir")" != ".*" ]; then
            local run_name=$(basename "$run_dir")
            local info_file="$run_dir/.run-info"
            
            if [ -f "$info_file" ]; then
                local port=$(grep "server_port=" "$info_file" | cut -d'=' -f2)
                local created=$(grep "created_at=" "$info_file" | cut -d'=' -f2)
                local db_name=$(grep "database_name=" "$info_file" | cut -d'=' -f2)
                local desc=$(grep "description=" "$info_file" | cut -d'=' -f2)
                
                local marker=""
                if [ "$run_name" = "$active_run" ]; then
                    marker="*"
                fi
                
                printf "%-20s %-10s %-20s %-30s %s %s\n" "$run_name" "$port" "$created" "$db_name" "$desc" "$marker"
            else
                printf "%-20s %-10s %-20s %-30s %s\n" "$run_name" "?" "?" "?" "(corrupted)"
            fi
        fi
    done
    
    echo
    if [ -n "$active_run" ]; then
        print_info "Active run: $active_run (marked with *)"
    else
        print_info "No active run selected"
    fi
}

# Switch to a test run environment
use_test_run() {
    local run_name="$1"
    
    if [ -z "$run_name" ]; then
        print_error "Test run name required"
        print_info "Usage: monk test run use <name>"
        return 1
    fi
    
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    
    if [ ! -d "$run_dir" ]; then
        print_error "Test run '$run_name' not found"
        print_info "Use 'monk test run list' to see available runs"
        return 1
    fi
    
    # Set as active run
    echo "$run_name" > "$ACTIVE_RUN_FILE"
    
    print_success "Switched to test run: $run_name"
    
    # Show environment info
    if [ -f "$run_dir/.run-info" ]; then
        local port=$(grep "server_port=" "$run_dir/.run-info" | cut -d'=' -f2)
        local db_name=$(grep "database_name=" "$run_dir/.run-info" | cut -d'=' -f2)
        print_info "Server Port: $port"
        print_info "Database: $db_name"
    fi
}

# Delete a test run environment
delete_test_run() {
    local run_name="$1"
    
    if [ -z "$run_name" ]; then
        print_error "Test run name required"
        print_info "Usage: monk test run delete <name>"
        return 1
    fi
    
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    
    if [ ! -d "$run_dir" ]; then
        print_error "Test run '$run_name' not found"
        return 1
    fi
    
    # Get database name for cleanup
    local db_name=""
    if [ -f "$run_dir/.run-info" ]; then
        db_name=$(grep "database_name=" "$run_dir/.run-info" | cut -d'=' -f2)
    fi
    
    print_step "Deleting test run environment: $run_name"
    
    # Clean up database if it exists
    if [ -n "$db_name" ]; then
        print_step "Deallocating database: $db_name"
        if "$DB_POOL_MANAGER" deallocate "$db_name" > /dev/null 2>&1; then
            print_success "Database deallocated: $db_name"
        else
            print_error "Failed to deallocate database: $db_name"
        fi
    fi
    
    # Remove run directory
    rm -rf "$run_dir"
    
    # Clear active run if this was the active one
    if [ -f "$ACTIVE_RUN_FILE" ]; then
        local active_run=$(cat "$ACTIVE_RUN_FILE")
        if [ "$active_run" = "$run_name" ]; then
            rm -f "$ACTIVE_RUN_FILE"
            print_info "Cleared active run (was deleted run)"
        fi
    fi
    
    print_success "Test run environment deleted: $run_name"
}

# Show current active test run
show_current_test_run() {
    if [ -f "$ACTIVE_RUN_FILE" ]; then
        local active_run=$(cat "$ACTIVE_RUN_FILE")
        local run_dir="$RUN_HISTORY_DIR/$active_run"
        
        if [ -d "$run_dir" ] && [ -f "$run_dir/.run-info" ]; then
            print_header "Current Active Test Run"
            echo "Name: $active_run"
            
            local port=$(grep "server_port=" "$run_dir/.run-info" | cut -d'=' -f2)
            local created=$(grep "created_at=" "$run_dir/.run-info" | cut -d'=' -f2)
            local db_name=$(grep "database_name=" "$run_dir/.run-info" | cut -d'=' -f2)
            local desc=$(grep "description=" "$run_dir/.run-info" | cut -d'=' -f2)
            
            echo "Server Port: $port"
            echo "Database: $db_name"
            echo "Created: $created"
            if [ -n "$desc" ]; then
                echo "Description: $desc"
            fi
        else
            print_error "Active run '$active_run' is corrupted or missing"
            print_info "Clearing active run reference"
            rm -f "$ACTIVE_RUN_FILE"
        fi
    else
        print_info "No active test run selected"
        print_info "Use 'monk test run list' to see available runs"
        print_info "Use 'monk test run create <name>' to create a new run"
    fi
}

# Show test environment variables
show_test_env() {
    local var_name="$1"
    
    # Check if there's an active test run
    local active_run=""
    local run_dir=""
    if [ -f "$ACTIVE_RUN_FILE" ]; then
        active_run=$(cat "$ACTIVE_RUN_FILE")
        run_dir="$RUN_HISTORY_DIR/$active_run"
    fi
    
    # Get current environment values (prioritize active test run)
    local cli_base_url="${CLI_BASE_URL:-http://localhost:3000}"
    local jwt_token=""
    local database_url="${DATABASE_URL:-postgresql://$(whoami)@localhost:5432/}"
    local test_database="${MONK_TEST_DATABASE:-}"
    local db_pool_max="${MONK_DB_POOL_MAX:-10}"
    local test_run_name="${TEST_RUN_NAME:-}"
    local test_run_description="${TEST_RUN_DESCRIPTION:-}"
    
    # Override with active test run configuration if available
    if [ -n "$active_run" ] && [ -f "$run_dir/.env.test-run" ]; then
        # Source the test run environment
        while IFS='=' read -r key value; do
            case "$key" in
                CLI_BASE_URL) cli_base_url="$value" ;;
                TEST_DATABASE|MONK_TEST_DATABASE) test_database="$value" ;;
                TEST_RUN_NAME) test_run_name="$value" ;;
                TEST_RUN_DESCRIPTION) test_run_description="$value" ;;
            esac
        done < "$run_dir/.env.test-run"
    fi
    
    # Get JWT token if available
    local jwt_token_file="${HOME}/.monk-jwt-token"
    if [ -f "$jwt_token_file" ]; then
        jwt_token=$(cat "$jwt_token_file")
    fi
    
    # Detect current server status
    local server_status="stopped"
    local server_port=""
    local hono_pid_file="${HOME}/.monk-hono.pid"
    local hono_port_file="${HOME}/.monk-hono.port"
    
    if [ -f "$hono_pid_file" ] && [ -f "$hono_port_file" ]; then
        local pid=$(cat "$hono_pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            server_status="running"
            server_port=$(cat "$hono_port_file")
            cli_base_url="http://localhost:$server_port"
        fi
    fi
    
    # Database connection details
    local db_host="localhost"
    local db_port="5432"
    local db_user=$(whoami)
    
    # Parse DATABASE_URL if set
    if [ -n "$DATABASE_URL" ]; then
        if echo "$DATABASE_URL" | grep -q "@"; then
            db_user=$(echo "$DATABASE_URL" | sed 's/.*:\/\/\([^@]*\)@.*/\1/')
            db_host=$(echo "$DATABASE_URL" | sed 's/.*@\([^:]*\):.*/\1/')
            db_port=$(echo "$DATABASE_URL" | sed 's/.*:\([0-9]*\)\/.*/\1/')
        fi
    fi
    
    # If specific variable requested, return just the value
    if [ -n "$var_name" ]; then
        case "$var_name" in
            CLI_BASE_URL)
                echo "$cli_base_url"
                ;;
            JWT_TOKEN)
                echo "$jwt_token"
                ;;
            DATABASE_URL)
                echo "$database_url"
                ;;
            TEST_DATABASE)
                echo "$test_database"
                ;;
            DB_HOST)
                echo "$db_host"
                ;;
            DB_PORT)
                echo "$db_port"
                ;;
            DB_USER)
                echo "$db_user"
                ;;
            SERVER_STATUS)
                echo "$server_status"
                ;;
            SERVER_PORT)
                echo "$server_port"
                ;;
            DB_POOL_MAX)
                echo "$db_pool_max"
                ;;
            TEST_RUN_NAME)
                echo "$test_run_name"
                ;;
            TEST_RUN_DESCRIPTION)
                echo "$test_run_description"
                ;;
            *)
                print_error "Unknown environment variable: $var_name"
                print_info "Available variables: CLI_BASE_URL, JWT_TOKEN, DATABASE_URL, TEST_DATABASE, DB_HOST, DB_PORT, DB_USER, SERVER_STATUS, SERVER_PORT, DB_POOL_MAX, TEST_RUN_NAME, TEST_RUN_DESCRIPTION"
                return 1
                ;;
        esac
    else
        # Show all environment variables
        print_header "Test Environment Variables"
        echo
        echo "# API Server Configuration"
        echo "CLI_BASE_URL=$cli_base_url"
        echo "SERVER_STATUS=$server_status"
        if [ -n "$server_port" ]; then
            echo "SERVER_PORT=$server_port"
        fi
        echo
        echo "# Authentication"
        if [ -n "$jwt_token" ]; then
            echo "JWT_TOKEN=$jwt_token"
        else
            echo "JWT_TOKEN="
        fi
        echo
        echo "# Database Configuration"
        echo "DATABASE_URL=$database_url"
        echo "DB_HOST=$db_host"
        echo "DB_PORT=$db_port"
        echo "DB_USER=$db_user"
        if [ -n "$test_database" ]; then
            echo "TEST_DATABASE=$test_database"
        else
            echo "TEST_DATABASE="
        fi
        echo
        echo "# Test Configuration"
        echo "DB_POOL_MAX=$db_pool_max"
        if [ -n "${CLI_VERBOSE:-}" ]; then
            echo "CLI_VERBOSE=$CLI_VERBOSE"
        else
            echo "CLI_VERBOSE="
        fi
        echo
        echo "# Test Run Information"
        if [ -n "$active_run" ]; then
            echo "TEST_RUN_ACTIVE=$active_run"
            echo "TEST_RUN_NAME=$test_run_name"
            echo "TEST_RUN_DESCRIPTION=$test_run_description"
        else
            echo "TEST_RUN_ACTIVE="
            echo "TEST_RUN_NAME="
            echo "TEST_RUN_DESCRIPTION="
        fi
        echo
        print_info "Usage: monk test env [VAR_NAME] to get specific variable value"
        print_info "Usage: eval \"\$(monk test env)\" to export all variables"
        if [ -n "$active_run" ]; then
            print_info "Active test run: $active_run"
        fi
    fi
}

# Main command handling
main() {
    # Check test directory exists
    check_test_directory
    
    if [ $# -eq 0 ]; then
        show_usage
        return 1
    fi
    
    local command="$1"
    shift
    
    # Parse global options
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                export CLI_VERBOSE=true
                shift
                ;;
            -h|--help)
                show_usage
                return 0
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                return 1
                ;;
            *)
                # Put the argument back for command processing
                set -- "$1" "$@"
                break
                ;;
        esac
    done
    
    case "$command" in
        all)
            run_tests_with_pattern "$1"
            ;;
        run)
            manage_test_runs "$@"
            ;;
        pool)
            manage_pool "$1"
            ;;
        env)
            show_test_env "$1"
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            print_info "Available commands: all, run, pool, env"
            print_info "Use 'monk test --help' for more information"
            return 1
            ;;
    esac
}

main "$@"