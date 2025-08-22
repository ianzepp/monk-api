#!/bin/bash
# Common Test Environment Setup
# Source this script at the top of test files to auto-configure environment

# Functions to get current monk configuration
get_current_server_url() {
    if command -v monk >/dev/null 2>&1; then
        # Use monk CLI to get current server URL
        monk test env SERVER_URL 2>/dev/null || echo "http://localhost:3000"
    else
        echo "http://localhost:3000"
    fi
}

get_current_jwt_token() {
    if command -v monk >/dev/null 2>&1; then
        # Use monk CLI to get current JWT token
        monk auth token 2>/dev/null || echo ""
    fi
}

get_current_server_name() {
    if command -v monk >/dev/null 2>&1; then
        # Use monk CLI to get current server name
        monk test env CURRENT_SERVER 2>/dev/null || echo "local"
    else
        echo "local"
    fi
}

# Auto-configure environment from persistent monk configuration
if command -v monk >/dev/null 2>&1; then
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