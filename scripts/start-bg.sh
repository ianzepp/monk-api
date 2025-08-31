#!/usr/bin/env bash
#
# Background Server Starter for Monk API
#
# Starts the API server in background with comprehensive logging to file.
# Creates logs directory and captures all output for debugging.
#

set -euo pipefail

# Script directory and project root
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
readonly GREEN='\033[0;32m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"

# Remove any existing server logs and PID
rm -f "$PROJECT_ROOT/logs/server.log"
rm -f "$PROJECT_ROOT/logs/server.pid"

# Log file with timestamp
readonly LOG_FILE="$PROJECT_ROOT/logs/server.log"

print_step "Starting Monk API server in background"
print_step "Server output logged to: $LOG_FILE"

# Start server with comprehensive logging
cd "$PROJECT_ROOT"

# Add timestamp header to log file
echo "=== Server started at $(date) ===" >> "$LOG_FILE"

# Start server and capture all output
node dist/index.js >> "$LOG_FILE" 2>&1 &

# Get process ID for reference
readonly SERVER_PID=$!

print_success "Server started in background (PID: $SERVER_PID)"
print_step "Monitor logs: tail -f $LOG_FILE"
print_step "Stop server: npm run stop"

# Save PID for potential cleanup
echo "$SERVER_PID" > "$PROJECT_ROOT/logs/server.pid"

print_success "Background server startup complete"
