# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"

validate_schema "$schema"

response=$(make_request_json "GET" "/api/data/$schema" "")
handle_response_json "$response" "list"