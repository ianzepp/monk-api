#!/bin/bash
set -e

# Test Development - Local development testing
# Runs tests against current working directory monk-api-hono project

# Load common functions
source "$(dirname "$0")/common.sh"

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

# Detect if directory is a monk-api-hono project
detect_monk_api_project() {
    local project_path="${1:-$PWD}"
    
    # Resolve to absolute path
    project_path=$(cd "$project_path" 2>/dev/null && pwd || echo "$project_path")
    
    # Check for monk-api-hono project indicators
    if [ -f "$project_path/package.json" ] && [ -f "$project_path/src/index.ts" ] && [ -d "$project_path/tests" ]; then
        # Verify it's monk-api-hono by checking package.json name
        if grep -q '"name": "monk-api-hono"' "$project_path/package.json" 2>/dev/null; then
            echo "$project_path"
            return 0
        fi
    fi
    
    return 1
}

# Generate dev run name
generate_dev_run_name() {
    local current_dir="$PWD"
    local dir_name=$(basename "$current_dir")
    
    # Get current git info if available
    local git_info=""
    if [ -d ".git" ]; then
        local branch=$(git branch --show-current 2>/dev/null || echo "")
        local commit=$(git rev-parse --short HEAD 2>/dev/null || echo "")
        if [ -n "$branch" ] && [ -n "$commit" ]; then
            git_info="${branch}-${commit}"
        elif [ -n "$commit" ]; then
            git_info="$commit"
        fi
    fi
    
    # Generate run name
    if [ -n "$git_info" ]; then
        echo "dev-${git_info}"
    else
        echo "dev-$(date +%s)"
    fi
}

# Get next available port for dev testing
get_next_dev_port() {
    local start_port=4000  # Use 4000+ for dev testing to avoid conflicts
    local max_attempts=50
    
    local test_port=$start_port
    for i in $(seq 1 $max_attempts); do
        if ! lsof -i ":$test_port" >/dev/null 2>&1; then
            echo "$test_port"
            return 0
        fi
        test_port=$((test_port + 1))
    done
    
    print_error "Could not find available port after $max_attempts attempts"
    return 1
}

# Start development test server
start_dev_server() {
    local run_name="$1"
    local port="$2" 
    local db_name="$3"
    local project_dir="$4"
    local config_dir="$project_dir/.config/monk"
    
    print_step "Starting development server"
    
    # Check if server is already running on this port
    if lsof -i ":$port" >/dev/null 2>&1; then
        print_info "Server already running on port $port"
        return 0
    fi
    
    # Start server in background from project root
    cd "$project_dir"
    PORT="$port" DATABASE_URL="postgresql://$(whoami)@localhost:5432/$db_name" npm run start > /dev/null 2>&1 &
    local server_pid=$!
    
    # Store server PID in config
    echo "$server_pid" > "$config_dir/server-pid"
    
    # Wait and check if it started
    sleep 2
    if ps -p "$server_pid" > /dev/null 2>&1; then
        print_success "Development server started on port $port (PID: $server_pid)"
        
        # Authenticate with test database
        print_step "Authenticating with test database: $db_name"
        if CLI_BASE_URL="http://localhost:$port" monk auth login --domain "$db_name"; then
            print_success "Authentication successful"
            return 0
        else
            print_error "Authentication failed"
            return 1
        fi
    else
        print_error "Failed to start development server"
        return 1
    fi
}

