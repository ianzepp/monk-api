#!/bin/bash
set -e

# Hono Logs Management - View and manage server logs

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Default configuration
LOG_DIR="${HOME}/.monk-logs"
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

# Get running Hono process PIDs
get_running_hono_pids() {
    # Look for processes containing "tsx" or "npm" running from the API directory
    ps aux | grep -E "(tsx.*monk-api-hono|npm.*dev.*monk-api-hono)" | grep -v grep | awk '{print $2}' || true
}

# Get current server port (utility function)
get_server_port() {
    if [ -f "$PORT_FILE" ]; then
        cat "$PORT_FILE"
    else
        echo "3000"
    fi
}

# Auto-detect single running process or show list
auto_detect_process() {
    # First check if there's a managed process that's still running
    if [ -f "$PID_FILE" ]; then
        local managed_pid=$(cat "$PID_FILE")
        if ps -p "$managed_pid" > /dev/null 2>&1; then
            # Managed process is running - use it
            echo "$managed_pid"
            return 0
        fi
    fi
    
    # Otherwise, check for running processes
    local running_pids
    running_pids=$(get_running_hono_pids)
    
    if [ -z "$running_pids" ]; then
        print_error "No running Hono processes found"
        print_info "Start a server with: monk hono start"
        return 1
    fi
    
    local pid_count
    pid_count=$(echo "$running_pids" | wc -l | tr -d ' ')
    
    if [ "$pid_count" -eq 1 ]; then
        # Single process found - use it automatically
        echo "$running_pids"
        return 0
    else
        # Multiple processes found - show list and exit
        print_error "Multiple Hono processes found. Please specify a PID:"
        echo
        print_info "Running Hono processes:"
        
        # Show detailed process list
        echo "PID    %CPU %MEM COMMAND"
        echo "----------------------------------------"
        local processes=$(ps aux | grep -E "(tsx.*monk-api-hono|npm.*dev.*monk-api-hono)" | grep -v grep)
        echo "$processes" | awk '{printf "%-6s %4s %4s %s\n", $2, $3, $4, substr($0, index($0,$11))}'
        
        # Also show managed process if exists
        if [ -f "$PID_FILE" ]; then
            local managed_pid=$(cat "$PID_FILE")
            local managed_port=$(get_server_port)
            echo ""
            print_info "Managed process: PID $managed_pid (Port: $managed_port)"
        fi
        
        echo ""
        print_info "Usage: monk hono logs <pid>"
        return 1
    fi
}

# Show usage information
show_usage() {
    cat << EOF
Usage: monk hono logs [<pid>] [options]

View logs for a Hono server process. If no PID is specified and only one
Hono process is running, it will be used automatically. If multiple processes
are running, a list will be displayed.

Arguments:
  <pid>                    Process ID of the Hono server to view logs for
                          (optional if only one process is running)

Options:
  -f, --follow             Follow the log output (like tail -f)
  -n, --lines <num>        Number of lines to show (default: 50)
  -c, --clear              Clear the log file for the given PID
  --list                   List all available log files
  --cleanup                Remove log files for dead processes

Examples:
  monk hono logs           # Auto-detect single running process
  monk hono logs 12345     # Show last 50 lines for PID 12345
  monk hono logs 12345 -f  # Follow logs for PID 12345
  monk hono logs 12345 -n 100  # Show last 100 lines
  monk hono logs --list    # Show all available log files
  monk hono logs --cleanup # Clean up old log files

EOF
}

