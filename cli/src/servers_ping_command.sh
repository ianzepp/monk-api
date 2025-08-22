# Check dependencies
check_dependencies

# Get arguments from bashly
name="${args[name]}"

init_servers_config

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required for server management"
    exit 1
fi

# Get server info
server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG" 2>/dev/null)
if [ "$server_info" = "null" ]; then
    print_error "Server '$name' not found"
    print_info "Use 'monk servers list' to see available servers"
    exit 1
fi

hostname=$(echo "$server_info" | jq -r '.hostname')
port=$(echo "$server_info" | jq -r '.port')
protocol=$(echo "$server_info" | jq -r '.protocol')
base_url="$protocol://$hostname:$port"

print_info "Pinging server: $name ($base_url)"

if ping_server_url "$base_url" 10; then
    print_success "Server is up and responding"
    
    # Update status in config
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    temp_file=$(mktemp)
    jq --arg name "$name" \
       --arg timestamp "$timestamp" \
       '.servers[$name].last_ping = $timestamp | .servers[$name].status = "up"' \
       "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
else
    print_error "Server is down or not responding"
    
    # Update status in config
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    temp_file=$(mktemp)
    jq --arg name "$name" \
       --arg timestamp "$timestamp" \
       '.servers[$name].last_ping = $timestamp | .servers[$name].status = "down"' \
       "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
    exit 1
fi