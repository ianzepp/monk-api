#!/bin/bash
set -e

# Hono Process Management - List and kill operations for process control

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Configuration
PID_FILE="${HOME}/.monk-hono.pid"
PORT_FILE="${HOME}/.monk-hono.port"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_error() { echo -e "${RED}$1${NC}"; }

# Get current server port (utility function)
get_server_port() {
    if [ -f "$PORT_FILE" ]; then
        cat "$PORT_FILE"
    else
        echo "3000"
    fi
}

# List all Hono-related processes
list_processes() {
    print_info "Listing all Hono-related processes..."
    
    # Look for processes containing "tsx" or "npm" running from the API directory
    local processes=$(ps aux | grep -E "(tsx.*monk-api-hono|npm.*dev.*monk-api-hono)" | grep -v grep)
    
    if [ -z "$processes" ]; then
        print_info "No Hono-related processes found"
        return 0
    fi
    
    echo "PID    USER     %CPU %MEM COMMAND"
    echo "----------------------------------------"
    echo "$processes" | awk '{printf "%-6s %-8s %4s %4s %s\n", $2, $1, $3, $4, substr($0, index($0,$11))}'
    
    # Also show managed process if exists
    if [ -f "$PID_FILE" ]; then
        local managed_pid=$(cat "$PID_FILE")
        local managed_port=$(get_server_port)
        echo ""
        print_info "Managed process: PID $managed_pid (Port: $managed_port)"
    fi
}

# Force kill Hono processes (all or specific PID)
kill_processes() {
    local target_pid="$1"
    
    if [ -n "$target_pid" ]; then
        # Kill specific PID
        print_info "Force killing process $target_pid..."
        
        # Validate PID is numeric (portable)
        if ! echo "$target_pid" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
            print_error "Invalid PID: $target_pid (must be numeric)"
            return 1
        fi
        
        # Check if process exists
        if ! ps -p "$target_pid" > /dev/null 2>&1; then
            print_error "Process $target_pid not found"
            return 1
        fi
        
        # Check if process is Hono-related
        local process_info=$(ps -p "$target_pid" -o command= 2>/dev/null)
        if ! echo "$process_info" | grep -E "(tsx.*monk-api-hono|npm.*dev.*monk-api-hono)" > /dev/null 2>&1; then
            # Also check if it's our managed process
            local is_managed=false
            if [ -f "$PID_FILE" ]; then
                local managed_pid=$(cat "$PID_FILE")
                if [ "$managed_pid" = "$target_pid" ]; then
                    is_managed=true
                fi
            fi
            
            if [ "$is_managed" = false ]; then
                print_error "Process $target_pid is not a Hono-related process"
                print_info "Command: $process_info"
                print_info "Use 'monk hono list' to see Hono-related processes"
                return 1
            fi
        fi
        
        # Kill process and its children
        pkill -P "$target_pid" > /dev/null 2>&1 || true
        kill -9 "$target_pid" > /dev/null 2>&1 || true
        print_info "Killed process $target_pid"
        
        # Clean up managed process files if this was the managed process
        if [ -f "$PID_FILE" ]; then
            local managed_pid=$(cat "$PID_FILE")
            if [ "$managed_pid" = "$target_pid" ]; then
                rm -f "$PID_FILE" "$PORT_FILE"
                print_info "Cleaned up process tracking files"
            fi
        fi
    else
        # Kill all Hono-related processes
        print_info "Force killing all Hono-related processes..."
        
        # Find all Hono-related processes
        local pids=$(ps aux | grep -E "(tsx.*monk-api-hono|npm.*dev.*monk-api-hono)" | grep -v grep | awk '{print $2}')
        
        if [ -z "$pids" ]; then
            print_info "No Hono-related processes found to kill"
        else
            echo "Killing processes: $pids"
            for pid in $pids; do
                # Kill process and its children
                pkill -P "$pid" > /dev/null 2>&1 || true
                kill -9 "$pid" > /dev/null 2>&1 || true
                print_info "Killed process $pid"
            done
        fi
        
        # Clean up managed process files
        if [ -f "$PID_FILE" ] || [ -f "$PORT_FILE" ]; then
            rm -f "$PID_FILE" "$PORT_FILE"
            print_info "Cleaned up process tracking files"
        fi
        
        print_info "All Hono processes killed"
    fi
}

# Handle process operations
handle_process_operation() {
    local operation="$1"
    local pid="$2"
    
    case "$operation" in
        list)
            list_processes
            ;;
        kill)
            kill_processes "$pid"
            ;;
        *)
            print_error "Unknown process operation: $operation"
            print_info "Available operations: list, kill"
            exit 1
            ;;
    esac
}

# Main entry point for standalone use
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    handle_process_operation "$@"
fi