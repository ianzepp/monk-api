#!/bin/bash
set -e

# Server Management CLI - Remote server registry and management
#
# Usage: monk servers <command> [options]
#
# Commands:
#   add <name> <hostname:port>    Add server to registry
#   list                         List all servers with status
#   current                      Show currently selected server
#   use <name>                   Switch to server (updates CLI_BASE_URL)
#   delete <name>                Remove server configuration
#   ping <name>                  Health check specific server
#   ping-all                     Health check all servers

# Load common functions
source "$(dirname "$0")/common.sh"

# Configuration
SERVERS_CONFIG="${HOME}/.config/monk/servers.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }

# Check dependencies
check_dependencies

# Initialize servers config if it doesn't exist
init_servers_config() {
    # Ensure config directory exists
    mkdir -p "$(dirname "$SERVERS_CONFIG")"
    
    if [ ! -f "$SERVERS_CONFIG" ]; then
        cat > "$SERVERS_CONFIG" << 'EOF'
{
  "servers": {},
  "current": null
}
EOF
    fi
}

# Parse hostname:port into components
parse_endpoint() {
    local endpoint="$1"
    local hostname=""
    local port=""
    local protocol=""
    
    # Handle protocol prefixes
    if echo "$endpoint" | grep -q "^https://"; then
        protocol="https"
        endpoint=$(echo "$endpoint" | sed 's|^https://||')
    elif echo "$endpoint" | grep -q "^http://"; then
        protocol="http"
        endpoint=$(echo "$endpoint" | sed 's|^http://||')
    fi
    
    # Parse hostname:port
    if echo "$endpoint" | grep -q ":"; then
        hostname=$(echo "$endpoint" | cut -d':' -f1)
        port=$(echo "$endpoint" | cut -d':' -f2)
    else
        hostname="$endpoint"
        port="80"
    fi
    
    # Auto-detect protocol if not specified
    if [ -z "$protocol" ]; then
        if [ "$port" = "443" ]; then
            protocol="https"
        else
            protocol="http"
        fi
    fi
    
    echo "$protocol|$hostname|$port"
}

# Add server to registry
add_server() {
    local name="$1"
    local endpoint="$2"
    local description="${3:-}"
    
    if [ -z "$name" ] || [ -z "$endpoint" ]; then
        print_error "Server name and endpoint required"
        print_info "Usage: monk servers add <name> <hostname:port> [--description \"text\"]"
        return 1
    fi
    
    # Parse description from arguments
    shift 2
    while [[ $# -gt 0 ]]; do
        case $1 in
            --description)
                description="$2"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                return 1
                ;;
        esac
    done
    
    init_servers_config
    
    # Parse endpoint
    local parsed
    parsed=$(parse_endpoint "$endpoint")
    local protocol=$(echo "$parsed" | cut -d'|' -f1)
    local hostname=$(echo "$parsed" | cut -d'|' -f2)
    local port=$(echo "$parsed" | cut -d'|' -f3)
    
    print_step "Adding server: $name"
    print_info "Endpoint: $protocol://$hostname:$port"
    if [ -n "$description" ]; then
        print_info "Description: $description"
    fi
    
    # Check if server already exists
    if command -v jq >/dev/null 2>&1; then
        if jq -e ".servers.\"$name\"" "$SERVERS_CONFIG" >/dev/null 2>&1; then
            print_error "Server '$name' already exists"
            print_info "Use 'monk servers delete $name' first, or choose a different name"
            return 1
        fi
    fi
    
    # Test connectivity
    print_step "Testing connectivity to $protocol://$hostname:$port"
    local base_url="$protocol://$hostname:$port"
    
    if ping_server_url "$base_url"; then
        print_success "Server is reachable"
        local status="up"
    else
        print_info "Server appears to be down (this is OK, adding anyway)"
        local status="down"
    fi
    
    # Add server to config
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    if command -v jq >/dev/null 2>&1; then
        # Use jq for JSON manipulation
        local temp_file=$(mktemp)
        jq --arg name "$name" \
           --arg hostname "$hostname" \
           --arg port "$port" \
           --arg protocol "$protocol" \
           --arg description "$description" \
           --arg timestamp "$timestamp" \
           --arg status "$status" \
           '.servers[$name] = {
               "hostname": $hostname,
               "port": ($port | tonumber),
               "protocol": $protocol,
               "description": $description,
               "added_at": $timestamp,
               "last_ping": $timestamp,
               "status": $status
           }' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
        
        print_success "Server '$name' added successfully"
        
        # If this is the first server, make it current
        local server_count
        server_count=$(jq '.servers | length' "$SERVERS_CONFIG")
        if [ "$server_count" -eq 1 ]; then
            jq --arg name "$name" '.current = $name' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
            print_info "Set as current server (first server added)"
        fi
    else
        print_error "jq is required for server management"
        print_info "Please install jq: brew install jq (macOS) or apt-get install jq (Linux)"
        return 1
    fi
}