# List all available log files
list_log_files() {
    if [ ! -d "$LOG_DIR" ]; then
        print_info "No log directory found at $LOG_DIR"
        return 0
    fi
    
    local log_files
    log_files=$(find "$LOG_DIR" -name "hono-*.log" 2>/dev/null || true)
    
    if [ -z "$log_files" ]; then
        print_info "No Hono log files found"
        return 0
    fi
    
    print_info "Available Hono log files:"
    echo
    printf "%-10s %-20s %-10s %s\n" "PID" "Created" "Size" "Status"
    echo "------------------------------------------------------------"
    
    echo "$log_files" | while read -r log_file; do
        if [ -f "$log_file" ]; then
            local basename_file=$(basename "$log_file")
            local pid=${basename_file#hono-}
            pid=${pid%.log}
            
            local created=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$log_file" 2>/dev/null || echo "unknown")
            local size=$(du -h "$log_file" 2>/dev/null | cut -f1 || echo "0")
            
            local status="stopped"
            if ps -p "$pid" > /dev/null 2>&1; then
                status="running"
            fi
            
            printf "%-10s %-20s %-10s %s\n" "$pid" "$created" "$size" "$status"
        fi
    done
}

# Clean up log files for dead processes
cleanup_logs() {
    if [ ! -d "$LOG_DIR" ]; then
        print_info "No log directory found at $LOG_DIR"
        return 0
    fi
    
    local log_files
    log_files=$(find "$LOG_DIR" -name "hono-*.log" 2>/dev/null || true)
    
    if [ -z "$log_files" ]; then
        print_info "No Hono log files found"
        return 0
    fi
    
    local cleaned=0
    echo "$log_files" | while read -r log_file; do
        if [ -f "$log_file" ]; then
            local basename_file=$(basename "$log_file")
            local pid=${basename_file#hono-}
            pid=${pid%.log}
            
            if ! ps -p "$pid" > /dev/null 2>&1; then
                rm -f "$log_file"
                print_info "Removed log file for dead process: $pid"
                cleaned=$((cleaned + 1))
            fi
        fi
    done
    
    if [ $cleaned -eq 0 ]; then
        print_info "No log files to clean up"
    else
        print_success "Cleaned up $cleaned log file(s)"
    fi
}

# View logs for specific PID
view_logs() {
    local pid="$1"
    local follow=false
    local lines=50
    local clear_log=false
    
    # Parse options
    shift
    while [ $# -gt 0 ]; do
        case "$1" in
            -f|--follow)
                follow=true
                ;;
            -n|--lines)
                shift
                lines="$1"
                ;;
            -c|--clear)
                clear_log=true
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
        shift
    done
    
    local log_file="${LOG_DIR}/hono-${pid}.log"
    
    if [ ! -f "$log_file" ]; then
        print_error "No log file found for PID $pid"
        print_info "Expected location: $log_file"
        return 1
    fi
    
    if [ "$clear_log" = true ]; then
        > "$log_file"
        print_success "Cleared log file for PID $pid"
        return 0
    fi
    
    # Check if process is still running
    local status="(stopped)"
    if ps -p "$pid" > /dev/null 2>&1; then
        status="(running)"
    fi
    
    print_info "Showing logs for Hono server PID $pid $status"
    echo "Log file: $log_file"
    echo "----------------------------------------"
    
    if [ "$follow" = true ]; then
        tail -f -n "$lines" "$log_file"
    else
        tail -n "$lines" "$log_file"
    fi
}

# Main command handling
main() {
    # Handle special operations first
    case "${1:-}" in
        -h|--help|help)
            show_usage
            exit 0
            ;;
        --list)
            list_log_files
            exit 0
            ;;
        --cleanup)
            cleanup_logs
            exit 0
            ;;
    esac
    
    # Separate PID from options
    local pid=""
    local options=()
    
    # Parse arguments to find PID (numeric) vs options (start with -)
    while [ $# -gt 0 ]; do
        case "$1" in
            -*)
                # This is an option, save it
                options+=("$1")
                # Check if option takes a value
                if [[ "$1" == "-n" || "$1" == "--lines" ]]; then
                    shift
                    if [ $# -gt 0 ]; then
                        options+=("$1")
                    fi
                fi
                ;;
            *)
                # Check if this looks like a PID (numeric)
                if echo "$1" | grep -E "^[0-9]+$" > /dev/null; then
                    pid="$1"
                else
                    print_error "Invalid PID: $1 (must be numeric)"
                    show_usage
                    exit 1
                fi
                ;;
        esac
        shift
    done
    
    # If no PID provided, try auto-detection
    if [ -z "$pid" ]; then
        local auto_pid
        if auto_pid=$(auto_detect_process); then
            print_info "Auto-detected single running Hono process: $auto_pid"
            view_logs "$auto_pid" "${options[@]}"
        else
            # auto_detect_process already printed the error/list
            exit 1
        fi
    else
        # Use specified PID
        view_logs "$pid" "${options[@]}"
    fi
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi