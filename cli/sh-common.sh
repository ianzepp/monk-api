#!/bin/bash
# Common functions and utilities for monk sh interactive shell

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Output functions
print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_prompt() { echo -ne "${CYAN}monk:${1}${NC}$ "; }

# Global shell state
CURRENT_DIR="/"
SHELL_RUNNING=true

# Loaded command modules cache (to avoid re-sourcing)
# Using simple variable tracking instead of associative arrays for compatibility
LOADED_COMMANDS=""

# Path utilities
normalize_path() {
    local path="$1"
    # Remove double slashes and trailing slash (except root)
    path=$(echo "$path" | sed 's|//*|/|g' | sed 's|/$||')
    [[ -z "$path" ]] && path="/"
    echo "$path"
}

resolve_path() {
    local target="$1"
    local result="$CURRENT_DIR"
    
    if [[ "$target" == "." ]]; then
        # Stay in current directory
        echo "$CURRENT_DIR"
    elif [[ "$target" == ".." ]]; then
        # Go up one directory
        if [[ "$CURRENT_DIR" == "/" ]]; then
            echo "/"
        else
            dirname "$CURRENT_DIR"
        fi
    elif [[ "$target" == "/"* ]]; then
        # Absolute path
        normalize_path "$target"
    else
        # Relative path
        if [[ "$CURRENT_DIR" == "/" ]]; then
            normalize_path "/$target"
        else
            normalize_path "$CURRENT_DIR/$target"
        fi
    fi
}

# Path validation
validate_path() {
    local path="$1"
    
    # Must start with /
    if [[ ! "$path" == "/"* ]]; then
        return 1
    fi
    
    # No .. components for security (basic check)
    if [[ "$path" == *".."* ]]; then
        return 1
    fi
    
    # Valid root paths
    case "$path" in
        "/"             ) return 0 ;;
        "/data"         ) return 0 ;;
        "/data/"*       ) return 0 ;;
        "/meta"         ) return 0 ;;
        "/meta/"*       ) return 0 ;;
        *               ) return 1 ;;
    esac
}

# Get path type for context-aware operations
get_path_type() {
    local path="$1"
    
    case "$path" in
        "/"                 ) echo "root" ;;
        "/data"             ) echo "data_root" ;;
        "/data/"*           ) echo "data_schema" ;;
        "/meta"             ) echo "meta_root" ;;
        "/meta/schema"      ) echo "meta_schema_root" ;;
        "/meta/schema/"*    ) echo "meta_schema" ;;
        *                   ) echo "unknown" ;;
    esac
}

# Extract schema name from data path
get_schema_from_path() {
    local path="$1"
    
    if [[ "$path" == "/data/"* ]]; then
        # Remove /data/ prefix and get first component
        local schema_path="${path#/data/}"
        echo "${schema_path%%/*}"
    fi
}

# Extract record ID from data path
get_record_id_from_path() {
    local path="$1"
    local filename="$2"
    
    if [[ "$path" == "/data/"* ]]; then
        # In a schema directory, filename is the record ID
        echo "$filename"
    fi
}

# Check if monk CLI is available and authenticated
check_monk_auth() {
    if ! command -v monk >/dev/null 2>&1; then
        print_error "monk CLI not found in PATH"
        return 1
    fi
    
    if ! monk auth status >/dev/null 2>&1; then
        print_warning "Not authenticated. Some features may be limited."
        print_info "Run 'monk auth login' to authenticate"
        return 1
    fi
    
    return 0
}

# Load command module if not already loaded
load_command() {
    local cmd="$1"
    local script_dir="$(dirname "${BASH_SOURCE[0]}")"
    local cmd_file="$script_dir/sh-$cmd.sh"
    
    # Check if already loaded (simple string search)
    if [[ "$LOADED_COMMANDS" == *":$cmd:"* ]]; then
        return 0
    fi
    
    # Check if command file exists
    if [[ -f "$cmd_file" ]]; then
        source "$cmd_file"
        LOADED_COMMANDS="${LOADED_COMMANDS}:$cmd:"
        return 0
    else
        return 1
    fi
}

# Execute command with lazy loading
execute_command() {
    local cmd="$1"
    shift
    local args=("$@")
    
    # Try to load command module
    if load_command "$cmd"; then
        # Call the command function (convention: sh_<command>)
        local func_name="sh_$cmd"
        if declare -f "$func_name" >/dev/null; then
            "$func_name" "${args[@]}"
        else
            print_error "Command function $func_name not found in sh-$cmd.sh"
            return 1
        fi
    else
        print_error "Unknown command: $cmd"
        print_info "Type 'help' for available commands"
        return 1
    fi
}

# Utility: call monk CLI with error handling
call_monk() {
    local output
    local exit_code
    
    # Capture both stdout and exit code
    output=$(monk "$@" 2>&1)
    exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        echo "$output"
        return 0
    else
        print_error "monk $*: $output"
        return $exit_code
    fi
}

# Utility: format JSON output for display
format_json() {
    if command -v jq >/dev/null 2>&1; then
        jq '.' 2>/dev/null || cat
    else
        cat
    fi
}

# Utility: format YAML output for display  
format_yaml() {
    # For now, just display as-is
    # Could add syntax highlighting later
    cat
}