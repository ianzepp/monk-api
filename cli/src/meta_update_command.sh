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

# Read YAML/JSON data from stdin
data=$(cat)

if [ -z "$data" ]; then
    print_error "No YAML/JSON data provided on stdin"
    print_info "Usage: cat schema.yaml | monk meta update schema <name>"
    exit 1
fi

if [ "$CLI_VERBOSE" = "true" ]; then
    print_info "Updating $type '$name' with data:"
    echo "$data" | sed 's/^/  /'
fi

response=$(make_request_yaml "PUT" "/api/meta/$type/$name" "$data")
handle_response_yaml "$response" "update"