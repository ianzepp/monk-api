#!/bin/bash
# ls command implementation for monk sh

# ls command implementation
sh_ls() {
    local args=("$@")
    local show_details=false
    local path="$CURRENT_DIR"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -l|--long)
                show_details=true
                shift
                ;;
            -h|--help)
                show_ls_help
                return 0
                ;;
            -*)
                print_error "Unknown option: $1"
                return 1
                ;;
            *)
                # Path argument
                path=$(resolve_path "$1")
                shift
                ;;
        esac
    done
    
    # Validate path
    if ! validate_path "$path"; then
        print_error "Invalid path: $path"
        return 1
    fi
    
    # Get path type and handle accordingly
    local path_type=$(get_path_type "$path")
    
    case "$path_type" in
        "root")
            ls_root "$show_details"
            ;;
        "data_root")
            ls_data_root "$show_details"
            ;;
        "data_schema")
            ls_data_schema "$path" "$show_details"
            ;;
        "meta_root")
            ls_meta_root "$show_details"
            ;;
        "meta_schema_root")
            ls_meta_schema_root "$show_details"
            ;;
        "meta_schema")
            ls_meta_schema "$path" "$show_details"
            ;;
        *)
            print_error "Cannot list: $path"
            return 1
            ;;
    esac
}

# List root directory
ls_root() {
    local show_details="$1"
    
    if [[ "$show_details" == "true" ]]; then
        echo "drwxr-xr-x   -   -   -   data/"
        echo "drwxr-xr-x   -   -   -   meta/"
    else
        echo "data/"
        echo "meta/"
    fi
}

# List data root (all schemas)
ls_data_root() {
    local show_details="$1"
    
    print_info "Fetching available schemas..."
    
    # Try to get schemas from monk CLI
    if check_monk_auth; then
        local schemas
        if schemas=$(call_monk meta list schema 2>/dev/null); then
            if [[ -n "$schemas" ]]; then
                echo "$schemas" | while read -r schema; do
                    if [[ -n "$schema" ]]; then
                        if [[ "$show_details" == "true" ]]; then
                            echo "drwxr-xr-x   -   -   -   $schema/"
                        else
                            echo "$schema/"
                        fi
                    fi
                done
            else
                print_warning "No schemas found"
            fi
        else
            print_warning "Could not fetch schemas"
            # Fallback to mock data
            ls_data_root_fallback "$show_details"
        fi
    else
        # Not authenticated, show fallback
        ls_data_root_fallback "$show_details"
    fi
}

# Fallback listing for data root when not authenticated
ls_data_root_fallback() {
    local show_details="$1"
    
    if [[ "$show_details" == "true" ]]; then
        echo "drwxr-xr-x   -   -   -   users/"
        echo "drwxr-xr-x   -   -   -   tasks/"
    else
        echo "users/"
        echo "tasks/"
    fi
}

# List records in a data schema
ls_data_schema() {
    local path="$1"
    local show_details="$2"
    local schema=$(get_schema_from_path "$path")
    
    if [[ -z "$schema" ]]; then
        print_error "Could not determine schema from path: $path"
        return 1
    fi
    
    print_info "Fetching records from schema: $schema"
    
    # Try to get records from monk CLI
    if check_monk_auth; then
        local records
        if records=$(call_monk data list "$schema" 2>/dev/null); then
            if [[ -n "$records" ]]; then
                # Parse JSON and extract IDs
                echo "$records" | jq -r '.[] | .id' 2>/dev/null | while read -r record_id; do
                    if [[ -n "$record_id" && "$record_id" != "null" ]]; then
                        if [[ "$show_details" == "true" ]]; then
                            echo "-rw-r--r--   -   -   -   $record_id"
                        else
                            echo "$record_id"
                        fi
                    fi
                done
            else
                print_warning "No records found in schema: $schema"
            fi
        else
            print_warning "Could not fetch records from schema: $schema"
        fi
    else
        print_warning "Authentication required to list records"
    fi
}

# List meta root
ls_meta_root() {
    local show_details="$1"
    
    if [[ "$show_details" == "true" ]]; then
        echo "drwxr-xr-x   -   -   -   schema/"
    else
        echo "schema/"
    fi
}

# List meta schema root (all schema definitions)
ls_meta_schema_root() {
    local show_details="$1"
    
    print_info "Fetching available schema definitions..."
    
    # Try to get schemas from monk CLI
    if check_monk_auth; then
        local schemas
        if schemas=$(call_monk meta list schema 2>/dev/null); then
            if [[ -n "$schemas" ]]; then
                echo "$schemas" | while read -r schema; do
                    if [[ -n "$schema" ]]; then
                        if [[ "$show_details" == "true" ]]; then
                            echo "-rw-r--r--   -   -   -   $schema"
                        else
                            echo "$schema"
                        fi
                    fi
                done
            else
                print_warning "No schema definitions found"
            fi
        else
            print_warning "Could not fetch schema definitions"
        fi
    else
        print_warning "Authentication required to list schema definitions"
    fi
}

# List specific meta schema (not applicable, schemas are files)
ls_meta_schema() {
    local path="$1"
    local show_details="$2"
    
    print_error "Cannot list: $path (schemas are files, not directories)"
    return 1
}

# Show help for ls command
show_ls_help() {
    echo "Usage: ls [options] [path]"
    echo
    echo "List directory contents"
    echo
    echo "Options:"
    echo "  -l, --long     Show detailed listing"
    echo "  -h, --help     Show this help"
    echo
    echo "Examples:"
    echo "  ls             List current directory"
    echo "  ls /data       List all schemas"
    echo "  ls /data/users List all user records"
    echo "  ls -l /meta    Show detailed meta listing"
}