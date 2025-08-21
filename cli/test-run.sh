#!/bin/bash
set -e

# Test Run Management - Git-aware test environment management
# Handles creation, updating, and management of isolated test environments

# Load common functions
source "$(dirname "$0")/common.sh"

# Test configuration  
DB_POOL_SCRIPT="$(dirname "$0")/test-pool.sh"
RUN_HISTORY_DIR="$(get_run_history_dir)"
ACTIVE_RUN_FILE="$RUN_HISTORY_DIR/.active-run"
API_SOURCE_DIR="$(get_monk_api_dir)"
PORT_TRACKER_FILE="$RUN_HISTORY_DIR/.port-tracker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Get next available port for test runs
get_next_port() {
    local start_port=3000
    local max_attempts=50
    
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
        if db_name=$("$DB_POOL_SCRIPT" allocate "$run_name" 2>&1); then
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

# List all test run environments
list_test_runs() {
    print_header "Test Run Environments"
    
    if [ ! -d "$RUN_HISTORY_DIR" ] || [ -z "$(ls -A "$RUN_HISTORY_DIR" 2>/dev/null)" ]; then
        print_info "No test run environments found"
        print_info "Use 'monk test run <branch>' to create one"
        return 0
    fi
    
    local active_run=""
    if [ -f "$ACTIVE_RUN_FILE" ]; then
        active_run=$(cat "$ACTIVE_RUN_FILE")
    fi
    
    printf "%-25s %-8s %-12s %-20s %-35s %s\n" "Name" "Port" "Status" "Git Commit" "Database" "Description"
    echo "--------------------------------------------------------------------------------------------"
    
    for run_dir in "$RUN_HISTORY_DIR"/*; do
        if [ -d "$run_dir" ] && [ "$(basename "$run_dir")" != ".*" ]; then
            local run_name=$(basename "$run_dir")
            local info_file="$run_dir/.run-info"
            
            if [ -f "$info_file" ]; then
                local port=$(grep "server_port=" "$info_file" | cut -d'=' -f2)
                local git_commit=$(grep "git_commit_short=" "$info_file" | cut -d'=' -f2)
                local db_name=$(grep "database_name=" "$info_file" | cut -d'=' -f2)
                local desc=$(grep "description=" "$info_file" | cut -d'=' -f2)
                
                # Check server status
                local status="stopped"
                if lsof -i ":$port" >/dev/null 2>&1; then
                    status="running"
                fi
                
                local marker=""
                if [ "$run_name" = "$active_run" ]; then
                    marker="*"
                fi
                
                printf "%-25s %-8s %-12s %-20s %-35s %s %s\n" "$run_name" "$port" "$status" "$git_commit" "$db_name" "$desc" "$marker"
            else
                printf "%-25s %-8s %-12s %-20s %-35s %s\n" "$run_name" "?" "?" "?" "?" "(corrupted)"
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
        local git_commit=$(grep "git_commit_short=" "$run_dir/.run-info" | cut -d'=' -f2)
        print_info "Git Commit: $git_commit"
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
    
    # Get metadata for cleanup
    local db_name=""
    local server_pid=""
    if [ -f "$run_dir/.run-info" ]; then
        db_name=$(grep "database_name=" "$run_dir/.run-info" | cut -d'=' -f2)
    fi
    if [ -f "$run_dir/.server-pid" ]; then
        server_pid=$(cat "$run_dir/.server-pid")
    fi
    
    print_step "Deleting test run environment: $run_name"
    
    # Stop server if running
    if [ -n "$server_pid" ] && ps -p "$server_pid" > /dev/null 2>&1; then
        print_step "Stopping API server (PID: $server_pid)"
        kill "$server_pid" 2>/dev/null || true
        print_success "Server stopped"
    fi
    
    # Clean up database if it exists
    if [ -n "$db_name" ]; then
        print_step "Deallocating database: $db_name"
        if "$DB_POOL_SCRIPT" deallocate "$db_name" > /dev/null 2>&1; then
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
            local git_commit=$(grep "git_commit_short=" "$run_dir/.run-info" | cut -d'=' -f2)
            local git_branch=$(grep "git_branch=" "$run_dir/.run-info" | cut -d'=' -f2)
            local desc=$(grep "description=" "$run_dir/.run-info" | cut -d'=' -f2)
            
            echo "Git Reference: $git_branch ($git_commit)"
            echo "Server Port: $port"
            echo "Database: $db_name"
            echo "Created: $created"
            if [ -n "$desc" ]; then
                echo "Description: $desc"
            fi
            
            # Check server status
            if lsof -i ":$port" >/dev/null 2>&1; then
                print_success "API server is running on port $port"
            else
                print_info "API server is not running (use 'monk test run $active_run' to start)"
            fi
        else
            print_error "Active run '$active_run' is corrupted or missing"
            print_info "Clearing active run reference"
            rm -f "$ACTIVE_RUN_FILE"
        fi
    else
        print_info "No active test run selected"
        print_info "Use 'monk test run list' to see available runs"
        print_info "Use 'monk test run <branch>' to create a new run"
    fi
}

# Show usage for test run management
show_test_run_usage() {
    cat << EOF
Usage: monk test git <branch> [commit] [options]

Create or update test environment for git reference.

Arguments:
  <branch>               Git branch name (e.g. main, feature/API-281)
  [commit]               Optional specific commit hash

Options:
  --clean                Force clean rebuild (removes existing build cache)
  --port <port>          Use specific port (default: auto-assign from 3000+)
  --description <text>   Add description to test run

Examples:
  monk test git main                          # Test current main branch HEAD
  monk test git main abc123                   # Test specific commit abc123
  monk test git feature/API-281 --clean      # Force fresh build of feature
  monk test git main --port 3005              # Use specific port
  monk test git main --description "Release candidate"

Related Commands:
  monk test list                              # List all test environments
  monk test current                           # Show active environment  
  monk test use <name>                        # Switch to test environment
  monk test delete <name>                     # Delete test environment

Environment Variables:
  MONK_API_SOURCE_DIR    Override API source directory (default: auto-detect)
  MONK_RUN_HISTORY_DIR   Override run history location (default: auto-detect)

Each test run environment includes:
- Isolated database from pool (max 10 concurrent)
- Dedicated API server on unique port
- Git-specific build cache for faster updates
- Environment variables for CLI targeting

Test runs persist until explicitly deleted and can be switched between
for comparing different git references or testing multiple branches.
EOF
}

# Manage test run environments (main dispatcher)
manage_test_runs() {
    local branch_or_operation="$1"
    shift
    
    # Handle help requests
    if [ "$branch_or_operation" = "-h" ] || [ "$branch_or_operation" = "--help" ]; then
        show_test_run_usage
        return 0
    fi
    
    # Ensure run history directory exists
    mkdir -p "$RUN_HISTORY_DIR"
    
    # Check if this is a standard operation or a git reference
    case "$branch_or_operation" in
        list)
            list_test_runs
            ;;
        use)
            use_test_run "$1"
            ;;
        delete)
            delete_test_run "$1"
            ;;
        current)
            show_current_test_run
            ;;
        create)
            # New create operation - pass all arguments to create_or_update_test_run
            create_or_update_test_run "$@"
            ;;
        "")
            print_error "Branch name required"
            show_test_run_usage
            return 1
            ;;
        *)
            # Treat as git reference (branch name) for backward compatibility
            create_or_update_test_run "$branch_or_operation" "$@"
            ;;
    esac
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    manage_test_runs "$@"
fi