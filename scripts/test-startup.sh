#!/usr/bin/env bash
#
# Test Server Startup Script
#
# Builds the application, kills any existing servers on port 9002,
# and starts a new server on port 9002 in the background
#

set -euo pipefail

# Script directory and project root
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly YELLOW='\033[0;33m'
readonly NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Step 1: Build the application
print_step "Building application"
cd "$PROJECT_ROOT"
npm run build

# Step 2: Type-check test files
print_step "Type-checking test files"
npm run build:tests

# Step 3: Kill any existing servers on port 9002
print_step "Killing any existing servers on port 9002"
if lsof -ti:9002 >/dev/null 2>&1; then
    lsof -ti:9002 | xargs kill -9 2>/dev/null || true
    print_success "Killed existing server on port 9002"
else
    print_warn "No existing server found on port 9002"
fi

# Give the port a moment to be released
sleep 1

# Step 4: Start new server on port 9002 in background
print_step "Starting server on port 9002 in background"

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"

# Remove any existing test server logs
rm -f "$PROJECT_ROOT/logs/test-server.log"
rm -f "$PROJECT_ROOT/logs/test-server.pid"

# Log file with timestamp
readonly LOG_FILE="$PROJECT_ROOT/logs/test-server.log"

print_step "Server output logged to: $LOG_FILE"

# Add timestamp header to log file
echo "=== Test server started at $(date) ===" >> "$LOG_FILE"

# Start server on port 9002 with test environment
# Uses .env.test for database isolation (monk_test instead of monk)
NODE_ENV=test PORT=9002 node -r dotenv/config dist/index.js dotenv_config_path=.env.test >> "$LOG_FILE" 2>&1 &

# Get process ID for reference
readonly SERVER_PID=$!

print_success "Test server started on port 9002 (PID: $SERVER_PID)"
print_step "Monitor logs: tail -f $LOG_FILE"
print_step "Stop server: npm run test:cleanup"

# Save PID for potential cleanup
echo "$SERVER_PID" > "$PROJECT_ROOT/logs/test-server.pid"

print_success "Test server startup complete"
