#!/bin/bash
set -e

# CLI for /api/data endpoints

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
Usage: ./monk data <operation> <schema> [args...]

Operations:
  list <schema>           List all records for schema (GET /api/data/<schema>)
  get <schema> <id>       Get specific record (GET /api/data/<schema>/<id>)
  create <schema>         Create new record from stdin (POST /api/data/<schema>)
  update <schema> <id>    Update record from stdin (PUT /api/data/<schema>/<id>)
  delete <schema> <id>    Delete record (DELETE /api/data/<schema>/<id>)
  export <schema> <directory>  Export all records to directory as individual JSON files
  import <schema> <directory>  Import JSON files from directory to create new records

Schemas:
  Dynamic - any schema created via ./monk meta create schema

Examples:
  ./monk data list account
  ./monk data get account 123e4567-e89b-12d3-a456-426614174000
  echo '{"name":"John","email":"john@example.com","domain":"demo"}' | ./monk data create account
  ./monk data delete account 123e4567-e89b-12d3-a456-426614174000
  ./monk data export account ./exports/
  ./monk data import account ./imports/
  
  # All data operations read from stdin by default:
  cat data.json | ./monk data create account
  echo '{"name":"Jane Doe"}' | ./monk data update account <id>

Flags (can be positioned anywhere):
  -l LIMIT     Query limit for list operations (default: 50) 
  -u URL       Base URL for API (default: http://localhost:3001)
  -v           Verbose output with human-friendly messages
  -x           Exit code only mode (no JSON output, just exit status)
  -f FIELD     Extract field value from response (e.g., -f id, -f name)
  -c           Count mode (return just count for list operations)
  -h           Show this help

Environment Variables:
  CLI_BASE_URL    Base URL for API (default: http://localhost:3001)
  CLI_LIMIT       Query limit for list operations (default: 50)

Note: For pretty JSON formatting, pipe through jq:
  ./monk data list account | jq .
EOF
}

# Validate schema dynamically by checking with the meta API
validate_schema() {
    local schema="$1"
    local response
    
    # Get list of available schema names using the extract flag  
    local available_schemas
    available_schemas=$(./monk meta list schema -e name 2>/dev/null | xargs)
    
    if [ -n "$available_schemas" ]; then
        # Check if the schema is in the list
        if echo "$available_schemas" | grep -wq "$schema"; then
            return 0
        else
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_error "Invalid schema: $schema" >&2
                print_info "Available schemas: $available_schemas" >&2
            fi
            exit 1
        fi
    fi
    
    # Fallback: assume schema is valid if we can't validate dynamically
    log_verbose "Could not validate schema dynamically, assuming valid: $schema"
    return 0
}

# List all records for a schema
list_records() {
    local schema="$1"
    validate_schema "$schema"
    
    local url="/api/data/$schema"
    local limit=$(get_limit)
    
    local response=$(make_request "GET" "$url")
    handle_response "$response" "list"
}

# Get specific record
get_record() {
    local schema="$1"
    local id="$2"
    
    require_args 2 $# "./monk data get <schema> <id>"
    validate_schema "$schema"
    
    local url="/api/data/$schema/$id"
    
    local response=$(make_request "GET" "$url")
    handle_response "$response" "get"
}

# Create new record from stdin
create_record() {
    local schema="$1"
    
    require_args 1 $# "./monk data create <schema>"
    validate_schema "$schema"
    
    # Always read JSON data from stdin
    local data
    data=$(cat)
    if [ -z "$data" ]; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_error "No data received from stdin" >&2
        fi
        exit 1
    fi
    
    local url="/api/data/$schema"
    
    local response=$(make_request "POST" "$url" "$data")
    handle_response "$response" "create"
}

# Update existing record from stdin
update_record() {
    local schema="$1"
    local id="$2"
    
    require_args 2 $# "./monk data update <schema> <id>"
    validate_schema "$schema"
    
    # Always read JSON data from stdin
    local data
    data=$(cat)
    if [ -z "$data" ]; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_error "No data received from stdin" >&2
        fi
        exit 1
    fi
    
    local url="/api/data/$schema/$id"
    
    local response=$(make_request "PUT" "$url" "$data")
    handle_response "$response" "update"
}

# Delete record
delete_record() {
    local schema="$1"
    local id="$2"
    
    require_args 2 $# "./monk data delete <schema> <id>"
    validate_schema "$schema"
    
    local url="/api/data/$schema/$id"
    
    # Only show confirmation in verbose mode
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_warning "Are you sure you want to delete $schema record: $id? (y/N)" >&2
        read -r confirmation
        
        if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
            print_info "Operation cancelled" >&2
            exit 0
        fi
    fi
    
    local response=$(make_request "DELETE" "$url")
    handle_response "$response" "delete"
}

# Export all records to directory as individual JSON files
export_records() {
    local schema="$1"
    local directory="$2"
    
    require_args 2 $# "./monk data export <schema> <directory>"
    validate_schema "$schema"
    
    # Create directory if it doesn't exist
    if [ ! -d "$directory" ]; then
        log_verbose "Creating directory: $directory"
        mkdir -p "$directory"
    fi
    
    log_verbose "Exporting $schema records to: $directory"
    
    # Get all records using raw curl to avoid colored output
    local url="/api/data/$schema"
    local base_url=$(get_base_url)
    local full_url="${base_url}${url}"
    
    log_verbose "Making direct request to: $full_url"
    local response=$(curl -s "$full_url")
    
    # Use python3 to parse JSON and extract records
    if [ "$JSON_FORMATTER" = "python3" ]; then
        echo "$response" | python3 -c "
import sys, json, os
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data:
        records = data['data']
        for record in records:
            if 'id' in record:
                filename = os.path.join('$directory', record['id'] + '.json')
                with open(filename, 'w') as f:
                    json.dump(record, f, indent=4)
                print(f'Exported: {filename}')
            else:
                print('Warning: Record missing id field', file=sys.stderr)
        print(f'Successfully exported {len(records)} records to $directory')
    else:
        print('Error: Invalid API response format', file=sys.stderr)
        sys.exit(1)
except json.JSONDecodeError as e:
    print(f'Error: Invalid JSON in API response: {e}', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
"
    else
        print_error "Python3 required for export functionality"
        exit 1
    fi
}

# Import JSON files from directory using bulk PUT
import_records() {
    local schema="$1" 
    local directory="$2"
    
    require_args 2 $# "./monk data import <schema> <directory>"
    validate_schema "$schema"
    
    if [ ! -d "$directory" ]; then
        print_error "Directory does not exist: $directory"
        exit 1
    fi
    
    log_verbose "Importing $schema records from: $directory"
    
    # Collect all JSON files into an array for bulk import
    if [ "$JSON_FORMATTER" = "python3" ]; then
        local records_json
        records_json=$(python3 -c "
import sys, json, os, glob
records = []
json_files = glob.glob(os.path.join('$directory', '*.json'))

if not json_files:
    print('No .json files found in $directory', file=sys.stderr)
    sys.exit(1)

for filepath in json_files:
    filename = os.path.basename(filepath)
    try:
        with open(filepath, 'r') as f:
            record = json.load(f)
        records.append(record)
        print(f'Loaded: {filename}', file=sys.stderr)
    except Exception as e:
        print(f'Error loading {filename}: {e}', file=sys.stderr)
        sys.exit(1)

print(f'Prepared {len(records)} records for import', file=sys.stderr)
json.dump(records, sys.stdout)
")
        
        if [ -n "$records_json" ]; then
            log_verbose "Making bulk import request..."
            local url="/api/data/$schema"
            local response=$(make_request "PUT" "$url" "$records_json")
            
            print_success "Import completed successfully"
            format_response "$response" "${CLI_FORMAT:-pretty}"
        else
            print_error "Failed to prepare records for import"
            exit 1
        fi
    else
        print_error "Python3 required for import functionality"
        exit 1
    fi
}

# Main command dispatcher with flexible flag positioning
main() {
    # Extract flags from anywhere in the arguments and rebuild command args
    local args=()
    local i=1
    
    while [ $i -le $# ]; do
        local arg="${!i}"
        
        case "$arg" in
            -l)
                i=$((i + 1))
                export CLI_LIMIT="${!i}"
                ;;
            -u)
                i=$((i + 1))
                export CLI_BASE_URL="${!i}"
                ;;
            -v)
                export CLI_VERBOSE=true
                ;;
            -x)
                export CLI_EXIT_CODE_ONLY=true
                ;;
            -f)
                i=$((i + 1))
                export CLI_EXTRACT_FIELD="${!i}"
                ;;
            -c)
                export CLI_COUNT_MODE=true
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
            list_records "$@"
            ;;
        get)
            get_record "$@"
            ;;
        create)
            create_record "$@"
            ;;
        update)
            update_record "$@"
            ;;
        delete)
            delete_record "$@"
            ;;
        export)
            export_records "$@"
            ;;
        import)
            import_records "$@"
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