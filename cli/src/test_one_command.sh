# Check dependencies
check_dependencies

# Get arguments from bashly
test_file="${args[test_file]}"

# Get test directory
TEST_BASE_DIR="../tests"

if [ ! -d "$TEST_BASE_DIR" ]; then
    print_error "Test directory not found: $TEST_BASE_DIR"
    print_info "Run from monk-api project directory"
    exit 1
fi

# Find the test file
test_path=""

# Check if it's already a full path
if [ -f "$test_file" ] && [ -x "$test_file" ]; then
    test_path="$test_file"
elif [ -f "$test_file.sh" ] && [ -x "$test_file.sh" ]; then
    test_path="$test_file.sh"
else
    # Search in test directories
    if echo "$test_file" | grep -q '\.sh$'; then
        # Already has .sh extension
        search_name="$test_file"
    else
        # Add .sh extension
        search_name="$test_file.sh"
    fi
    
    # Find the test file in test directories
    found_file=$(find "$TEST_BASE_DIR" -name "$search_name" -type f | head -1)
    
    if [ -n "$found_file" ] && [ -x "$found_file" ]; then
        test_path="$found_file"
    else
        print_error "Test file not found: $test_file"
        print_info "Searched for: $search_name"
        print_info "In directory: $TEST_BASE_DIR"
        print_info ""
        print_info "Available tests:"
        find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r file; do
            if [ -x "$file" ]; then
                echo "  $(basename "$file" .sh)"
            fi
        done | head -10
        exit 1
    fi
fi

# Run the test
test_name=$(basename "$test_path" .sh)
test_dir=$(dirname "$test_path")

print_info "Running single test: $test_name"
echo

if [ ! -x "$test_path" ]; then
    print_error "$test_name (not executable)"
    exit 1
fi

# Change to test directory and run the test
start_time=$(date +%s)

if [ "$CLI_VERBOSE" = "true" ]; then
    # Show output in verbose mode
    (cd "$test_dir" && "./$(basename "$test_path")")
    test_result=$?
else
    # Capture output and show it regardless (since it's a single test)
    echo "Test output:"
    (cd "$test_dir" && "./$(basename "$test_path")") || test_result=$?
fi

end_time=$(date +%s)
duration=$((end_time - start_time))

echo
if [ "${test_result:-0}" -eq 0 ]; then
    print_success "$test_name completed successfully (${duration}s)"
else
    print_error "$test_name failed (${duration}s)"
    exit 1
fi