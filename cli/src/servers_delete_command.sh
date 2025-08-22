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
if ! jq -e ".servers.\"$name\"" "$SERVERS_CONFIG" >/dev/null 2>&1; then
    print_error "Server '$name' not found"
    print_info "Use 'monk servers list' to see available servers"
    exit 1
fi

print_info "Deleting server: $name"

# Remove server from config
temp_file=$(mktemp)
jq --arg name "$name" 'del(.servers[$name])' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"

# If this was the current server, clear current
current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)
if [ "$current_server" = "$name" ]; then
    jq '.current = null' "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
    print_info "Cleared current server (was deleted server)"
fi

print_success "Server '$name' deleted successfully"