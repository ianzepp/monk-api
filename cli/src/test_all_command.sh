# Check dependencies
check_dependencies

# Get arguments from bashly
pattern="${args[pattern]}"

# Set verbose mode if needed
if [ "$CLI_VERBOSE" = "true" ]; then
    export CLI_VERBOSE=true
fi

# Get test directory (simplified - use current project tests)
TEST_BASE_DIR="../tests"

if [ ! -d "$TEST_BASE_DIR" ]; then
    print_error "Test directory not found: $TEST_BASE_DIR"
    print_info "Run from monk-api project directory or set up test environment"
    exit 1
fi

print_info "Running Tests"
echo

# Function to find tests by pattern
find_tests_by_pattern() {
    local pattern="$1"
    
    if [ -z "$pattern" ]; then
        # No pattern - find all tests
        find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r file; do
            if [ -x "$file" ]; then
                echo "$file"
            fi
        done | sort
        return
    fi
    
    # Check if pattern is a number range (e.g., "00", "00-49")
    if echo "$pattern" | grep -E '^[0-9]{2}(-[0-9]{2})?$' >/dev/null 2>&1; then
        # Extract start and end numbers
        if echo "$pattern" | grep -q '-'; then
            start_num=$(echo "$pattern" | cut -d'-' -f1)
            end_num=$(echo "$pattern" | cut -d'-' -f2)
        else
            start_num="$pattern"
            end_num="$pattern"
        fi
        
        # Find tests in numeric range
        for dir in "$TEST_BASE_DIR"/*; do
            if [ -d "$dir" ]; then
                dir_name=$(basename "$dir")
                dir_num=$(echo "$dir_name" | grep -o '^[0-9][0-9]' | head -1)
                
                if [ -n "$dir_num" ] && [ "$dir_num" -ge "$start_num" ] && [ "$dir_num" -le "$end_num" ]; then
                    find "$dir" -name "*.sh" -type f | while read -r file; do
                        if [ -x "$file" ]; then
                            echo "$file"
                        fi
                    done | sort
                fi
            fi
        done
    else
        # Text pattern - search in paths and filenames
        find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r file; do
            if [ -x "$file" ] && echo "$file" | grep -q "$pattern"; then
                echo "$file"
            fi
        done | sort
    fi
}

# Run a single test
run_single_test() {
    local test_path="$1"
    local test_name=$(basename "$test_path" .sh)
    local test_dir=$(dirname "$test_path")
    
    print_info "Running: $test_name"
    
    if [ ! -x "$test_path" ]; then
        print_error "$test_name (not executable)"
        return 1
    fi
    
    # Change to test directory and run the test
    start_time=$(date +%s)
    test_result=0
    
    if [ "$CLI_VERBOSE" = "true" ]; then
        # Show output in verbose mode
        (cd "$test_dir" && "./$(basename "$test_path")")
        test_result=$?
    else
        # Capture output and only show if test fails
        if test_output=$(cd "$test_dir" && "./$(basename "$test_path")" 2>&1); then
            test_result=0
        else
            test_result=$?
        fi
    fi
    
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    if [ $test_result -eq 0 ]; then
        print_success "$test_name (${duration}s)"
        return 0
    else
        print_error "$test_name (${duration}s)"
        if [ "$CLI_VERBOSE" != "true" ] && [ -n "$test_output" ]; then
            echo "Test output:"
            echo "$test_output" | sed 's/^/  /'
        fi
        return 1
    fi
}

# Main test execution
tests_run=0
tests_passed=0
tests_failed=0
failed_tests=()

# Get tests to run
if [ -n "$pattern" ]; then
    print_info "Running tests matching pattern: $pattern"
else
    print_info "Running all tests"
fi

test_files=$(find_tests_by_pattern "$pattern")

if [ -z "$test_files" ]; then
    print_error "No tests found"
    if [ -n "$pattern" ]; then
        print_info "Pattern: $pattern"
    fi
    exit 1
fi

test_count=$(echo "$test_files" | wc -l | xargs)
echo "Found $test_count test(s)"
echo

# Run each test
echo "$test_files" | while IFS= read -r test_path; do
    if [ -n "$test_path" ]; then
        run_single_test "$test_path"
    fi
done