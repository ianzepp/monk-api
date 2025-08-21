#!/bin/bash
set -e

# Test Execution - Run tests with pattern matching

# Load common functions  
source "$(dirname "$0")/common.sh"

# Test configuration - dynamically locate test directory
# Load environment from active checkout
load_active_test_environment() {
    local git_target_dir=$(get_monk_git_target)
    local active_run_file="$git_target_dir/.active-run"
    
    if [ ! -f "$active_run_file" ]; then
        return 1
    fi
    
    local active_run=$(cat "$active_run_file")
    local run_dir="$git_target_dir/$active_run"
    local config_env="$run_dir/.config/monk/test-env"
    
    if [ -f "$config_env" ]; then
        # Source the test environment from the active checkout
        export TEST_RUN_ACTIVE="$active_run"
        
        # Load environment variables from config file
        while IFS= read -r line; do
            if [[ "$line" =~ ^[A-Z_]+=.* ]]; then
                export "$line"
            fi
        done < "$config_env"
        
        return 0
    fi
    
    return 1
}

get_test_base_dir() {
    # Load environment from active checkout
    if load_active_test_environment; then
        local git_target_dir=$(get_monk_git_target)
        local run_dir="$git_target_dir/$TEST_RUN_ACTIVE"
        
        # Check for embedded tests in git checkout
        if [ -d "$run_dir/tests" ]; then
            echo "$run_dir/tests"
            return 0
        fi
    fi
    
    # No active test run - error
    print_error "No active test run found"
    print_info "Use 'monk test git <branch>' to create a test environment first"
    return 1
}

TEST_BASE_DIR=$(get_test_base_dir)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Check if test directory exists
check_test_directory() {
    if [ ! -d "$TEST_BASE_DIR" ]; then
        print_error "Test directory not found: $TEST_BASE_DIR"
        print_info "Make sure you're running this from the monk-cli directory"
        exit 1
    fi
}

# Find all test scripts (portable across Unix/Linux/macOS)
find_all_tests() {
    find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r file; do
        if [ -x "$file" ]; then
            echo "$file"
        fi
    done | sort
}

