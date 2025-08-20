#!/bin/bash
set -e

# Auth CLI - Authentication and token management
#
# Usage: monk auth <operation> [options]
#
# Operations:
#   login --domain DOMAIN    Authenticate with domain and store JWT token
#   logout                   Clear stored JWT token
#   status                   Show current authentication status
#   token                    Display current JWT token
#
# Examples:
#   monk auth login --domain test_db_123
#   monk auth status
#   monk auth logout

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# JWT token storage file
JWT_TOKEN_FILE="${HOME}/.monk-jwt-token"

# Show usage information
show_usage() {
    cat << EOF
Usage: monk auth <operation> [options]

Authentication and token management for Monk CLI.

Operations:
  login --domain DOMAIN    Authenticate with domain and store JWT token
  logout                   Clear stored JWT token  
  status                   Show current authentication status
  token                    Display current JWT token

Options:
  -v, --verbose           Show detailed information
  -h, --help              Show this help message

Examples:
  monk auth login --domain test_database_123
  monk auth status
  monk auth logout

The login operation authenticates with the Monk API using the specified
database domain and stores the JWT token for use by other monk commands.
EOF
}

# Store JWT token securely
store_token() {
    local token="$1"
    echo "$token" > "$JWT_TOKEN_FILE"
    chmod 600 "$JWT_TOKEN_FILE"
}

# Get stored JWT token
get_stored_token() {
    if [ -f "$JWT_TOKEN_FILE" ]; then
        cat "$JWT_TOKEN_FILE"
    fi
}

# Remove stored JWT token
remove_stored_token() {
    rm -f "$JWT_TOKEN_FILE"
}

# Login operation
auth_login() {
    local domain=""
    local verbose=false
    
    # Parse login arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain)
                domain="$2"
                shift 2
                ;;
            -v|--verbose)
                verbose=true
                shift
                ;;
            -h|--help)
                cat << EOF
Usage: monk auth login --domain DOMAIN [options]

Authenticate with the Monk API using the specified database domain.

Required Arguments:
  --domain DOMAIN         Database domain name for authentication

Options:
  -v, --verbose          Show detailed information
  -h, --help             Show this help message

Examples:
  monk auth login --domain test_database_123
  monk auth login --domain monk_api_hono_dev --verbose

The domain should match the name of the database you want to access.
For test databases, use the database name created by your test setup.
EOF
                return 0
                ;;
            *)
                print_error "Unknown option: $1"
                print_info "Use 'monk auth login --help' for usage information"
                return 1
                ;;
        esac
    done
    
    # Validate required arguments
    if [ -z "$domain" ]; then
        print_error "Domain is required for login"
        print_info "Usage: monk auth login --domain DOMAIN"
        return 1
    fi
    
    if [ "$verbose" = true ]; then
        print_info "Authenticating with domain: $domain"
        export CLI_VERBOSE=true
    fi
    
    # Prepare authentication request
    local auth_data="{\"domain\": \"$domain\"}"
    local base_url=$(get_base_url)
    
    if [ "$verbose" = true ]; then
        print_info "Sending authentication request to: ${base_url}/auth/login"
    fi
    
    # Make authentication request
    local response
    if response=$(echo "$auth_data" | make_request "POST" "/auth/login" "$auth_data"); then
        # Extract token from response
        local token=""
        if [ "$JSON_PARSER" = "jshon" ]; then
            token=$(echo "$response" | jshon -e data -e token -u 2>/dev/null)
        else
            # Fallback: extract token manually
            token=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        fi
        
        if [ -n "$token" ]; then
            # Store token
            store_token "$token"
            
            print_success "Authentication successful"
            
            if [ "$verbose" = true ]; then
                print_info "JWT token stored in: $JWT_TOKEN_FILE"
                
                # Test the token with ping
                print_info "Testing token with ping..."
                if CLI_BASE_URL="$base_url" CLI_VERBOSE=false \
                   "${CLI_ROOT}/../monk-cli/cli/ping.sh" -j "$token" > /dev/null 2>&1; then
                    print_success "Token verification successful"
                else
                    print_warning "Token verification failed"
                fi
            fi
            
            return 0
        else
            print_error "Failed to extract JWT token from response"
            if [ "$verbose" = true ]; then
                print_info "Response: $response"
            fi
            return 1
        fi
    else
        print_error "Authentication failed"
        return 1
    fi
}

# Logout operation
auth_logout() {
    if [ -f "$JWT_TOKEN_FILE" ]; then
        remove_stored_token
        print_success "Logged out successfully"
    else
        print_info "Already logged out"
    fi
}

# Status operation
auth_status() {
    local token
    token=$(get_stored_token)
    
    if [ -n "$token" ]; then
        print_success "Authenticated"
        
        # Try to extract domain from token (basic decode)
        if [ "$JSON_PARSER" = "jshon" ]; then
            # Decode JWT payload (basic base64 decode of middle part)
            local payload
            payload=$(echo "$token" | cut -d'.' -f2)
            # Add padding if needed
            case $((${#payload} % 4)) in
                2) payload="${payload}==" ;;
                3) payload="${payload}=" ;;
            esac
            
            if command -v base64 &> /dev/null; then
                local decoded
                if decoded=$(echo "$payload" | base64 -d 2>/dev/null); then
                    local domain
                    domain=$(echo "$decoded" | jshon -e domain -u 2>/dev/null || echo "unknown")
                    local exp
                    exp=$(echo "$decoded" | jshon -e exp -u 2>/dev/null || echo "unknown")
                    
                    echo "Domain: $domain"
                    if [ "$exp" != "unknown" ]; then
                        local exp_date
                        if command -v date &> /dev/null; then
                            exp_date=$(date -r "$exp" 2>/dev/null || echo "unknown")
                            echo "Expires: $exp_date"
                        fi
                    fi
                fi
            fi
        fi
        
        echo "Token file: $JWT_TOKEN_FILE"
    else
        print_info "Not authenticated"
        echo "Use 'monk auth login --domain DOMAIN' to authenticate"
    fi
}

# Token operation
auth_token() {
    local token
    token=$(get_stored_token)
    
    if [ -n "$token" ]; then
        echo "$token"
    else
        print_error "No token found. Use 'monk auth login --domain DOMAIN' first"
        return 1
    fi
}

# Main function
main() {
    if [ $# -eq 0 ]; then
        show_usage
        return 1
    fi
    
    local operation="$1"
    shift
    
    case "$operation" in
        login)
            auth_login "$@"
            ;;
        logout)
            auth_logout "$@"
            ;;
        status)
            auth_status "$@"
            ;;
        token)
            auth_token "$@"
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown operation: $operation"
            print_info "Available operations: login, logout, status, token"
            print_info "Use 'monk auth --help' for more information"
            return 1
            ;;
    esac
}

main "$@"