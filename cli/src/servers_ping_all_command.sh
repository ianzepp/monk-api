# Check dependencies
check_dependencies

init_servers_config

if ! command -v jq >/dev/null 2>&1; then
    print_error "jq is required for server management"
    exit 1
fi

echo
print_info "Pinging All Servers"
echo

server_names=$(jq -r '.servers | keys[]' "$SERVERS_CONFIG" 2>/dev/null)

if [ -z "$server_names" ]; then
    print_info "No servers configured"
    print_info "Use 'monk servers add <name> <hostname:port>' to add servers"
    exit 0
fi

up_count=0
total_count=0

# Use temp file to avoid subshell variable issues
temp_results=$(mktemp)

echo "$server_names" | while read -r name; do
    if [ -n "$name" ]; then
        echo "$((total_count + 1))" > "$temp_results.count"
        
        server_info=$(jq -r ".servers.\"$name\"" "$SERVERS_CONFIG")
        hostname=$(echo "$server_info" | jq -r '.hostname')
        port=$(echo "$server_info" | jq -r '.port')
        protocol=$(echo "$server_info" | jq -r '.protocol')
        base_url="$protocol://$hostname:$port"
        
        print_info "Pinging server: $name ($base_url)"
        
        if ping_server_url "$base_url" 5; then
            print_success "Server is up and responding"
            # Update status
            timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            temp_file=$(mktemp)
            jq --arg name "$name" \
               --arg timestamp "$timestamp" \
               '.servers[$name].last_ping = $timestamp | .servers[$name].status = "up"' \
               "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
            
            # Count successful pings
            if [ -f "$temp_results.up" ]; then
                up_count=$(cat "$temp_results.up")
            else
                up_count=0
            fi
            echo "$((up_count + 1))" > "$temp_results.up"
        else
            print_error "Server is down or not responding"
            # Update status
            timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            temp_file=$(mktemp)
            jq --arg name "$name" \
               --arg timestamp "$timestamp" \
               '.servers[$name].last_ping = $timestamp | .servers[$name].status = "down"' \
               "$SERVERS_CONFIG" > "$temp_file" && mv "$temp_file" "$SERVERS_CONFIG"
        fi
    fi
done

# Read final counts
if [ -f "$temp_results.count" ]; then
    total_count=$(cat "$temp_results.count")
else
    total_count=0
fi

if [ -f "$temp_results.up" ]; then
    up_count=$(cat "$temp_results.up")
else
    up_count=0
fi

# Clean up temp files
rm -f "$temp_results" "$temp_results.count" "$temp_results.up"

echo
if [ "$up_count" -eq "$total_count" ] && [ "$total_count" -gt 0 ]; then
    print_success "All servers are up ($up_count/$total_count)"
elif [ "$up_count" -eq 0 ] && [ "$total_count" -gt 0 ]; then
    print_error "All servers are down (0/$total_count)"
elif [ "$total_count" -gt 0 ]; then
    print_info "$up_count/$total_count servers are up"
fi