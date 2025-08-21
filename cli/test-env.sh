#!/bin/bash
set -e

# Test Environment Management - Environment variable display and configuration

# Load common functions
source "$(dirname "$0")/common.sh"

# Test configuration
GIT_TARGET_DIR="$(get_monk_git_target)"
ACTIVE_RUN_FILE="$GIT_TARGET_DIR/.active-run"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }

# Show test environment variables
show_test_env() {
    local var_name="$1"
    
    # Check if there's an active test run
    local active_run=""
    local run_dir=""
    if [ -f "$ACTIVE_RUN_FILE" ]; then
        active_run=$(cat "$ACTIVE_RUN_FILE")
        run_dir="$GIT_TARGET_DIR/$active_run"
    fi
    
    # Get current environment values (prioritize active test run)
    local cli_base_url="${CLI_BASE_URL:-http://localhost:3000}"
    local jwt_token=""
    local database_url="${DATABASE_URL:-postgresql://$(whoami)@localhost:5432/}"
    local test_database="${MONK_TEST_DATABASE:-}"
    local db_pool_max="${MONK_DB_POOL_MAX:-10}"
    local test_run_name="${TEST_RUN_NAME:-}"
    local test_run_description="${TEST_RUN_DESCRIPTION:-}"
    local git_branch="${GIT_BRANCH:-}"
    local git_commit="${GIT_COMMIT:-}"
    local git_commit_short="${GIT_COMMIT_SHORT:-}"
    local server_port="${SERVER_PORT:-}"
    
    # Git configuration for test environments
    local git_remote="${MONK_GIT_REMOTE:-$(get_monk_git_remote 2>/dev/null || echo "")}"
    local git_target="${MONK_GIT_TARGET:-$(get_monk_git_target 2>/dev/null || echo "/tmp/monk-builds")}"
    
    # Override with active test run configuration if available
    if [ -n "$active_run" ] && [ -f "$run_dir/.env.test-run" ]; then
        # Source the test run environment (portable parsing)
        while IFS='=' read -r key value; do
            # Skip comments and empty lines
            case "$key" in
                \#*|'') continue ;;
                CLI_BASE_URL) cli_base_url="$value" ;;
                SERVER_PORT) server_port="$value" ;;
                TEST_DATABASE|MONK_TEST_DATABASE) test_database="$value" ;;
                TEST_RUN_NAME) test_run_name="$value" ;;
                TEST_RUN_DESCRIPTION) test_run_description="$value" ;;
                GIT_BRANCH) git_branch="$value" ;;
                GIT_COMMIT) git_commit="$value" ;;
                GIT_COMMIT_SHORT) git_commit_short="$value" ;;
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
    if [ -n "$server_port" ] && lsof -i ":$server_port" >/dev/null 2>&1; then
        server_status="running"
    elif [ -f "${HOME}/.monk-hono.pid" ] && [ -f "${HOME}/.monk-hono.port" ]; then
        local pid=$(cat "${HOME}/.monk-hono.pid")
        if ps -p "$pid" > /dev/null 2>&1; then
            server_status="running"
            if [ -z "$server_port" ]; then
                server_port=$(cat "${HOME}/.monk-hono.port")
                cli_base_url="http://localhost:$server_port"
            fi
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
            CLI_BASE_URL) echo "$cli_base_url" ;;
            JWT_TOKEN) echo "$jwt_token" ;;
            DATABASE_URL) echo "$database_url" ;;
            TEST_DATABASE) echo "$test_database" ;;
            DB_HOST) echo "$db_host" ;;
            DB_PORT) echo "$db_port" ;;
            DB_USER) echo "$db_user" ;;
            SERVER_STATUS) echo "$server_status" ;;
            SERVER_PORT) echo "$server_port" ;;
            DB_POOL_MAX) echo "$db_pool_max" ;;
            TEST_RUN_NAME) echo "$test_run_name" ;;
            TEST_RUN_DESCRIPTION) echo "$test_run_description" ;;
            TEST_RUN_ACTIVE) echo "$active_run" ;;
            GIT_BRANCH) echo "$git_branch" ;;
            GIT_COMMIT) echo "$git_commit" ;;
            GIT_COMMIT_SHORT) echo "$git_commit_short" ;;
            MONK_GIT_REMOTE) echo "$git_remote" ;;
            MONK_GIT_TARGET) echo "$git_target" ;;
            *)
                print_error "Unknown environment variable: $var_name"
                print_info "Available variables: CLI_BASE_URL, JWT_TOKEN, DATABASE_URL, TEST_DATABASE, DB_HOST, DB_PORT, DB_USER, SERVER_STATUS, SERVER_PORT, DB_POOL_MAX, TEST_RUN_NAME, TEST_RUN_DESCRIPTION, TEST_RUN_ACTIVE, GIT_BRANCH, GIT_COMMIT, GIT_COMMIT_SHORT, MONK_GIT_REMOTE, MONK_GIT_TARGET"
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
        echo "# Git Configuration"
        echo "MONK_GIT_REMOTE=$git_remote"
        echo "MONK_GIT_TARGET=$git_target"
        echo
        echo "# Test Run Information"
        if [ -n "$active_run" ]; then
            echo "TEST_RUN_ACTIVE=$active_run"
            echo "TEST_RUN_NAME=$test_run_name"
            echo "TEST_RUN_DESCRIPTION=$test_run_description"
            echo "GIT_BRANCH=$git_branch"
            echo "GIT_COMMIT=$git_commit"
            echo "GIT_COMMIT_SHORT=$git_commit_short"
        else
            echo "TEST_RUN_ACTIVE="
            echo "TEST_RUN_NAME="
            echo "TEST_RUN_DESCRIPTION="
            echo "GIT_BRANCH="
            echo "GIT_COMMIT="
            echo "GIT_COMMIT_SHORT="
        fi
        echo
        print_info "Usage: monk test env [VAR_NAME] to get specific variable value"
        print_info "Usage: eval \"\$(monk test env)\" to export all variables"
        if [ -n "$active_run" ]; then
            print_info "Active test run: $active_run"
        fi
    fi
}

