# Check dependencies
check_dependencies

# Get arguments from bashly
schema="${args[schema]}"
id="${args[id]}"

validate_schema "$schema"

# Confirmation prompt in verbose mode
if [ "$CLI_VERBOSE" = "true" ]; then
    print_warning "Are you sure you want to delete $schema record: $id? (y/N)" >&2
    read -r confirmation
    
    if ! echo "$confirmation" | grep -E "^[Yy]$" >/dev/null 2>&1; then
        print_info "Operation cancelled" >&2
        exit 0
    fi
fi

response=$(make_request_json "DELETE" "/api/data/$schema/$id" "")
handle_response_json "$response" "delete"