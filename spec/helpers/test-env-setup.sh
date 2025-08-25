#!/bin/bash
# Common Test Environment Setup
# Source this script at the top of test files to auto-configure environment

# Load shared configuration helpers
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/config-helper.sh"

# Setup local monk command to avoid requiring npm link
# Find project root from test file location
TEST_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_SCRIPT_DIR/.." && pwd)"
MONK_CLI="$PROJECT_ROOT/bin/monk"

# Create monk function for test files
if [ -f "$MONK_CLI" ] && [ -x "$MONK_CLI" ]; then
    monk() {
        "$MONK_CLI" "$@"
    }
    export -f monk
fi

# Auto-configure environment from monk configuration (now using local function)
if declare -f monk >/dev/null 2>&1; then
    # Export environment variables from monk test env (for compatibility)
    eval "$(monk test env 2>/dev/null | grep '^[A-Z_]*=' || true)"
    
    # Get current test database setting
    test_db_file="${HOME}/.monk-test-database"
    if [ -f "$test_db_file" ]; then
        export MONK_TEST_DATABASE=$(cat "$test_db_file")
        export TEST_DATABASE="$MONK_TEST_DATABASE"
    fi
fi

# Get configuration from persistent monk settings
SERVER_URL=$(get_current_server_url)
JWT_TOKEN=$(get_current_jwt_token)
CURRENT_SERVER=$(get_current_server_name)

# Set fallback defaults
DATABASE_URL="${DATABASE_URL:-postgresql://$(whoami)@localhost:5432/}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-$(whoami)}"
DB_POOL_MAX="${DB_POOL_MAX:-10}"

# Export environment variables for child processes
export SERVER_URL
export JWT_TOKEN
export CURRENT_SERVER
export DATABASE_URL
export DB_HOST
export DB_PORT
export DB_USER
export DB_POOL_MAX
export TEST_DATABASE
export MONK_TEST_DATABASE

# Legacy compatibility (deprecated - use SERVER_URL instead)
export CLI_BASE_URL="$SERVER_URL"

# Provide a function to get fresh environment (in case things change during test)
refresh_test_env() {
    if command -v monk >/dev/null 2>&1; then
        # Refresh from persistent monk configuration
        SERVER_URL=$(get_current_server_url)
        JWT_TOKEN=$(get_current_jwt_token)
        CURRENT_SERVER=$(get_current_server_name)
        
        export SERVER_URL JWT_TOKEN CURRENT_SERVER
        export CLI_BASE_URL="$SERVER_URL"  # Legacy compatibility
        
        # Also refresh other environment variables
        eval "$(monk test env 2>/dev/null | grep '^[A-Z_]*=' || true)"
    fi
}