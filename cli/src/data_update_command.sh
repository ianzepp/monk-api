# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"
id="${args[id]}"

validate_schema "$schema"

# Read JSON data from stdin
json_data=$(cat)

if [ -z "$json_data" ]; then
    print_error "No JSON data provided on stdin"
    exit 1
fi

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Updating $schema record $id with data:"
    echo "$json_data" | sed 's/^/  /'
fi

response=$(make_request_json "PUT" "/api/data/$schema/$id" "$json_data")
handle_response_json "$response" "update"