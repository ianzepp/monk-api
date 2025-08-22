# Check dependencies
check_dependencies

init_servers_config

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required for server management"
    exit 1
fi

echo
print_info "Registered Servers"
echo

current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)

server_names=$(jq -r '.servers | keys[]' "$SERVERS_CONFIG" 2>/dev/null)

if [ -z "$server_names" ]; then
    print_info "No servers configured"
    print_info "Use 'monk servers add <name> <hostname:port>' to add servers"
    exit 0
fi

printf "%-15s %-30s %-8s %-8s %-12s %-20s %s\n" "Name" "Endpoint" "Status" "Auth" "Last Ping" "Added" "Description"
echo "--------------------------------------------------------------------------------------------------------"

echo "$server_names" | while read -r name; do
    if [ -n "$name" ]; then
        server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG")
        
        hostname=$(echo "$server_info" | jq -r '.hostname')
        port=$(echo "$server_info" | jq -r '.port')
        protocol=$(echo "$server_info" | jq -r '.protocol')
        status=$(echo "$server_info" | jq -r '.status // "unknown"')
        jwt_token=$(echo "$server_info" | jq -r '.jwt_token // ""')
        last_ping=$(echo "$server_info" | jq -r '.last_ping // "never"')
        added_at=$(echo "$server_info" | jq -r '.added_at // "unknown"')
        description=$(echo "$server_info" | jq -r '.description // ""')
        
        endpoint="$protocol://$hostname:$port"
        
        # Format timestamps
        if [ "$last_ping" != "never" ] && [ "$last_ping" != "unknown" ]; then
            last_ping=$(echo "$last_ping" | cut -d'T' -f1)
        fi
        if [ "$added_at" != "unknown" ]; then
            added_at=$(echo "$added_at" | cut -d'T' -f1)
        fi
        
        # Check if authenticated
        auth_status="no"
        if [ -n "$jwt_token" ]; then
            auth_status="yes"
        fi
        
        # Mark current server
        marker=""
        if [ "$name" = "$current_server" ]; then
            marker="*"
        fi
        
        printf "%-15s %-30s %-8s %-8s %-12s %-20s %s %s\n" \
            "$name" "$endpoint" "$status" "$auth_status" "$last_ping" "$added_at" "$description" "$marker"
    fi
done

echo
if [ -n "$current_server" ]; then
    print_info "Current server: $current_server (marked with *)"
else
    print_info "No current server selected"
    print_info "Use 'monk servers use <name>' to select a server"
fi