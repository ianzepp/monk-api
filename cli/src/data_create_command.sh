# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"

validate_schema "$schema"

# Read JSON data from stdin
json_data=$(cat)

if [ -z "$json_data" ]; then
    print_error "No JSON data provided on stdin"
    exit 1
fi

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Creating $schema record with data:"
    echo "$json_data" | sed 's/^/  /'
fi

# POST /api/data/:schema expects an array, so wrap single object in array
array_data="[$json_data]"

response=$(make_request_json "POST" "/api/data/$schema" "$array_data")

# Extract single object from array response to match input format
if [ "$JSON_PARSER" = "jq" ]; then
    # Extract first item from array response for single-object input
    single_response=$(echo "$response" | jq '{"success": .success, "data": .data[0], "error": .error, "error_code": .error_code}' 2>/dev/null || echo "$response")
    handle_response_json "$single_response" "create"
else
    handle_response_json "$response" "create"
fi