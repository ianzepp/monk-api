#!/bin/bash
# Common Test Environment Setup
# Source this script at the top of test files to auto-configure environment

# Auto-configure environment from global monk CLI
if command -v monk >/dev/null 2>&1; then
    # Export all test environment variables from global monk command
    eval "$(monk test env 2>/dev/null | grep '^[A-Z_]*=' || true)"
    
    # Get current test database setting
    test_db_file="${HOME}/.monk-test-database"
    if [ -f "$test_db_file" ]; then
        export MONK_TEST_DATABASE=$(cat "$test_db_file")
        export TEST_DATABASE="$MONK_TEST_DATABASE"
    fi
fi

# Set fallback defaults if monk CLI not found
CLI_BASE_URL="${CLI_BASE_URL:-http://localhost:3000}"
DATABASE_URL="${DATABASE_URL:-postgresql://$(whoami)@localhost:5432/}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-$(whoami)}"
DB_POOL_MAX="${DB_POOL_MAX:-10}"

# Export environment variables for child processes
export CLI_BASE_URL
export DATABASE_URL
export DB_HOST
export DB_PORT
export DB_USER
export DB_POOL_MAX
export JWT_TOKEN
export TEST_DATABASE
export MONK_TEST_DATABASE

# Provide a function to get fresh environment (in case things change during test)
refresh_test_env() {
    if command -v monk >/dev/null 2>&1; then
        eval "$(monk test env 2>/dev/null | grep '^[A-Z_]*=' || true)"
    fi
}