# Run development tests
run_dev_tests() {
    local project_path="$1"
    
    print_header "Development Testing"
    
    # Detect monk-api-hono project
    local project_dir
    if ! project_dir=$(detect_monk_api_project "$project_path"); then
        if [ -n "$project_path" ]; then
            print_error "Directory is not a monk-api-hono project: $project_path"
        else
            print_error "Current directory is not a monk-api-hono project"
        fi
        print_info "Required: package.json, src/index.ts, tests/ directory"
        print_info "Package name must be 'monk-api-hono'"
        return 1
    fi
    
    print_info "Project directory: $project_dir"
    print_info "Description: Development testing"
    
    # Generate dev run name
    local run_name=$(generate_dev_run_name)
    print_info "Dev run name: $run_name"
    
    # Create config directory
    local config_dir="$project_dir/.config/monk"
    mkdir -p "$config_dir"
    
    # Allocate database from pool
    print_step "Allocating development test database"
    local db_name
    if ! db_name=$(monk pool allocate "$run_name" 2>&1); then
        print_error "Failed to allocate database from pool"
        return 1
    fi
    
    # Extract database name from output
    db_name=$(echo "$db_name" | tail -n 1 | grep "^monk_test_" || echo "")
    if [ -z "$db_name" ]; then
        print_error "Failed to get database name from pool"
        return 1
    fi
    
    print_success "Database allocated: $db_name"
    
    # Get available port
    local port
    if ! port=$(get_next_dev_port); then
        print_error "Failed to find available port"
        monk pool deallocate "$db_name" > /dev/null 2>&1 || true
        return 1
    fi
    
    print_info "Using port: $port"
    
    # Make test scripts executable
    if [ -d "$project_dir/tests" ]; then
        print_step "Making test scripts executable"
        find "$project_dir/tests" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
    fi
    
    # Build the project
    print_step "Building development project"
    cd "$project_dir"
    if ! npm run build >/dev/null 2>&1; then
        print_error "npm run build failed"
        monk pool deallocate "$db_name" > /dev/null 2>&1 || true
        return 1
    fi
    
    # Create development environment config
    local git_branch=""
    local git_commit=""
    local git_commit_short=""
    
    if [ -d ".git" ]; then
        git_branch=$(git branch --show-current 2>/dev/null || echo "")
        git_commit=$(git rev-parse HEAD 2>/dev/null || echo "")
        git_commit_short=$(git rev-parse --short HEAD 2>/dev/null || echo "")
    fi
    
    # Create run info file
    cat > "$config_dir/run-info" << EOF
name=$run_name
created_at=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
updated_at=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
description=Development testing
database_name=$db_name
server_port=$port
git_branch=$git_branch
git_commit_full=$git_commit
git_commit_short=$git_commit_short
type=development
project_dir=$project_dir
EOF
    
    # Create environment file
    cat > "$config_dir/test-env" << EOF
# Development Test Environment: $run_name
# Project: $project_dir
# Updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

# API Server Configuration
CLI_BASE_URL=http://localhost:$port
SERVER_PORT=$port

# Database Configuration  
TEST_DATABASE=$db_name
MONK_TEST_DATABASE=$db_name

# Git Information
GIT_BRANCH=$git_branch
GIT_COMMIT=$git_commit
GIT_COMMIT_SHORT=$git_commit_short

# Development Run Info
TEST_RUN_NAME=$run_name
TEST_RUN_DESCRIPTION=Development testing
TEST_RUN_TYPE=development
PROJECT_DIR=$project_dir
EOF
    
    print_success "Development environment configured"
    
    # Start development server
    if ! start_dev_server "$run_name" "$port" "$db_name" "$project_dir"; then
        print_error "Failed to start development server"
        monk pool deallocate "$db_name" > /dev/null 2>&1 || true
        return 1
    fi
    
    # Set up cleanup trap
    setup_cleanup_trap() {
        trap 'cleanup_dev_environment "$run_name" "$db_name" "$project_dir"' EXIT INT TERM
    }
    setup_cleanup_trap
    
    # Run all tests using CLI auto-discovery
    print_step "Running complete test suite against development server"
    if "$(dirname "$0")/test-all.sh"; then
        print_success "All development tests passed!"
        cleanup_dev_environment "$run_name" "$db_name" "$project_dir"
        return 0
    else
        print_error "Some development tests failed"
        cleanup_dev_environment "$run_name" "$db_name" "$project_dir"
        return 1
    fi
}

# Cleanup development environment
cleanup_dev_environment() {
    local run_name="$1"
    local db_name="$2"
    local project_dir="$3"
    local config_dir="$project_dir/.config/monk"
    
    print_step "Cleaning up development environment"
    
    # Stop server if running
    if [ -f "$config_dir/server-pid" ]; then
        local server_pid=$(cat "$config_dir/server-pid")
        if [ -n "$server_pid" ] && ps -p "$server_pid" > /dev/null 2>&1; then
            print_step "Stopping development server (PID: $server_pid)"
            kill "$server_pid" 2>/dev/null || true
            print_success "Server stopped"
        fi
    fi
    
    # Deallocate database
    if [ -n "$db_name" ]; then
        print_step "Deallocating database: $db_name"
        if monk pool deallocate "$db_name" > /dev/null 2>&1; then
            print_success "Database deallocated: $db_name"
        else
            print_error "Failed to deallocate database: $db_name"
        fi
    fi
    
    # Clean up config directory
    if [ -d "$config_dir" ] && [ "$config_dir" != "$project_dir" ]; then
        rm -rf "$config_dir"
        print_success "Development environment cleaned up"
    fi
}

# Show development testing help
show_dev_help() {
    cat << EOF
Usage: monk test dev [--description "text"]

Development testing for local monk-api-hono projects.

Description:
  Run tests against the current working directory's monk-api-hono project.
  This allows testing local changes before committing to GitHub.

Options:
  --description <text>    Add description for this dev test run

Examples:
  cd /path/to/monk-api-hono
  monk test dev                                    # Test current directory
  monk test dev --description "Testing new feature"   # With description

Workflow:
  1. Detect monk-api-hono project in current directory
  2. Allocate isolated test database from pool
  3. Build project (npm run build)
  4. Start development server on available port (4000+)
  5. Authenticate with test database
  6. Run complete test suite using monk test all auto-discovery
  7. Clean up database and server on completion

Requirements:
  - Must be run from monk-api-hono project root
  - Project must have: package.json, src/index.ts, tests/ directory
  - PostgreSQL must be running for database allocation

Related Commands:
  monk test git <branch>      # Test GitHub commits/branches
  monk test all [pattern]     # Run specific test patterns
  monk pool status            # Check database pool availability

The development server uses ports 4000+ to avoid conflicts with
other monk servers (hono uses 3000+, test git uses 3001+).
EOF
}

# Main entry point
main() {
    local project_path=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_dev_help
                return 0
                ;;
            -*)
                print_error "Unknown option: $1"
                show_dev_help
                return 1
                ;;
            *)
                if [ -z "$project_path" ]; then
                    project_path="$1"
                    shift
                else
                    print_error "Too many arguments: $1"
                    show_dev_help
                    return 1
                fi
                ;;
        esac
    done
    
    # Run development tests
    run_dev_tests "$project_path"
}

main "$@"