# Check dependencies
check_dependencies

# Get arguments from bashly
name="${args[name]}"

init_servers_config

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required for server management"
    exit 1
fi

# Check if server exists
server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG" 2>/dev/null)
if [ "$server_info" = "null" ]; then
    print_error "Server '$name' not found"
    print_info "Use 'monk servers list' to see available servers"
    exit 1
fi

# Set as current server
temp_file=$(mktemp)
jq --arg name "$name" '.current = $name' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"

# Get server details for confirmation
hostname=$(echo "$server_info" | jq -r '.hostname')
port=$(echo "$server_info" | jq -r '.port')
protocol=$(echo "$server_info" | jq -r '.protocol')
base_url="$protocol://$hostname:$port"

print_success "Switched to server: $name"
print_info "Endpoint: $base_url"
print_info "All monk commands will now use this server"
print_info "Base URL: $base_url"