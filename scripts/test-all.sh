#!/bin/bash
set -e

# Test runner script for Monk API project
# Extracted from monk CLI test_all_command for project-local usage
#
# Usage: scripts/test-all.sh [pattern]
# 
# Examples:
#   scripts/test-all.sh              # Run all tests
#   scripts/test-all.sh 05           # Run category 05 tests
#   scripts/test-all.sh 20-30        # Run categories 20-30
#   scripts/test-all.sh servers      # Run tests matching "servers"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Parse command line arguments
pattern=""
clean_mode=false

while [ $# -gt 0 ]; do
    case $1 in
        --clean)
            clean_mode=true
            shift
            ;;
        --verbose)
            export CLI_VERBOSE=true
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            echo "Usage: $0 [pattern] [--clean] [--verbose]"
            exit 1
            ;;
        *)
            pattern="$1"
            shift
            ;;
    esac
done

# Verbose mode from environment or flag
verbose="${CLI_VERBOSE:-false}"

# Test directory
TEST_BASE_DIR="tests"

if [ ! -d "$TEST_BASE_DIR" ]; then
    print_error "Test directory not found: $TEST_BASE_DIR"
    print_info "Run from monk-api project root directory"
    exit 1
fi

print_info "Running Tests"
echo

# Handle clean environment setup
#if [ "$clean_mode" = true ]; then
#    # skip for now..
#fi

echo "=== Test Environment Setup ==="

# Create unique tenant for this test run
TEST_TENANT_NAME="test-$(date +%s)"

# Create tenant with root user
if output=$(monk tenant create "$TEST_TENANT_NAME" 2>&1); then
    print_success "Test tenant created ($TEST_TENANT_NAME)"
else
    print_error "Failed to create test tenant"
    echo "Error output:"
    echo "$output" | sed 's/^/  /'
    exit 1
fi
    
# Authenticate with tenant using root user
if monk auth login "$TEST_TENANT_NAME" "root" >/dev/null 2>&1; then
    print_success "Authentication successful"
else
    print_error "Authentication failed"
    # Cleanup on failure
    monk tenant delete "$TEST_TENANT_NAME" >/dev/null 2>&1 || true
    exit 1
fi

print_info "Test tenant: $TEST_TENANT_NAME"
print_info "Authenticated as: root user"
    
echo "========================"
echo

# Show test environment information
if [ -f "scripts/test-info.sh" ] && [ -x "scripts/test-info.sh" ]; then
    echo "=== Test Environment ==="
    ./scripts/test-info.sh
    echo "========================"
    echo
fi

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
    
    if [ "$verbose" = "true" ]; then
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
        if [ "$verbose" != "true" ] && [ -n "$test_output" ]; then
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
        test_result=$?
        
        tests_run=$((tests_run + 1))
        if [ $test_result -eq 0 ]; then
            tests_passed=$((tests_passed + 1))
        else
            tests_failed=$((tests_failed + 1))
            failed_tests+=("$(basename "$test_path" .sh)")
        fi
    fi
done

# Summary
echo
echo "=========================="
echo "Test Summary"
echo "=========================="
echo "Tests run: $tests_run"
echo "Passed: $tests_passed"
echo "Failed: $tests_failed"

# Cleanup test tenant
echo
print_info "Cleaning up test environment"
monk auth logout >/dev/null 2>&1 || true
if monk tenant delete "$TEST_TENANT_NAME" >/dev/null 2>&1; then
    print_success "Test tenant cleaned up"
else
    print_info "Test tenant cleanup failed (non-fatal)"
fi

if [ ${#failed_tests[@]} -gt 0 ]; then
    echo
    echo "Failed tests:"
    for test in "${failed_tests[@]}"; do
        print_error "$test"
    done
    echo
    exit 1
else
    echo
    print_success "All tests passed!"
    exit 0
fi