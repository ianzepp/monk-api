# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"
id="${args[id]}"

validate_schema "$schema"

response=$(make_request "GET" "/api/data/$schema/$id" "")
handle_response "$response" "get"