# Health check a server URL
ping_server_url() {
    local base_url="$1"
    local timeout="${2:-5}"
    
    # Try to ping the /ping endpoint with a short timeout
    if curl -s --max-time "$timeout" --fail "$base_url/ping" >/dev/null 2>&1; then
        return 0
    elif curl -s --max-time "$timeout" --fail "$base_url/" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Ping a specific server
ping_server() {
    local name="$1"
    
    if [ -z "$name" ]; then
        print_error "Server name required"
        print_info "Usage: monk servers ping <name>"
        return 1
    fi
    
    init_servers_config
    
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required for server management"
        return 1
    fi
    
    # Get server info
    local server_info
    if ! server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG" 2>/dev/null) || [ "$server_info" = "null" ]; then
        print_error "Server '$name' not found"
        print_info "Use 'monk servers list' to see available servers"
        return 1
    fi
    
    local hostname=$(echo "$server_info" | jq -r '.hostname')
    local port=$(echo "$server_info" | jq -r '.port')
    local protocol=$(echo "$server_info" | jq -r '.protocol')
    local base_url="$protocol://$hostname:$port"
    
    print_step "Pinging server: $name ($base_url)"
    
    if ping_server_url "$base_url" 10; then
        print_success "Server is up and responding"
        
        # Update status in config
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local temp_file=$(mktemp)
        jq --arg name "$name" \
           --arg timestamp "$timestamp" \
           '.servers[$name].last_ping = $timestamp | .servers[$name].status = "up"' \
           "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
    else
        print_error "Server is down or not responding"
        
        # Update status in config
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local temp_file=$(mktemp)
        jq --arg name "$name" \
           --arg timestamp "$timestamp" \
           '.servers[$name].last_ping = $timestamp | .servers[$name].status = "down"' \
           "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
        return 1
    fi
}

# Ping all servers
ping_all_servers() {
    init_servers_config
    
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required for server management"
        return 1
    fi
    
    print_header "Pinging All Servers"
    
    local server_names
    server_names=$(jq -r '.servers | keys[]' "$SERVERS_CONFIG" 2>/dev/null)
    
    if [ -z "$server_names" ]; then
        print_info "No servers configured"
        print_info "Use 'monk servers add <name> <hostname:port>' to add servers"
        return 0
    fi
    
    local up_count=0
    local total_count=0
    
    echo "$server_names" | while read -r name; do
        if [ -n "$name" ]; then
            total_count=$((total_count + 1))
            if ping_server "$name" >/dev/null 2>&1; then
                up_count=$((up_count + 1))
            fi
        fi
    done
    
    echo
    if [ "$up_count" -eq "$total_count" ]; then
        print_success "All servers are up ($up_count/$total_count)"
    elif [ "$up_count" -eq 0 ]; then
        print_error "All servers are down (0/$total_count)"
    else
        print_info "$up_count/$total_count servers are up"
    fi
}

# List all servers
list_servers() {
    init_servers_config
    
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required for server management"
        return 1
    fi
    
    print_header "Registered Servers"
    
    local current_server
    current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)
    
    local server_names
    server_names=$(jq -r '.servers | keys[]' "$SERVERS_CONFIG" 2>/dev/null)
    
    if [ -z "$server_names" ]; then
        print_info "No servers configured"
        print_info "Use 'monk servers add <name> <hostname:port>' to add servers"
        return 0
    fi
    
    printf "%-15s %-30s %-8s %-12s %-20s %s\n" "Name" "Endpoint" "Status" "Last Ping" "Added" "Description"
    echo "--------------------------------------------------------------------------------------------------------"
    
    echo "$server_names" | while read -r name; do
        if [ -n "$name" ]; then
            local server_info
            server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG")
            
            local hostname=$(echo "$server_info" | jq -r '.hostname')
            local port=$(echo "$server_info" | jq -r '.port')
            local protocol=$(echo "$server_info" | jq -r '.protocol')
            local status=$(echo "$server_info" | jq -r '.status // "unknown"')
            local last_ping=$(echo "$server_info" | jq -r '.last_ping // "never"')
            local added_at=$(echo "$server_info" | jq -r '.added_at // "unknown"')
            local description=$(echo "$server_info" | jq -r '.description // ""')
            
            local endpoint="$protocol://$hostname:$port"
            
            # Format timestamps
            if [ "$last_ping" != "never" ] && [ "$last_ping" != "unknown" ]; then
                last_ping=$(echo "$last_ping" | cut -d'T' -f1)
            fi
            if [ "$added_at" != "unknown" ]; then
                added_at=$(echo "$added_at" | cut -d'T' -f1)
            fi
            
            # Mark current server
            local marker=""
            if [ "$name" = "$current_server" ]; then
                marker="*"
            fi
            
            printf "%-15s %-30s %-8s %-12s %-20s %s %s\n" \
                "$name" "$endpoint" "$status" "$last_ping" "$added_at" "$description" "$marker"
        fi
    done
    
    echo
    if [ -n "$current_server" ]; then
        print_info "Current server: $current_server (marked with *)"
    else
        print_info "No current server selected"
        print_info "Use 'monk servers use <name>' to select a server"
    fi
}

