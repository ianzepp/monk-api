#!/bin/bash
set -e

# Data Import/Export Operations - Bulk file operations

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

# Export all records to directory as individual JSON files
export_records() {
    local schema="$1"
    local directory="$2"
    
    if [ -z "$schema" ] || [ -z "$directory" ]; then
        print_error "Schema and directory required for export operation"
        print_info "Usage: monk data export <schema> <directory>"
        exit 1
    fi
    
    validate_schema "$schema"
    
    # Create directory if it doesn't exist
    if [ ! -d "$directory" ]; then
        if [ "$CLI_VERBOSE" = "true" ]; then
            print_info "Creating directory: $directory"
        fi
        mkdir -p "$directory"
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Exporting $schema records to: $directory"
    fi
    
    # Get all records using the API
    local response
    response=$(make_request "GET" "/api/data/$schema" "")
    
    # Use python3 to parse JSON and export individual files
    if command -v python3 >/dev/null 2>&1; then
        echo "$response" | python3 -c "
import sys, json, os
try:
    data = json.load(sys.stdin)
    if data.get('success') and 'data' in data:
        records = data['data']
        count = 0
        for record in records:
            if 'id' in record:
                filename = os.path.join('$directory', record['id'] + '.json')
                with open(filename, 'w') as f:
                    json.dump(record, f, indent=4)
                count += 1
                if '$CLI_VERBOSE' == 'true':
                    print(f'Exported: {filename}')
            else:
                print('Warning: Record missing id field', file=sys.stderr)
        print(f'Successfully exported {count} records to $directory')
    else:
        print('Error: Invalid API response format', file=sys.stderr)
        print(f'Response: {data}', file=sys.stderr)
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
        print_info "Please install Python 3 to use export operations"
        exit 1
    fi
}

# Import JSON files from directory
import_records() {
    local schema="$1" 
    local directory="$2"
    
    if [ -z "$schema" ] || [ -z "$directory" ]; then
        print_error "Schema and directory required for import operation"
        print_info "Usage: monk data import <schema> <directory>"
        exit 1
    fi
    
    validate_schema "$schema"
    
    if [ ! -d "$directory" ]; then
        print_error "Directory does not exist: $directory"
        exit 1
    fi
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Importing $schema records from: $directory"
    fi
    
    # Collect all JSON files into an array for bulk import
    if command -v python3 >/dev/null 2>&1; then
        local records_json
        records_json=$(python3 -c "
import sys, json, os, glob
records = []
json_files = glob.glob(os.path.join('$directory', '*.json'))

if not json_files:
    print('No .json files found in $directory', file=sys.stderr)
    sys.exit(1)

for filepath in sorted(json_files):
    filename = os.path.basename(filepath)
    try:
        with open(filepath, 'r') as f:
            record = json.load(f)
        records.append(record)
        if '$CLI_VERBOSE' == 'true':
            print(f'Loaded: {filename}', file=sys.stderr)
    except Exception as e:
        print(f'Error loading {filename}: {e}', file=sys.stderr)
        sys.exit(1)

if '$CLI_VERBOSE' == 'true':
    print(f'Prepared {len(records)} records for import', file=sys.stderr)
json.dump(records, sys.stdout)
")
        
        if [ -n "$records_json" ]; then
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Making bulk import request..."
            fi
            
            local response
            response=$(make_request "PUT" "/api/data/$schema" "$records_json")
            
            print_success "Import completed successfully"
            handle_response "$response" "import"
        else
            print_error "Failed to prepare records for import"
            exit 1
        fi
    else
        print_error "Python3 required for import functionality"
        print_info "Please install Python 3 to use import operations"
        exit 1
    fi
}

# Handle import/export operations
handle_import_export_operation() {
    local operation="$1"
    local schema="$2"
    local directory="$3"
    
    case "$operation" in
        export)
            export_records "$schema" "$directory"
            ;;
        import)
            import_records "$schema" "$directory"
            ;;
        *)
            print_error "Unknown import/export operation: $operation"
            print_info "Available operations: export, import"
            exit 1
            ;;
    esac
}

# Main entry point for standalone use
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    handle_import_export_operation "$@"
fi