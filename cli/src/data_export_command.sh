# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"
directory="${args[dir]}"

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
response=$(make_request_json "GET" "/api/data/$schema" "")

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