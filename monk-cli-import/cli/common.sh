#!/bin/bash
set -e

# Common functions for CLI scripts

# Default configuration
DEFAULT_BASE_URL="http://localhost:3000"
DEFAULT_LIMIT=50
DEFAULT_FORMAT="raw"

# Path resolution functions
find_monk_root() {
    local current_dir="$PWD"
    
    # Start from current directory and walk up
    while [ "$current_dir" != "/" ]; do
        if [ -f "$current_dir/CLAUDE.md" ] && grep -q "# Monk - PaaS Backend System" "$current_dir/CLAUDE.md" 2>/dev/null; then
            echo "$current_dir"
            return 0
        fi
        current_dir=$(dirname "$current_dir")
    done
    
    # Fallback: check if we're already in a monk subdirectory
    if [ -d "monk-cli" ] && [ -d "monk-api-hono" ] && [ -d "monk-api-test" ]; then
        echo "$PWD"
        return 0
    fi
    
    return 1
}

get_monk_api_dir() {
    local monk_root="${MONK_API_SOURCE_DIR:-}"
    if [ -n "$monk_root" ]; then
        echo "$monk_root"
        return 0
    fi
    
    local root
    if root=$(find_monk_root); then
        echo "$root/monk-api-hono"
        return 0
    fi
    
    # For global monk command, check common workspace patterns
    local workspace_patterns=(
        "$HOME/Workspaces/monk/monk-api-hono"
        "$HOME/workspace/monk/monk-api-hono" 
        "$HOME/projects/monk/monk-api-hono"
        "$HOME/dev/monk/monk-api-hono"
    )
    
    for pattern in "${workspace_patterns[@]}"; do
        if [ -d "$pattern" ]; then
            echo "$pattern"
            return 0
        fi
    done
    
    # Final fallback for backwards compatibility
    echo "$(dirname "$(dirname "$0")")/monk-api-hono"
}

get_run_history_dir() {
    local history_dir="${MONK_RUN_HISTORY_DIR:-}"
    if [ -n "$history_dir" ]; then
        echo "$history_dir"
        return 0
    fi
    
    local root
    if root=$(find_monk_root); then
        echo "$root/monk-api-test/run-history"
        return 0
    fi
    
    # For global monk command, check common workspace patterns
    local workspace_patterns=(
        "$HOME/Workspaces/monk/monk-api-test/run-history"
        "$HOME/workspace/monk/monk-api-test/run-history"
        "$HOME/projects/monk/monk-api-test/run-history"
        "$HOME/dev/monk/monk-api-test/run-history"
    )
    
    for pattern in "${workspace_patterns[@]}"; do
        local base_dir=$(dirname "$pattern")
        if [ -d "$base_dir" ]; then
            mkdir -p "$pattern"
            echo "$pattern"
            return 0
        fi
    done
    
    # Final fallback for backwards compatibility
    echo "$(dirname "$(dirname "$0")")/monk-api-test/run-history"
}

# Get git remote URL for monk-api-hono
get_monk_git_remote() {
    local remote_url="${MONK_GIT_REMOTE:-}"
    if [ -n "$remote_url" ]; then
        echo "$remote_url"
        return 0
    fi
    
    # Try to auto-detect from current git repository
    local current_remote
    if current_remote=$(git remote get-url origin 2>/dev/null); then
        # Check if it's a monk-api-hono repository
        if echo "$current_remote" | grep -q "monk-api-hono"; then
            echo "$current_remote"
            return 0
        fi
    fi
    
    # Try to detect from monk workspace
    local root
    if root=$(find_monk_root); then
        local api_dir="$root/monk-api-hono"
        if [ -d "$api_dir/.git" ]; then
            if current_remote=$(cd "$api_dir" && git remote get-url origin 2>/dev/null); then
                echo "$current_remote"
                return 0
            fi
        fi
    fi
    
    # Default fallback - assume ianzepp GitHub repository
    echo "git@github.com:ianzepp/monk-api-hono.git"
}

# Get target directory for git builds
get_monk_git_target() {
    local target_dir="${MONK_GIT_TARGET:-}"
    if [ -n "$target_dir" ]; then
        echo "$target_dir"
        return 0
    fi
    
    # Default to /tmp/monk-builds
    echo "/tmp/monk-builds"
}

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