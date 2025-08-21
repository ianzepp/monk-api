#!/bin/bash
# cat command implementation for monk sh

# cat command implementation
sh_cat() {
    local args=("$@")
    local target=""
    local raw_output=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -r|--raw)
                raw_output=true
                shift
                ;;
            -h|--help)
                show_cat_help
                return 0
                ;;
            -*)
                print_error "Unknown option: $1"
                return 1
                ;;
            *)
                if [[ -z "$target" ]]; then
                    target="$1"
                else
                    print_error "Too many arguments"
                    return 1
                fi
                shift
                ;;
        esac
    done
    
    # Check if target is provided
    if [[ -z "$target" ]]; then
        print_error "cat: missing file argument"
        show_cat_help
        return 1
    fi
    
    # Handle special cases
    case "$target" in
        ".")
            cat_current_directory
            return $?
            ;;
        "..")
            print_error "cat: cannot display parent directory"
            return 1
            ;;
    esac
    
    # Determine full path
    local full_path
    if [[ "$target" == "/"* ]]; then
        # Absolute path
        full_path="$target"
    else
        # Relative path - combine with current directory
        if [[ "$CURRENT_DIR" == "/" ]]; then
            full_path="/$target"
        else
            full_path="$CURRENT_DIR/$target"
        fi
    fi
    
    # Normalize path
    full_path=$(normalize_path "$full_path")
    
    # Validate path
    if ! validate_path "$full_path"; then
        print_error "Invalid path: $full_path"
        return 1
    fi
    
    # Get path type and handle accordingly
    local path_type=$(get_path_type "$full_path")
    
    case "$path_type" in
        "data_schema")
            cat_data_record "$full_path" "$raw_output"
            ;;
        "meta_schema")
            cat_meta_schema "$full_path" "$raw_output"
            ;;
        *)
            print_error "Cannot display: $full_path (not a file)"
            return 1
            ;;
    esac
}

# Display current directory contents (like ls)
cat_current_directory() {
    print_info "Displaying contents of current directory: $CURRENT_DIR"
    
    # Load and call ls command
    if load_command "ls"; then
        sh_ls
    else
        print_error "Could not load ls command"
        return 1
    fi
}

# Display a data record
cat_data_record() {
    local full_path="$1"
    local raw_output="$2"
    
    # Extract schema and record ID
    local path_without_data="${full_path#/data/}"
    local schema="${path_without_data%%/*}"
    local record_id="${path_without_data#*/}"
    
    # Handle case where we're trying to cat a schema directory
    if [[ "$record_id" == "$schema" || -z "$record_id" ]]; then
        print_error "cat: $full_path is a directory"
        return 1
    fi
    
    print_info "Fetching record: $record_id from schema: $schema"
    
    # Check authentication
    if ! check_monk_auth; then
        print_error "Authentication required to view records"
        return 1
    fi
    
    # Fetch record using monk CLI
    local record_data
    if record_data=$(call_monk data get "$schema" "$record_id" 2>/dev/null); then
        if [[ "$raw_output" == "true" ]]; then
            echo "$record_data"
        else
            echo "$record_data" | format_json
        fi
    else
        print_error "Could not fetch record: $record_id from schema: $schema"
        return 1
    fi
}

# Display a meta schema definition
cat_meta_schema() {
    local full_path="$1"
    local raw_output="$2"
    
    # Extract schema name
    local schema_name="${full_path#/meta/schema/}"
    
    # Handle case where we're trying to cat the schema directory
    if [[ -z "$schema_name" || "$schema_name" == "schema" ]]; then
        print_error "cat: $full_path is a directory"
        return 1
    fi
    
    print_info "Fetching schema definition: $schema_name"
    
    # Check authentication
    if ! check_monk_auth; then
        print_error "Authentication required to view schema definitions"
        return 1
    fi
    
    # Fetch schema using monk CLI
    local schema_data
    if schema_data=$(call_monk meta get schema "$schema_name" 2>/dev/null); then
        if [[ "$raw_output" == "true" ]]; then
            echo "$schema_data"
        else
            echo "$schema_data" | format_yaml
        fi
    else
        print_error "Could not fetch schema definition: $schema_name"
        return 1
    fi
}

# Show help for cat command
show_cat_help() {
    echo "Usage: cat [options] <file>"
    echo
    echo "Display file contents"
    echo
    echo "Options:"
    echo "  -r, --raw      Show raw output without formatting"
    echo "  -h, --help     Show this help"
    echo
    echo "Arguments:"
    echo "  file           File to display"
    echo "  .              Display current directory contents"
    echo
    echo "Examples:"
    echo "  cat 1234                   Display record 1234 (JSON)"
    echo "  cat /data/users/1234       Display user record 1234"
    echo "  cat /meta/schema/users     Display users schema (YAML)"
    echo "  cat .                      Display current directory"
    echo "  cat -r 1234                Display record without JSON formatting"
}