# Set test database for current session
set_test_database() {
    local db_name="$1"
    
    if [ -z "$db_name" ]; then
        print_error "Database name required"
        print_info "Usage: monk test use <database_name>"
        return 1
    fi
    
    # Create/ensure database exists with schema
    local db_user="${DB_USER:-$(whoami)}"
    
    # Check if database exists
    if ! psql -U "$db_user" -lqt | cut -d'|' -f1 | grep -qw "$db_name" 2>/dev/null; then
        print_step "Creating test database: $db_name"
        if createdb "$db_name" -U "$db_user" 2>/dev/null; then
            # Initialize schema
            local schema_file="$(dirname "$0")/../sql/init-schema.sql"
            if [ -f "$schema_file" ]; then
                if psql -U "$db_user" -d "$db_name" -f "$schema_file" >/dev/null 2>&1; then
                    print_success "Database created and initialized: $db_name"
                else
                    print_error "Failed to initialize database schema"
                    dropdb "$db_name" -U "$db_user" 2>/dev/null || true
                    return 1
                fi
            else
                print_error "Schema file not found: $schema_file"
                return 1
            fi
        else
            print_error "Failed to create database: $db_name"
            return 1
        fi
    else
        print_success "Using existing database: $db_name"
    fi
    
    # Store as current test database
    local test_db_file="${HOME}/.monk-test-database"
    echo "$db_name" > "$test_db_file"
    
    print_info "Set test database: $db_name"
    print_info "All tests will now use this database until changed"
}

# Get current test database
get_current_test_database() {
    local test_db_file="${HOME}/.monk-test-database"
    if [ -f "$test_db_file" ]; then
        cat "$test_db_file"
    else
        # Default shared database
        echo "monk_api_test_shared_$(whoami)"
    fi
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    case "${1:-}" in
        use)
            set_test_database "$2"
            ;;
        current)
            current_db=$(get_current_test_database)
            echo "Current test database: $current_db"
            ;;
        *)
            show_test_env "$@"
            ;;
    esac
fi