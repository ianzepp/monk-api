# Check dependencies
check_dependencies

# Get arguments from bashly
var_name="${args[var_name]}"

# If specific variable requested, show just that
if [ -n "$var_name" ]; then
    case "$var_name" in
        CLI_BASE_URL)
            get_base_url 2>/dev/null || echo "Not configured"
            ;;
        CURRENT_SERVER)
            if command -v jq >/dev/null 2>&1 && [ -f "$SERVERS_CONFIG" ]; then
                jq -r '.current // "none"' "$SERVERS_CONFIG" 2>/dev/null || echo "none"
            else
                echo "none"
            fi
            ;;
        CURRENT_TENANT)
            if [ -f "$HOME/.monk/current_tenant" ]; then
                cat "$HOME/.monk/current_tenant"
            else
                echo "none"
            fi
            ;;
        JWT_TOKEN)
            get_jwt_token || echo "Not authenticated"
            ;;
        DB_USER)
            echo "$(whoami)"
            ;;
        *)
            print_error "Unknown variable: $var_name"
            print_info "Available variables: CLI_BASE_URL, CURRENT_SERVER, CURRENT_TENANT, JWT_TOKEN, DB_USER"
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
jwt_token=$(get_jwt_token)
if [ -n "$jwt_token" ]; then
    echo "Authentication: authenticated"
    
    # Try to decode domain from JWT
    if [ "$JSON_PARSER" = "jq" ]; then
        payload=$(echo "$jwt_token" | cut -d'.' -f2)
        case $((${#payload} % 4)) in
            2) payload="${payload}==" ;;
            3) payload="${payload}=" ;;
        esac
        
        if command -v base64 >/dev/null 2>&1; then
            decoded=$(echo "$payload" | base64 -d 2>/dev/null || echo "")
            if [ -n "$decoded" ]; then
                domain=$(echo "$decoded" | jq -r '.domain' 2>/dev/null || echo "unknown")
                echo "JWT Domain: $domain"
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
print_info "Usage: monk test env [VAR_NAME] to get specific variable"
print_info "Available variables: CLI_BASE_URL, CURRENT_SERVER, CURRENT_TENANT, JWT_TOKEN, DB_USER"