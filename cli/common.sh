#!/bin/bash
set -e

# Common functions for CLI scripts

# Default configuration
DEFAULT_BASE_URL="http://localhost:3000"
DEFAULT_LIMIT=50
DEFAULT_FORMAT="raw"

# Colors for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get base URL from environment or use default
get_base_url() {
    echo "${CLI_BASE_URL:-$DEFAULT_BASE_URL}"
}

# Get query limit from environment or use default
get_limit() {
    echo "${CLI_LIMIT:-$DEFAULT_LIMIT}"
}

# Print colored output
print_error() {
    echo -e "${RED}Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_info() {
    echo -e "${BLUE}$1${NC}"
}

print_warning() {
    echo -e "${YELLOW}$1${NC}"
}

# Get stored JWT token
get_jwt_token() {
    local jwt_token_file="${HOME}/.monk-jwt-token"
    if [ -f "$jwt_token_file" ]; then
        cat "$jwt_token_file"
    fi
}

# Make HTTP request and handle response - programmatic by default
make_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    local base_url=$(get_base_url)
    local full_url="${base_url}${url}"
    
    # Only show verbose info if CLI_VERBOSE is set
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Making $method request to: $full_url" >&2
    fi
    
    local curl_args=(-s -X "$method" -H "Content-Type: application/json")
    
    # Add JWT token if available (unless it's an auth request)
    if [[ "$url" != "/auth/"* ]]; then
        local jwt_token
        jwt_token=$(get_jwt_token)
        if [ -n "$jwt_token" ]; then
            curl_args+=(-H "Authorization: Bearer $jwt_token")
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Using stored JWT token" >&2
            fi
        fi
    fi
    
    if [ -n "$data" ]; then
        curl_args+=(-d "$data")
    fi
    
    local response
    local http_code
    
    # Make request and capture both response and HTTP status code
    response=$(curl "${curl_args[@]}" -w "\n%{http_code}" "$full_url")
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | sed '$d')
    
    # Handle HTTP errors
    case "$http_code" in
        200|201)
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_success "Success ($http_code)" >&2
            fi
            # Return response without formatting - let caller handle it
            echo "$response"
            return 0
            ;;
        400|404|500)
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_error "HTTP Error ($http_code)" >&2
            fi
            echo "$response" >&2
            exit 1
            ;;
        *)
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_error "HTTP $http_code" >&2
            fi
            echo "$response" >&2
            exit 1
            ;;
    esac
}

# Handle response based on CLI flags - optimized for testing
handle_response() {
    local response="$1"
    local operation_type="$2"  # "list", "create", "get", etc.
    
    # Exit code only mode - no output, just exit status
    if [ "$CLI_EXIT_CODE_ONLY" = "true" ]; then
        if echo "$response" | grep -q '"success":true'; then
            exit 0
        else
            exit 1
        fi
    fi
    
    # Count mode for list operations
    if [ "$CLI_COUNT_MODE" = "true" ] && [ "$operation_type" = "list" ]; then
        if [ "$JSON_PARSER" = "jq" ]; then
            echo "$response" | jq '.data | length' 2>/dev/null || echo "0"
        elif [ "$JSON_PARSER" = "jshon" ]; then
            echo "$response" | jshon -e data -l 2>/dev/null || echo "0"
        else
            echo "$response"
        fi
        return
    fi
    
    # Field extraction mode
    if [ -n "$CLI_FORMAT" ]; then
        if [ "$JSON_PARSER" = "jq" ]; then
            # Handle both single objects and arrays
            if echo "$response" | jq -e '.data | type == "array"' >/dev/null 2>&1; then
                # Array case - extract field from each item
                echo "$response" | jq -r ".data[].${CLI_FORMAT}" 2>/dev/null || {
                    if [ "$CLI_VERBOSE" = "true" ]; then
                        print_error "Failed to extract field: $CLI_FORMAT" >&2
                    fi
                    exit 1
                }
            else
                # Single object case - extract field directly
                echo "$response" | jq -r ".data.${CLI_FORMAT}" 2>/dev/null || {
                    if [ "$CLI_VERBOSE" = "true" ]; then
                        print_error "Failed to extract field: $CLI_FORMAT" >&2
                    fi
                    exit 1
                }
            fi
        elif [ "$JSON_PARSER" = "jshon" ]; then
            echo "$response" | jshon -e data -e "$CLI_FORMAT" -u 2>/dev/null || {
                if [ "$CLI_VERBOSE" = "true" ]; then
                    print_error "Failed to extract field: $CLI_FORMAT" >&2
                fi
                exit 1
            }
        else
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_error "jq or jshon required for field extraction" >&2
            fi
            exit 1
        fi
        return
    fi
    
    # Default: auto-extract 'data' property for cleaner output
    if [ "$JSON_PARSER" = "jq" ]; then
        # Check if response has success:true and extract data
        if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
            if echo "$response" | jq -e '.success == true' >/dev/null 2>&1; then
                # Success response - extract data
                echo "$response" | jq '.data'
            else
                # Error response - show full response for debugging
                echo "$response"
            fi
        else
            # Not a standard API response - show raw
            echo "$response"
        fi
    elif [ "$JSON_PARSER" = "jshon" ]; then
        # Check if response has success:true and extract data
        if echo "$response" | jshon -e success -u 2>/dev/null | grep -q "true"; then
            echo "$response" | jshon -e data 2>/dev/null || echo "$response"
        else
            echo "$response"
        fi
    else
        # No JSON parser - raw output
        echo "$response"
    fi
}

# Validate required arguments
require_args() {
    local required_count="$1"
    local actual_count="$2"
    local usage="$3"
    
    if [ "$actual_count" -lt "$required_count" ]; then
        print_error "Missing required arguments"
        print_info "Usage: $usage"
        exit 1
    fi
}

# Check dependencies - keep it simple
check_dependencies() {
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed."
        exit 1
    fi
    
    # Check for JSON parser for extraction operations (prefer jq over jshon)
    if command -v jq &> /dev/null; then
        export JSON_PARSER="jq"
    elif command -v jshon &> /dev/null; then
        export JSON_PARSER="jshon"
    else
        export JSON_PARSER="none"
    fi
}