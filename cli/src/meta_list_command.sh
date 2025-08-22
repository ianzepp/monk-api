# Check dependencies
check_dependencies

# Get arguments from bashly
type="${args[type]}"

# Validate metadata type (currently only schema supported)
case "$type" in
    schema)
        # Valid type
        ;;
    *)
        print_error "Unsupported metadata type: $type"
        print_info "Currently supported types: schema"
        exit 1
        ;;
esac

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Listing all $type objects"
fi

response=$(make_request_json "GET" "/api/meta/$type" "")
handle_response_json "$response" "list"