# Show current server
show_current_server() {
    init_servers_config
    
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required for server management"
        return 1
    fi
    
    local current_server
    current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)
    
    if [ -z "$current_server" ] || [ "$current_server" = "null" ]; then
        print_info "No current server selected"
        print_info "Use 'monk servers use <name>' to select a server"
        return 0
    fi
    
    local server_info
    if ! server_info=$(jq -r ".servers.\"$current_server\"" "$SERVERS_CONFIG" 2>/dev/null) || [ "$server_info" = "null" ]; then
        print_error "Current server '$current_server' not found in registry"
        print_info "The server may have been deleted. Use 'monk servers list' to see available servers"
        return 1
    fi
    
    print_header "Current Server"
    
    local hostname=$(echo "$server_info" | jq -r '.hostname')
    local port=$(echo "$server_info" | jq -r '.port')
    local protocol=$(echo "$server_info" | jq -r '.protocol')
    local status=$(echo "$server_info" | jq -r '.status // "unknown"')
    local description=$(echo "$server_info" | jq -r '.description // ""')
    
    echo "Name: $current_server"
    echo "Endpoint: $protocol://$hostname:$port"
    echo "Status: $status"
    if [ -n "$description" ]; then
        echo "Description: $description"
    fi
    
    # Show environment variable
    local base_url="$protocol://$hostname:$port"
    echo "CLI_BASE_URL: $base_url"
}