# Find tests matching a pattern (portable across Unix/Linux/macOS)
find_tests_by_pattern() {
    local pattern="$1"
    local temp_file
    
    # Create temporary file (portable across systems)
    if command -v mktemp >/dev/null 2>&1; then
        temp_file=$(mktemp)
    else
        temp_file="/tmp/monk_test_$$_$(date +%s)"
        touch "$temp_file"
    fi
    
    # Check if pattern is a number range (e.g., "00", "00-49") - portable regex
    if echo "$pattern" | grep -E '^[0-9]{2}(-[0-9]{2})?$' >/dev/null 2>&1; then
        # Extract start and end numbers using portable methods
        local start_num
        local end_num
        
        if echo "$pattern" | grep -q '-'; then
            start_num=$(echo "$pattern" | cut -d'-' -f1)
            end_num=$(echo "$pattern" | cut -d'-' -f2)
        else
            start_num="$pattern"
            end_num="$pattern"
        fi
        
        # Find tests in numeric range using portable approach
        for dir in "$TEST_BASE_DIR"/*; do
            if [ -d "$dir" ]; then
                local dir_name=$(basename "$dir")
                # Extract directory number using portable methods
                local dir_num=$(echo "$dir_name" | grep -o '^[0-9][0-9]' | head -1)
                
                if [ -n "$dir_num" ] && [ "$dir_num" -ge "$start_num" ] && [ "$dir_num" -le "$end_num" ]; then
                    # Find all executable .sh files in this directory (portable)
                    find "$dir" -name "*.sh" -type f | while read -r test_file; do
                        if [ -x "$test_file" ]; then
                            echo "$test_file"
                        fi
                    done >> "$temp_file"
                fi
            fi
        done
    else
        # Wildcard pattern matching (portable using grep)
        find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r test_file; do
            if [ -x "$test_file" ] && echo "$test_file" | grep -q "$pattern"; then
                echo "$test_file"
            fi
        done >> "$temp_file"
    fi
    
    # Sort and output the results
    if [ -s "$temp_file" ]; then
        sort "$temp_file"
    fi
    
    # Clean up
    rm -f "$temp_file"
}

# Run a single test
run_single_test() {
    local test_path="$1"
    local test_name=$(basename "$test_path" .sh)
    local test_dir=$(dirname "$test_path")
    
    print_step "Running: $test_name"
    
    if [ ! -x "$test_path" ]; then
        print_error "$test_name (not executable)"
        return 1
    fi
    
    # Change to test directory and run the test
    local start_time=$(date +%s)
    local test_output
    local test_result=0
    
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
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
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

# Run all tests
run_all_tests() {
    print_header "Running All Tests"
    print_info "Executing complete test suite in numerical order"
    echo
    
    local tests_run=0
    local tests_passed=0
    local tests_failed=0
    local failed_tests=()
    
    # Use the comprehensive test runner from monk-api-test if available
    local comprehensive_runner="$TEST_BASE_DIR/run-all-tests.sh"
    
    if [ -x "$comprehensive_runner" ]; then
        print_info "Using comprehensive test runner"
        if [ "$CLI_VERBOSE" = "true" ]; then
            "$comprehensive_runner"
        else
            "$comprehensive_runner" 2>&1
        fi
        local result=$?
        
        if [ $result -eq 0 ]; then
            print_success "All tests passed!"
        else
            print_error "Some tests failed (exit code: $result)"
        fi
        
        return $result
    else
        # Fallback: run individual tests
        print_info "Running individual tests (comprehensive runner not found)"
        
        local all_tests
        all_tests=$(find_all_tests)
        
        if [ -z "$all_tests" ]; then
            print_error "No tests found"
            return 1
        fi
        
        while IFS= read -r test_path; do
            tests_run=$((tests_run + 1))
            
            if run_single_test "$test_path"; then
                tests_passed=$((tests_passed + 1))
            else
                tests_failed=$((tests_failed + 1))
                failed_tests+=("$(basename "$test_path" .sh)")
            fi
        done << EOF
$all_tests
EOF
        
        # Results summary
        print_header "Test Results Summary"
        echo "Tests Run: $tests_run"
        echo "Tests Passed: $tests_passed"
        echo "Tests Failed: $tests_failed"
        
        if [ $tests_failed -eq 0 ]; then
            print_success "All tests passed!"
            return 0
        else
            print_error "Failed tests:"
            for failed_test in "${failed_tests[@]}"; do
                echo "  - $failed_test"
            done
            return 1
        fi
    fi
}

# Run tests matching pattern (now used by 'all' command)
run_tests_with_pattern() {
    local pattern="$1"
    
    if [ -z "$pattern" ]; then
        # No pattern means run all tests
        run_all_tests
        return $?
    fi
    
    print_header "Running Tests Matching: $pattern"
    
    local matching_tests
    matching_tests=$(find_tests_by_pattern "$pattern")
    
    if [ -z "$matching_tests" ]; then
        print_error "No tests found matching pattern: $pattern"
        print_info "Available patterns: 00, 00-49, meta-api, connection, lifecycle, etc."
        return 1
    fi
    
    local test_count
    test_count=$(echo "$matching_tests" | wc -l | tr -d ' ')
    print_info "Found $test_count matching tests"
    echo
    
    local tests_run=0
    local tests_passed=0
    local tests_failed=0
    local failed_tests=()
    
    while IFS= read -r test_path; do
        if [ -n "$test_path" ]; then
            tests_run=$((tests_run + 1))
            
            if run_single_test "$test_path"; then
                tests_passed=$((tests_passed + 1))
            else
                tests_failed=$((tests_failed + 1))
                failed_tests+=("$(basename "$test_path" .sh)")
            fi
        fi
    done << EOF
$matching_tests
EOF
    
    # Results summary
    print_header "Pattern Test Results"
    echo "Pattern: $pattern"
    echo "Tests Run: $tests_run"
    echo "Tests Passed: $tests_passed"
    echo "Tests Failed: $tests_failed"
    
    if [ $tests_failed -eq 0 ]; then
        print_success "All pattern tests passed!"
        return 0
    else
        print_error "Failed tests:"
        for failed_test in "${failed_tests[@]}"; do
            echo "  - $failed_test"
        done
        return 1
    fi
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    check_test_directory
    run_tests_with_pattern "$@"
fi