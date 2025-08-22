# Check dependencies
check_dependencies

init_servers_config

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required for server management"
    exit 1
fi

current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)

if [ -z "$current_server" ] || [ "$current_server" = "null" ]; then
    print_info "No current server selected"
    print_info "Use 'monk servers use <name>' to select a server"
    exit 0
fi

server_info=$(jq -r ".servers.\"$current_server\"" "$SERVERS_CONFIG" 2>/dev/null)
if [ "$server_info" = "null" ]; then
    print_error "Current server '$current_server' not found in registry"
    print_info "The server may have been deleted. Use 'monk servers list' to see available servers"
    exit 1
fi

echo
print_info "Current Server"
echo

hostname=$(echo "$server_info" | jq -r '.hostname')
port=$(echo "$server_info" | jq -r '.port')
protocol=$(echo "$server_info" | jq -r '.protocol')
status=$(echo "$server_info" | jq -r '.status // "unknown"')
description=$(echo "$server_info" | jq -r '.description // ""')

echo "Name: $current_server"
echo "Endpoint: $protocol://$hostname:$port"
echo "Status: $status"
if [ -n "$description" ]; then
    echo "Description: $description"
fi

# Show calculated base URL
base_url="$protocol://$hostname:$port"
echo "Base URL: $base_url"