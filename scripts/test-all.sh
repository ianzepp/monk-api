#!/bin/bash
set -e

# Test orchestrator script for Monk API project
# Finds tests by pattern and delegates execution to test-one.sh
#
# Usage: scripts/test-all.sh [pattern] [--verbose]
# 
# Architecture: Three-Layer Design
# Layer 1 (this script): Pattern matching and orchestration
# Layer 2 (test-one.sh): Tenant lifecycle management per test file
# Layer 3 (test files): Authentication scenarios and test logic
#
# Features:
# - Pattern-based test discovery and filtering
# - Delegates tenant management to test-one.sh
# - Aggregates results from multiple test executions
# - Each test file gets its own fresh tenant
#
# Examples:
#   scripts/test-all.sh              # Run all tests
#   scripts/test-all.sh 05           # Run category 05 tests
#   scripts/test-all.sh 20-30        # Run categories 20-30
#   scripts/test-all.sh servers      # Run tests matching "servers"
#   scripts/test-all.sh --verbose    # Run all tests with verbose output

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

while [ $# -gt 0 ]; do
    case $1 in
        --verbose)
            export CLI_VERBOSE=true
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            echo "Usage: $0 [pattern] [--verbose]"
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

print_info "Finding and running tests"
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

# Run a single test via test-one.sh (delegate tenant management)
run_single_test() {
    local test_path="$1"
    local test_name=$(basename "$test_path" .sh)
    
    print_info "Running: $test_name"
    
    if [ ! -x "$test_path" ]; then
        print_error "$test_name (not executable)"
        return 1
    fi
    
    # Delegate to test-one.sh for tenant management and execution
    start_time=$(date +%s)
    
    if [ "$verbose" = "true" ]; then
        # Show output in verbose mode
        ./scripts/test-one.sh "$test_path" --verbose
        test_result=$?
    else
        # Capture output and only show if test fails
        if test_output=$(./scripts/test-one.sh "$test_path" 2>&1); then
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

# Run each test (using process substitution to avoid subshell variable scope issues)
while IFS= read -r test_path; do
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
done < <(echo "$test_files")

# Summary
echo
echo "=========================="
echo "Test Summary"
echo "=========================="
echo "Tests run: $tests_run"
echo "Passed: $tests_passed"
echo "Failed: $tests_failed"

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