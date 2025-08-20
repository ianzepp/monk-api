#!/bin/bash
set -e

# Hono Server Lifecycle Management - Start, stop, restart, status operations

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Default configuration
DEFAULT_PORT=3000
PID_FILE="${HOME}/.monk-hono.pid"
PORT_FILE="${HOME}/.monk-hono.port"
LOG_DIR="${HOME}/.monk-logs"
API_DIR="/Users/ianzepp/Workspaces/monk/monk-api-hono"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_error() { echo -e "${RED}$1${NC}"; }

# Check if server is running
is_server_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            # Clean up stale PID file
            rm -f "$PID_FILE" "$PORT_FILE"
            return 1
        fi
    fi
    return 1
}

# Get current server port
get_server_port() {
    if [ -f "$PORT_FILE" ]; then
        cat "$PORT_FILE"
    else
        echo "$DEFAULT_PORT"
    fi
}

# Start the server
start_server() {
    local port=${1:-$DEFAULT_PORT}
    
    if is_server_running; then
        local current_port=$(get_server_port)
        print_error "Server is already running on localhost:$current_port"
        return 1
    fi
    
    if [ ! -d "$API_DIR" ]; then
        print_error "Hono API directory not found: $API_DIR"
        return 1
    fi
    
    print_info "Starting Hono server on port $port..."
    
    # Create logs directory if it doesn't exist
    mkdir -p "$LOG_DIR"
    
    # Start server in background - we need to get PID first, then redirect
    cd "$API_DIR"
    
    # Create a temporary log file, start process, then rename to PID-specific
    local temp_log="${LOG_DIR}/hono-temp-$$.log"
    PORT=$port npm run dev >> "$temp_log" 2>&1 &
    local pid=$!
    
    # Move temp log to PID-specific log file
    local log_file="${LOG_DIR}/hono-${pid}.log"
    mv "$temp_log" "$log_file"
    
    # Store PID and port
    echo "$pid" > "$PID_FILE"
    echo "$port" > "$PORT_FILE"
    
    # Wait a moment and check if it started successfully
    sleep 2
    if ! ps -p "$pid" > /dev/null 2>&1; then
        print_error "Failed to start server"
        rm -f "$PID_FILE" "$PORT_FILE"
        return 1
    fi
    
    echo "localhost:$port"
}

# Stop the server
stop_server() {
    if ! is_server_running; then
        print_error "Server is not running"
        return 1
    fi
    
    local pid=$(cat "$PID_FILE")
    local port=$(get_server_port)
    
    print_info "Stopping Hono server (PID: $pid, Port: $port)..."
    
    # Kill the process and its children
    pkill -P "$pid" > /dev/null 2>&1 || true
    kill "$pid" > /dev/null 2>&1 || true
    
    # Clean up files (keep log file for debugging)
    rm -f "$PID_FILE" "$PORT_FILE"
    
    print_info "Server stopped"
}

# Check server status
check_status() {
    if is_server_running; then
        local pid=$(cat "$PID_FILE")
        local port=$(get_server_port)
        print_info "Server is running (PID: $pid, Port: $port)"
        echo "localhost:$port"
    else
        print_info "Server is not running"
        return 1
    fi
}

# Restart the server
restart_server() {
    local port=${1:-$(get_server_port)}
    
    if is_server_running; then
        stop_server
        sleep 1
    fi
    
    start_server "$port"
}

# Handle server operations
handle_server_operation() {
    local operation="$1"
    local port="$2"
    
    case "$operation" in
        start)
            start_server "$port"
            ;;
        stop)
            stop_server
            ;;
        restart)
            restart_server "$port"
            ;;
        status)
            check_status
            ;;
        *)
            print_error "Unknown server operation: $operation"
            print_info "Available operations: start, stop, restart, status"
            exit 1
            ;;
    esac
}

# Main entry point for standalone use
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    handle_server_operation "$@"
fi