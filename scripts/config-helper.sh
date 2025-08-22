#!/bin/bash
# Shared configuration helper functions for monk test scripts
# Source this file to get consistent configuration access

# Get configuration file path (local project override takes precedence)
get_servers_config() {
    # Check for project-local config first (git environments)
    if [ -f ".config/monk/servers.json" ]; then
        echo ".config/monk/servers.json"
    else
        echo "${HOME}/.config/monk/servers.json"
    fi
}

# Get current server URL from configuration hierarchy
get_current_server_url() {
    local servers_config=$(get_servers_config)
    if command -v jq >/dev/null 2>&1 && [ -f "$servers_config" ]; then
        local current_server=$(jq -r '.current // empty' "$servers_config" 2>/dev/null)
        if [ -n "$current_server" ] && [ "$current_server" != "null" ]; then
            local server_info=$(jq -r ".servers.\"$current_server\"" "$servers_config" 2>/dev/null)
            local hostname=$(echo "$server_info" | jq -r '.hostname')
            local port=$(echo "$server_info" | jq -r '.port')
            local protocol=$(echo "$server_info" | jq -r '.protocol')
            echo "$protocol://$hostname:$port"
        else
            echo "http://localhost:3000"
        fi
    else
        echo "http://localhost:3000"
    fi
}

# Get current JWT token from configuration hierarchy
get_current_jwt_token() {
    local servers_config=$(get_servers_config)
    if command -v jq >/dev/null 2>&1 && [ -f "$servers_config" ]; then
        local current_server=$(jq -r '.current // empty' "$servers_config" 2>/dev/null)
        if [ -n "$current_server" ] && [ "$current_server" != "null" ]; then
            jq -r ".servers.\"$current_server\".jwt_token // empty" "$servers_config" 2>/dev/null
        fi
    fi
}

# Get current server name from configuration hierarchy
get_current_server_name() {
    local servers_config=$(get_servers_config)
    if command -v jq >/dev/null 2>&1 && [ -f "$servers_config" ]; then
        jq -r '.current // "local"' "$servers_config" 2>/dev/null
    else
        echo "local"
    fi
}