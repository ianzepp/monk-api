#!/bin/bash
set -e

# Test environment information script for Monk API project
# Extracted from monk CLI test_env_command for project-local usage
#
# Usage: scripts/test-info.sh [VAR_NAME]
# 
# Examples:
#   scripts/test-info.sh              # Show full environment status
#   scripts/test-info.sh SERVER_URL   # Show just server URL
#   scripts/test-info.sh JWT_TOKEN    # Show just JWT token

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Configuration files
SERVERS_CONFIG="${HOME}/.config/monk/servers.json"

# Helper functions to get monk configuration
get_current_server_url() {
    if command -v monk >/dev/null 2>&1; then
        monk test env SERVER_URL 2>/dev/null || echo "http://localhost:3000"
    else
        echo "http://localhost:3000"
    fi
}

get_current_jwt_token() {
    if command -v monk >/dev/null 2>&1; then
        monk auth token 2>/dev/null || echo ""
    fi
}

get_current_server_name() {
    if command -v monk >/dev/null 2>&1; then
        monk test env CURRENT_SERVER 2>/dev/null || echo "local"
    else
        echo "local"
    fi
}

# Get specific variable if requested
var_name="${1:-}"

if [ -n "$var_name" ]; then
    case "$var_name" in
        SERVER_URL)
            get_current_server_url
            ;;
        CURRENT_SERVER)
            get_current_server_name
            ;;
        CURRENT_TENANT)
            if [ -f "$HOME/.monk/current_tenant" ]; then
                cat "$HOME/.monk/current_tenant"
            else
                echo "none"
            fi
            ;;
        JWT_TOKEN)
            get_current_jwt_token
            ;;
        DB_USER)
            echo "$(whoami)"
            ;;
        *)
            echo "Unknown variable: $var_name" >&2
            echo "Available variables: SERVER_URL, CURRENT_SERVER, CURRENT_TENANT, JWT_TOKEN, DB_USER" >&2
            exit 1
            ;;
    esac
    exit 0
fi

# Show comprehensive environment status
echo
print_info "Current Environment Status"
echo

# Server Information
if command -v jq >/dev/null 2>&1 && [ -f "$SERVERS_CONFIG" ]; then
    current_server=$(jq -r '.current // empty' "$SERVERS_CONFIG" 2>/dev/null)
    if [ -n "$current_server" ] && [ "$current_server" != "null" ]; then
        server_info=$(jq -r ".servers.\"$current_server\"" "$SERVERS_CONFIG" 2>/dev/null)
        hostname=$(echo "$server_info" | jq -r '.hostname')
        port=$(echo "$server_info" | jq -r '.port')
        protocol=$(echo "$server_info" | jq -r '.protocol')
        base_url="$protocol://$hostname:$port"
        
        echo "Current Server: $current_server"
        echo "Server URL: $base_url"
        
        # Check if server is running
        if lsof -i ":$port" >/dev/null 2>&1; then
            echo "Server Status: running"
        else
            echo "Server Status: stopped"
        fi
    else
        echo "Current Server: none"
        echo "Server URL: not configured"
        echo "Server Status: no server selected"
    fi
else
    echo "Current Server: not configured"
    echo "Server URL: not configured"  
    echo "Server Status: servers.json not found"
fi

echo

# Authentication Status
jwt_token=$(get_current_jwt_token)
if [ -n "$jwt_token" ]; then
    echo "Authentication: authenticated"
    
    # Try to decode domain from JWT
    if command -v jq >/dev/null 2>&1; then
        payload=$(echo "$jwt_token" | cut -d'.' -f2)
        case $((${#payload} % 4)) in
            2) payload="${payload}==" ;;
            3) payload="${payload}=" ;;
        esac
        
        if command -v base64 >/dev/null 2>&1; then
            decoded=$(echo "$payload" | base64 -d 2>/dev/null || echo "")
            if [ -n "$decoded" ]; then
                domain=$(echo "$decoded" | jq -r '.domain' 2>/dev/null || echo "unknown")
                sub=$(echo "$decoded" | jq -r '.sub' 2>/dev/null || echo "unknown")
                access=$(echo "$decoded" | jq -r '.access' 2>/dev/null || echo "unknown")
                user_id=$(echo "$decoded" | jq -r '.user_id' 2>/dev/null || echo "null")
                
                echo "JWT Domain: $domain"
                echo "JWT Subject: $sub"
                echo "JWT Access: $access"
                echo "JWT User ID: $user_id"
            fi
        fi
    fi
else
    echo "Authentication: not authenticated"
    echo "JWT Domain: none"
fi

echo

# Tenant Information  
if [ -f "$HOME/.monk/current_tenant" ]; then
    current_tenant=$(cat "$HOME/.monk/current_tenant")
    echo "Current Tenant: $current_tenant"
else
    echo "Current Tenant: none"
fi

echo

# Database Information
echo "Database User: $(whoami)"
echo "Database Host: localhost"
echo "Database Port: 5432"

echo

# Configuration Files
echo "Servers Config: $SERVERS_CONFIG"
if [ -f "$SERVERS_CONFIG" ]; then
    echo "Servers Config Status: exists"
else
    echo "Servers Config Status: not found"
fi

if [ -f "$HOME/.monk/current_tenant" ]; then
    echo "Tenant Config: ~/.monk/current_tenant (exists)"
else
    echo "Tenant Config: ~/.monk/current_tenant (not found)"
fi

echo

# Usage help
print_info "Usage: scripts/test-info.sh [VAR_NAME] to get specific variable"
print_info "Available variables: SERVER_URL, CURRENT_SERVER, CURRENT_TENANT, JWT_TOKEN, DB_USER"