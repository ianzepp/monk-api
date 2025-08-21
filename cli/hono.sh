#!/bin/bash
set -e

# Hono Management CLI - Main dispatcher for server and process operations
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
#   logs <pid> [options]     View logs for specific server process

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Show usage information
show_usage() {
    cat << EOF
⚠️  DEPRECATED: monk hono commands have moved to npm scripts

Use these commands in your monk-api-hono project instead:
  npm run hono:start [port]    # Start server (replaces: monk hono start)
  npm run hono:stop            # Stop server (replaces: monk hono stop)  
  npm run hono:restart [port]  # Restart server (replaces: monk hono restart)
  npm run hono:status          # Server status (replaces: monk hono status)
  npm run hono:list            # List processes (replaces: monk hono list)
  npm run hono:killall         # Emergency cleanup (replaces: monk hono kill)

Legacy Usage: monk hono <operation> [options]

Hono server management for local development.

Operations:
  start [port]             Start the Hono server (default port: 3000)
  stop                     Stop the running Hono server
  restart [port]           Restart the Hono server
  status                   Check if server is running
  list                     List all Hono-related processes
  kill [pid]               Force kill all Hono processes (or specific PID)
  logs <pid> [options]     View logs for specific server process

Examples:
  monk hono start          # Start on default port 3000
  monk hono start 3001     # Start on port 3001
  monk hono stop           # Stop the server
  monk hono restart        # Restart on same port
  monk hono status         # Check server status
  monk hono list           # Show all running Hono processes
  monk hono kill           # Force kill all stuck processes
  monk hono kill 1234      # Force kill specific PID
  monk hono logs 1234      # View logs for PID 1234
  monk hono logs 1234 -f   # Follow logs for PID 1234

Process Management:
  list                     Shows all Hono-related processes with PID, CPU, memory usage
  kill                     Force kills all Hono processes using kill -9
  kill <pid>               Force kills specific PID after validating it's Hono-related

Server Management:
  start                    Starts server in background with PID tracking
  stop                     Gracefully stops the managed server
  restart                  Stops and starts the server (maintains same port)
  status                   Shows server status and returns localhost:PORT

The server will be started in the background and the process ID will be
stored for management. Use 'monk hono stop' to cleanly shut down the server.
Use 'monk hono kill' when normal stop doesn't work due to stuck processes.
EOF
}

# Main command handling
main() {
    # Show deprecation warning
    echo -e "\033[1;33m⚠️  DEPRECATED: monk hono commands have moved to npm scripts\033[0m"
    echo -e "\033[0;34mℹ Use 'npm run hono:${1:-help}' in your monk-api-hono project instead\033[0m"
    echo ""
    
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi
    
    local operation="$1"
    shift
    
    # Handle help
    case "$operation" in
        -h|--help|help)
            show_usage
            exit 0
            ;;
    esac
    
    # Dispatch to appropriate sub-command script
    case "$operation" in
        start|stop|restart|status)
            exec "$(dirname "$0")/hono-server.sh" "$operation" "$@"
            ;;
        list|kill)
            exec "$(dirname "$0")/hono-process.sh" "$operation" "$@"
            ;;
        logs)
            exec "$(dirname "$0")/hono-logs.sh" "$@"
            ;;
        *)
            print_error "Unknown operation: $operation"
            print_info "Available operations: start, stop, restart, status, list, kill, logs"
            print_info "Use 'monk hono --help' for more information"
            exit 1
            ;;
    esac
}

main "$@"