# Check dependencies
check_dependencies

# Get arguments from bashly
test_file="${args[test_file]}"

# Find the monk-api project directory
api_dir=""
if [ -f "../package.json" ] && [ -d "../tests" ]; then
    api_dir=".."
elif [ -f "./package.json" ] && [ -d "./tests" ]; then
    api_dir="."
else
    print_error "Cannot locate monk-api project directory"
    print_info "Run from monk-api project or subdirectory"
    exit 1
fi

# Set verbose mode if needed
if [ "$CLI_VERBOSE" = "true" ]; then
    export CLI_VERBOSE=true
fi

# Execute the project's test script
if [ -x "$api_dir/scripts/test-one.sh" ]; then
    exec "$api_dir/scripts/test-one.sh" "$test_file"
else
    print_error "Test script not found: $api_dir/scripts/test-one.sh"
    print_info "Run 'chmod +x scripts/test-one.sh' to make it executable"
    exit 1
fi