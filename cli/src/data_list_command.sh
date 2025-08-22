# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"

validate_schema "$schema"

response=$(make_request "GET" "/api/data/$schema" "")
handle_response "$response" "list"