#!/bin/bash
set -e

# Hono Server Management CLI
#
# Usage: monk hono <operation> [options]
#
# Operations:
#   start [port]             Start the Hono server (default port: 3000)
#   stop                     Stop the running Hono server
#   restart [port]           Restart the Hono server
#   status                   Check if server is running
#   list                     List all Hono-related processes
#   kill [pid]               Force kill all Hono processes (or specific PID)
#
# Examples:
#   monk hono start          # Start on default port 3000
#   monk hono start 3001     # Start on port 3001
#   monk hono stop           # Stop the server
#   monk hono restart        # Restart on same port
#   monk hono status         # Check server status
#   monk hono list           # Show all running Hono processes
#   monk hono kill           # Force kill all stuck processes
#   monk hono kill 1234      # Force kill specific PID

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Default configuration
DEFAULT_PORT=3000
PID_FILE="${HOME}/.monk-hono.pid"
PORT_FILE="${HOME}/.monk-hono.port"
API_DIR="/Users/ianzepp/Workspaces/monk/monk-api-hono"

# Show usage information
show_usage() {
    cat << EOF
Usage: monk hono <operation> [options]

Hono server management for local development.

Operations:
  start [port]             Start the Hono server (default port: $DEFAULT_PORT)
  stop                     Stop the running Hono server
  restart [port]           Restart the Hono server
  status                   Check if server is running
  list                     List all Hono-related processes
  kill [pid]               Force kill all Hono processes (or specific PID)

Examples:
  monk hono start          # Start on default port $DEFAULT_PORT
  monk hono start 3001     # Start on port 3001
  monk hono stop           # Stop the server
  monk hono restart        # Restart on same port
  monk hono status         # Check server status
  monk hono list           # Show all running Hono processes
  monk hono kill           # Force kill all stuck processes
  monk hono kill 1234      # Force kill specific PID

The server will be started in the background and the process ID will be
stored for management. Use 'monk hono stop' to cleanly shut down the server.
EOF
}

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
    
    # Start server in background
    cd "$API_DIR"
    PORT=$port npm run dev > /dev/null 2>&1 &
    local pid=$!
    
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
    
    # Clean up files
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

# List all Hono-related processes
list_processes() {
    print_info "Listing all Hono-related processes..."
    
    # Look for processes containing "hono", "tsx", or running from the API directory
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

# Main script logic
if [ $# -eq 0 ]; then
    show_usage
    exit 1
fi

case "$1" in
    start)
        start_server "$2"
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server "$2"
        ;;
    status)
        check_status
        ;;
    list)
        list_processes
        ;;
    kill)
        kill_processes "$2"
        ;;
    -h|--help|help)
        show_usage
        ;;
    *)
        print_error "Invalid operation: $1"
        show_usage
        exit 1
        ;;
esac