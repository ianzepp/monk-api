#!/bin/bash
set -e

# CLI for /api/meta endpoints

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions and argument helpers
source "$SCRIPT_DIR/common.sh"
source "$SCRIPT_DIR/args-helper.sh"

# Check dependencies
check_dependencies

# Usage information
show_usage() {
    cat << EOF
Usage: ./monk meta <operation> <type> [args...]

Operations:
  list <type>             List metadata objects
  get <type> <name>       Get specific metadata object
  create <type>           Create new metadata object from stdin (YAML/JSON)
  update <type> <name>    Update existing metadata object from stdin (YAML/JSON)
  delete <type> <name>    Delete metadata object

Types:
  schema                  Schema definitions

Examples:
  ./monk meta list schema
  ./monk meta list schema -e name       # Extract just schema names
  ./monk meta list schema -e id         # Extract just schema IDs
  ./monk meta get schema task
  cat task-schema.yaml | ./monk meta create schema
  cat updated-schema.yaml | ./monk meta update schema task
  ./monk meta delete schema task

Flags (can be positioned anywhere):
  -e FIELD     Extract field values from results (e.g., -e name, -e id)
  -u URL       Base URL for API (default: http://localhost:3001)
  -v           Verbose output with human-friendly messages
  -h           Show this help

Environment Variables:
  CLI_BASE_URL    Base URL for API (default: http://localhost:3001)

Note: For pretty JSON formatting, pipe through jq:
  ./monk meta list schema | jq .
EOF
}

# Validate type
validate_type() {
    local type="$1"
    case "$type" in
        schema)
            return 0
            ;;
        *)
            print_error "Invalid type: $type"
            print_info "Valid types: schema"
            exit 1
            ;;
    esac
}

# List metadata objects
list_objects() {
    local type="$1"
    
    require_args 1 $# "./monk meta list <type>"
    validate_type "$type"
    
    local url="/api/meta/$type"
    
    # Get response (quiet mode for extraction, normal for regular output)
    local response
    if [ -n "$CLI_EXTRACT_FIELD" ]; then
        # Quiet mode for extraction - no info messages
        local base_url=$(get_base_url)
        local full_url="${base_url}${url}"
        response=$(curl -s "$full_url" 2>/dev/null)
    else
        response=$(make_request "GET" "$url")
    fi
    
    # Handle field extraction if -e flag is provided
    if [ -n "$CLI_EXTRACT_FIELD" ]; then
        if [ "$JSON_PARSER" = "jshon" ]; then
            echo "$response" | jshon -e data -a -e "$CLI_EXTRACT_FIELD" -u 2>/dev/null || {
                if [ "$CLI_VERBOSE" = "true" ]; then
                    print_error "Failed to extract field: $CLI_EXTRACT_FIELD" >&2
                fi
                exit 1
            }
        else
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_error "jshon required for field extraction functionality" >&2
            fi
            exit 1
        fi
    else
        handle_response "$response" "list"
    fi
}

# Get specific metadata object
get_object() {
    local type="$1"
    local name="$2"
    
    require_args 2 $# "./monk meta get <type> <name>"
    validate_type "$type"
    
    local url="/api/meta/$type/$name"
    
    local response=$(make_request "GET" "$url")
    handle_response "$response" "get"
}

# Create metadata object from stdin
create_object() {
    local type="$1"
    
    require_args 1 $# "./monk meta create <type>"
    validate_type "$type"
    
    # Always read data from stdin
    local data
    data=$(cat)
    if [ -z "$data" ]; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_error "No data received from stdin" >&2
        fi
        exit 1
    fi
    
    # Always use YAML content type for schema definitions
    local content_type="application/yaml"
    
    local url="/api/meta/$type"
    local base_url=$(get_base_url)
    local full_url="${base_url}${url}"
    
    local response
    response=$(curl -s -X POST -H "Content-Type: $content_type" -d "$data" "$full_url")
    
    handle_response "$response" "create"
}

# Update metadata object from stdin
update_object() {
    local type="$1"
    local name="$2"
    
    require_args 2 $# "./monk meta update <type> <name>"
    validate_type "$type"
    
    # Always read data from stdin
    local data
    data=$(cat)
    if [ -z "$data" ]; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_error "No data received from stdin" >&2
        fi
        exit 1
    fi
    
    # Always use YAML content type for schema definitions
    local content_type="application/yaml"
    
    local url="/api/meta/$type/$name"
    local base_url=$(get_base_url)
    local full_url="${base_url}${url}"
    
    local response
    response=$(curl -s -X PUT -H "Content-Type: $content_type" -d "$data" "$full_url")
    
    handle_response "$response" "update"
}

# Delete metadata object
delete_object() {
    local type="$1"
    local name="$2"
    
    require_args 2 $# "./monk meta delete <type> <name>"
    validate_type "$type"
    
    # Only show confirmation in verbose mode
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_warning "Are you sure you want to delete $type: $name? (y/N)" >&2
        read -r confirmation
        
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            print_info "Operation cancelled" >&2
            exit 0
        fi
    fi
    
    local url="/api/meta/$type/$name"
    
    local response=$(make_request "DELETE" "$url")
    handle_response "$response" "delete"
}

# Main command dispatcher with flexible flag positioning
main() {
    # Extract flags from anywhere in the arguments and rebuild command args
    local args=()
    local i=1
    
    while [ $i -le $# ]; do
        local arg="${!i}"
        
        case "$arg" in
            -e)
                i=$((i + 1))
                export CLI_EXTRACT_FIELD="${!i}"
                ;;
            -f)
                i=$((i + 1))
                export CLI_EXTRACT_FIELD="${!i}"
                ;;
            -x)
                export CLI_EXIT_CODE_ONLY=true
                ;;
            -c)
                export CLI_COUNT_MODE=true
                ;;
            -u)
                i=$((i + 1))
                export CLI_BASE_URL="${!i}"
                ;;
            -v)
                export CLI_VERBOSE=true
                ;;
            -h)
                show_usage
                exit 0
                ;;
            -*)
                echo "Invalid option: $arg" >&2
                show_usage
                exit 1
                ;;
            *)
                args+=("$arg")
                ;;
        esac
        i=$((i + 1))
    done
    
    # Set positional parameters to the remaining command arguments
    set -- "${args[@]}"
    
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi
    
    local operation="$1"
    shift
    
    # Verbose logging
    log_verbose "Operation: $operation, Args: $*"
    
    case "$operation" in
        list)
            list_objects "$@"
            ;;
        get)
            get_object "$@"
            ;;
        create)
            create_object "$@"
            ;;
        update)
            update_object "$@"
            ;;
        delete)
            delete_object "$@"
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown operation: $operation"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"