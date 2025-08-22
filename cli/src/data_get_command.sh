# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"
id="${args[id]}"

validate_schema "$schema"

response=$(make_request_json "GET" "/api/data/$schema/$id" "")
handle_response_json "$response" "get"