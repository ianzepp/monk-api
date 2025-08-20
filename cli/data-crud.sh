#!/bin/bash
set -e

# Data CRUD Operations - Core create, read, update, delete operations

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions and argument helpers
source "$SCRIPT_DIR/common.sh"
source "$SCRIPT_DIR/args-helper.sh"

# Check dependencies
check_dependencies

# Validate schema exists (best effort)
validate_schema() {
    local schema="$1"
    
    # Don't validate if running in non-verbose mode for speed
    if [ "$CLI_VERBOSE" != "true" ]; then
        return 0
    fi
    
    # Try to get schema info - if it fails, just warn but continue
    local response
    if response=$(make_request "GET" "/api/meta/schema" "" 2>/dev/null); then
        if echo "$response" | grep -q "\"$schema\""; then
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Schema validated: $schema"
            fi
        else
            print_warning "Schema '$schema' not found in meta API, but continuing anyway"
        fi
    else
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "Could not validate schema dynamically, assuming valid: $schema"
        fi
    fi
}

# List all records for a schema
list_records() {
    local schema="$1"
    
    validate_schema "$schema"
    
    local response
    response=$(make_request "GET" "/api/data/$schema" "")
    handle_response "$response" "list"
}

# Get a specific record
get_record() {
    local schema="$1"
    local id="$2"
    
    validate_schema "$schema"
    
    local response
    response=$(make_request "GET" "/api/data/$schema/$id" "")
    handle_response "$response" "get"
}

# Create a new record from stdin
create_record() {
    local schema="$1"
    
    validate_schema "$schema"
    
    # Read JSON data from stdin
    local json_data
    json_data=$(cat)
    
    if [ -z "$json_data" ]; then
        print_error "No JSON data provided on stdin"
        exit 1
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Creating $schema record with data:"
        echo "$json_data" | sed 's/^/  /'
    fi
    
    local response
    response=$(make_request "POST" "/api/data/$schema" "$json_data")
    handle_response "$response" "create"
}

# Update an existing record from stdin
update_record() {
    local schema="$1"
    local id="$2"
    
    validate_schema "$schema"
    
    # Read JSON data from stdin
    local json_data
    json_data=$(cat)
    
    if [ -z "$json_data" ]; then
        print_error "No JSON data provided on stdin"
        exit 1
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Updating $schema record $id with data:"
        echo "$json_data" | sed 's/^/  /'
    fi
    
    local response
    response=$(make_request "PUT" "/api/data/$schema/$id" "$json_data")
    handle_response "$response" "update"
}

# Delete a record
delete_record() {
    local schema="$1"
    local id="$2"
    
    validate_schema "$schema"
    
    # Confirmation prompt in verbose mode
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_warning "Are you sure you want to delete $schema record: $id? (y/N)" >&2
        read -r confirmation
        
        if ! echo "$confirmation" | grep -E "^[Yy]$" >/dev/null 2>&1; then
            print_info "Operation cancelled" >&2
            exit 0
        fi
    fi
    
    local response
    response=$(make_request "DELETE" "/api/data/$schema/$id" "")
    handle_response "$response" "delete"
}

# Handle CRUD operations
handle_crud_operation() {
    local operation="$1"
    local schema="$2"
    local id="$3"
    
    case "$operation" in
        list)
            if [ -z "$schema" ]; then
                print_error "Schema required for list operation"
                print_info "Usage: monk data list <schema>"
                exit 1
            fi
            list_records "$schema"
            ;;
        get)
            if [ -z "$schema" ] || [ -z "$id" ]; then
                print_error "Schema and ID required for get operation"
                print_info "Usage: monk data get <schema> <id>"
                exit 1
            fi
            get_record "$schema" "$id"
            ;;
        create)
            if [ -z "$schema" ]; then
                print_error "Schema required for create operation"
                print_info "Usage: echo '{\"data\":\"here\"}' | monk data create <schema>"
                exit 1
            fi
            create_record "$schema"
            ;;
        update)
            if [ -z "$schema" ] || [ -z "$id" ]; then
                print_error "Schema and ID required for update operation"
                print_info "Usage: echo '{\"data\":\"here\"}' | monk data update <schema> <id>"
                exit 1
            fi
            update_record "$schema" "$id"
            ;;
        delete)
            if [ -z "$schema" ] || [ -z "$id" ]; then
                print_error "Schema and ID required for delete operation"
                print_info "Usage: monk data delete <schema> <id>"
                exit 1
            fi
            delete_record "$schema" "$id"
            ;;
        *)
            print_error "Unknown CRUD operation: $operation"
            print_info "Available operations: list, get, create, update, delete"
            exit 1
            ;;
    esac
}

# Main entry point for standalone use
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    handle_crud_operation "$@"
fi