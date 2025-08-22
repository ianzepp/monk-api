#!/bin/bash
set -e

# Meta Schema Operations - Schema definition management

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions and argument helpers
source "$SCRIPT_DIR/common.sh"
source "$SCRIPT_DIR/args-helper.sh"

# Check dependencies
check_dependencies

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${BLUE}$1${NC}"; }
print_success() { echo -e "${GREEN}$1${NC}"; }
print_error() { echo -e "${RED}$1${NC}"; }
print_warning() { echo -e "${YELLOW}$1${NC}"; }

# Validate metadata type (currently only schema supported)
validate_type() {
    local type="$1"
    
    case "$type" in
        schema)
            return 0
            ;;
        *)
            print_error "Unsupported metadata type: $type"
            print_info "Currently supported types: schema"
            exit 1
            ;;
    esac
}

# List all metadata objects of specified type
list_objects() {
    local type="$1"
    
    validate_type "$type"
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Listing all $type objects"
    fi
    
    local response
    response=$(make_request "GET" "/api/meta/$type" "")
    handle_response "$response" "list"
}

# Get a specific metadata object
get_object() {
    local type="$1"
    local name="$2"
    
    validate_type "$type"
    
    if [ -z "$name" ]; then
        print_error "Object name required"
        print_info "Usage: monk meta get $type <name>"
        exit 1
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Getting $type object: $name"
    fi
    
    local response
    response=$(make_request "GET" "/api/meta/$type/$name" "")
    handle_response "$response" "get"
}

# Create a new metadata object from stdin
create_object() {
    local type="$1"
    
    validate_type "$type"
    
    # Read YAML/JSON data from stdin
    local data
    data=$(cat)
    
    if [ -z "$data" ]; then
        print_error "No YAML/JSON data provided on stdin"
        print_info "Usage: cat schema.yaml | monk meta create $type"
        exit 1
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Creating $type object with data:"
        echo "$data" | sed 's/^/  /'
    fi
    
    local response
    response=$(make_request "POST" "/api/meta/$type" "$data")
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_success "$type object created successfully"
    fi
    
    handle_response "$response" "create"
}

# Update an existing metadata object from stdin
update_object() {
    local type="$1"
    local name="$2"
    
    validate_type "$type"
    
    if [ -z "$name" ]; then
        print_error "Object name required"
        print_info "Usage: cat updated-schema.yaml | monk meta update $type <name>"
        exit 1
    fi
    
    # Read YAML/JSON data from stdin
    local data
    data=$(cat)
    
    if [ -z "$data" ]; then
        print_error "No YAML/JSON data provided on stdin"
        print_info "Usage: cat updated-schema.yaml | monk meta update $type $name"
        exit 1
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Updating $type object: $name"
        echo "$data" | sed 's/^/  /'
    fi
    
    local response
    response=$(make_request "PUT" "/api/meta/$type/$name" "$data")
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_success "$type object updated successfully"
    fi
    
    handle_response "$response" "update"
}

# Delete a metadata object
delete_object() {
    local type="$1"
    local name="$2"
    
    validate_type "$type"
    
    if [ -z "$name" ]; then
        print_error "Object name required"
        print_info "Usage: monk meta delete $type <name>"
        exit 1
    fi
    
    # Confirmation prompt in verbose mode
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_warning "Are you sure you want to delete $type: $name? (y/N)" >&2
        read -r confirmation
        
        if ! echo "$confirmation" | grep -E "^[Yy]$" >/dev/null 2>&1; then
            print_info "Operation cancelled" >&2
            exit 0
        fi
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Deleting $type object: $name"
    fi
    
    local response
    response=$(make_request "DELETE" "/api/meta/$type/$name" "")
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_success "$type object deleted successfully"
    fi
    
    handle_response "$response" "delete"
}

# Handle schema operations
handle_schema_operation() {
    local operation="$1"
    local type="$2"
    local name="$3"
    
    # Validate type is provided
    if [ -z "$type" ]; then
        print_error "Metadata type required"
        print_info "Usage: monk meta $operation <type> [args...]"
        print_info "Available types: schema"
        exit 1
    fi
    
    case "$operation" in
        list)
            list_objects "$type"
            ;;
        get)
            get_object "$type" "$name"
            ;;
        create)
            create_object "$type"
            ;;
        update)
            update_object "$type" "$name"
            ;;
        delete)
            delete_object "$type" "$name"
            ;;
        *)
            print_error "Unknown schema operation: $operation"
            print_info "Available operations: list, get, create, update, delete"
            exit 1
            ;;
    esac
}

# Main entry point for standalone use
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    handle_schema_operation "$@"
fi