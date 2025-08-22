# Check dependencies
check_dependencies

# Get arguments from bashly
type="${args[type]}"
name="${args[name]}"

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
    print_warning "Are you sure you want to delete $type '$name'? (y/N)" >&2
    read -r confirmation
    
    if ! echo "$confirmation" | grep -E "^[Yy]$" >/dev/null 2>&1; then
        print_info "Operation cancelled" >&2
        exit 0
    fi
fi

response=$(make_request_yaml "DELETE" "/api/meta/$type/$name" "")
handle_response_yaml "$response" "delete"