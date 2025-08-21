#!/bin/bash
set -e

# Ping CLI - Check server connectivity and optional JWT domain
#
# Usage: monk ping [options]
#
# Options:
#   -v, --verbose     Show detailed information
#   -j, --jwt TOKEN   Include JWT token in request
#   -h, --help        Show this help message
#
# Examples:
#   monk ping
#   monk ping -v
#   monk ping -j <jwt-token>

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Initialize variables
CLI_VERBOSE=false
JWT_TOKEN=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            CLI_VERBOSE=true
            shift
            ;;
        -j|--jwt)
            JWT_TOKEN="$2"
            shift 2
            ;;
        -h|--help)
            cat << EOF
Usage: monk ping [options]

Check server connectivity and optional JWT domain information.

Options:
  -v, --verbose     Show detailed information
  -j, --jwt TOKEN   Include JWT token in request
  -h, --help        Show this help message

Examples:
  monk ping                    # Basic connectivity check
  monk ping -v                 # Verbose output
  monk ping -j <jwt-token>     # Include JWT token

The ping command tests connectivity to the Monk API server and optionally
displays the domain from a provided JWT token.
EOF
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_info "Use 'monk ping --help' for usage information"
            exit 1
            ;;
    esac
done

# Make ping request
ping_server() {
    local response
    local base_url=$(get_base_url)
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Pinging server at: $base_url"
    fi
    
    # Prepare curl arguments
    local curl_args=(-s -X GET -H "Content-Type: application/json")
    
    # Add JWT token (provided via -j flag or stored token)
    local token_to_use="$JWT_TOKEN"
    if [ -z "$token_to_use" ]; then
        token_to_use=$(get_jwt_token)
    fi
    
    if [ -n "$token_to_use" ]; then
        curl_args+=(-H "Authorization: Bearer $token_to_use")
        if [ "$CLI_VERBOSE" = "true" ]; then
            if [ -n "$JWT_TOKEN" ]; then
                print_info "Using provided JWT token"
            else
                print_info "Using stored JWT token"
            fi
        fi
    fi
    
    # Make request
    local full_url="${base_url}/ping"
    response=$(curl "${curl_args[@]}" -w "\n%{http_code}" "$full_url")
    local http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    # Handle response
    case "$http_code" in
        200)
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_success "Server is reachable (HTTP $http_code)"
                echo "Response: $response"
            else
                # Parse response for clean output
                if [ "$JSON_PARSER" = "jshon" ]; then
                    local pong=$(echo "$response" | jshon -e pong -u 2>/dev/null || echo "unknown")
                    local domain=$(echo "$response" | jshon -e domain -u 2>/dev/null || echo "null")
                    local database=$(echo "$response" | jshon -e database -u 2>/dev/null || echo "null")
                    
                    echo "pong: $pong"
                    if [ "$domain" != "null" ]; then
                        echo "domain: $domain"
                    fi
                    if [ "$database" != "null" ]; then
                        if [ "$database" = "ok" ]; then
                            echo "database: $database"
                        else
                            echo "database: ERROR - $database"
                        fi
                    fi
                else
                    echo "$response"
                fi
            fi
            return 0
            ;;
        *)
            print_error "Server unreachable (HTTP $http_code)"
            if [ "$CLI_VERBOSE" = "true" ]; then
                echo "Response: $response" >&2
            fi
            return 1
            ;;
    esac
}

# Execute ping
ping_server