# Switch to a server
use_server() {
    local name="$1"
    
    if [ -z "$name" ]; then
        print_error "Server name required"
        print_info "Usage: monk servers use <name>"
        return 1
    fi
    
    init_servers_config
    
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required for server management"
        return 1
    fi
    
    # Check if server exists
    local server_info
    if ! server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG" 2>/dev/null) || [ "$server_info" = "null" ]; then
        print_error "Server '$name' not found"
        print_info "Use 'monk servers list' to see available servers"
        return 1
    fi
    
    # Set as current server
    local temp_file=$(mktemp)
    jq --arg name "$name" '.current = $name' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
    
    # Get server details for confirmation
    local hostname=$(echo "$server_info" | jq -r '.hostname')
    local port=$(echo "$server_info" | jq -r '.port')
    local protocol=$(echo "$server_info" | jq -r '.protocol')
    local base_url="$protocol://$hostname:$port"
    
    print_success "Switched to server: $name"
    print_info "Endpoint: $base_url"
    print_info "All monk commands will now use this server"
    
    # Update CLI_BASE_URL environment for current session
    export CLI_BASE_URL="$base_url"
    print_info "CLI_BASE_URL set to: $base_url"
}

# Delete a server
delete_server() {
    local name="$1"
    
    if [ -z "$name" ]; then
        print_error "Server name required"
        print_info "Usage: monk servers delete <name>"
        return 1
    fi
    
    init_servers_config
    
    if ! command -v jq >/dev/null 2>&1; then
        print_error "jq is required for server management"
        return 1
    fi
    
    # Check if server exists
    if ! jq -e ".servers.\"$name\"" "$SERVERS_CONFIG" >/dev/null 2>&1; then
        print_error "Server '$name' not found"
        print_info "Use 'monk servers list' to see available servers"
        return 1
    fi
    
    print_step "Deleting server: $name"
    
    # Remove server from config
    local temp_file=$(mktemp)
    jq --arg name "$name" 'del(.servers[$name])' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
    
    # If this was the current server, clear current
    local current_server
    current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)
    if [ "$current_server" = "$name" ]; then
        jq '.current = null' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
        print_info "Cleared current server (was deleted server)"
    fi
    
    print_success "Server '$name' deleted successfully"
}

# Show servers help
show_servers_help() {
    cat << EOF
Usage: monk servers <command> [options]

Remote server registry and management for deployed monk API servers.

Commands:
  add <name> <endpoint>    Add server to registry
  list                     List all servers with status check
  current                  Show currently selected server
  use <name>               Switch to server (sets CLI_BASE_URL)
  delete <name>            Remove server from registry
  ping <name>              Health check specific server
  ping-all                 Health check all registered servers

Server Addition:
  monk servers add <name> <hostname:port> [--description "text"]
  
  Examples:
    monk servers add prod api.company.com:443
    monk servers add staging staging-api.company.com:3000 --description "Staging Environment"
    monk servers add local localhost:3000

Endpoint Formats:
  hostname:port            Auto-detect protocol (443=https, others=http)
  http://hostname:port     Explicit HTTP
  https://hostname:port    Explicit HTTPS

Examples:
  monk servers add prod api.company.com:443           # Uses HTTPS
  monk servers add dev localhost:3000                 # Uses HTTP
  monk servers list                                   # Show all with status
  monk servers ping prod                              # Test production server
  monk servers use prod                               # Switch to production
  monk servers current                                # Show active server

Integration:
  - Switching servers updates CLI_BASE_URL for all monk commands
  - Server status is cached and updated during ping operations
  - Configurations stored in ~/.config/monk/servers.json
  - Works seamlessly with 'monk auth', 'monk data', etc.

Related Commands:
  monk hono start                     # Local development server
  monk test git <branch>              # Git-based test environments
  monk env                            # Show current environment variables

Use 'monk servers <command>' to manage your remote monk API deployments.
EOF
}

# Main command handler
main() {
    if [ $# -eq 0 ]; then
        show_servers_help
        return 1
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        add)
            add_server "$@"
            ;;
        list)
            list_servers
            ;;
        current)
            show_current_server
            ;;
        use)
            use_server "$1"
            ;;
        delete)
            delete_server "$1"
            ;;
        ping)
            ping_server "$1"
            ;;
        ping-all)
            ping_all_servers
            ;;
        -h|--help|help)
            show_servers_help
            ;;
        *)
            print_error "Unknown command: $command"
            print_info "Available commands: add, list, current, use, delete, ping, ping-all"
            print_info "Use 'monk servers --help' for more information"
            return 1
            ;;
    esac
}

main "$@"