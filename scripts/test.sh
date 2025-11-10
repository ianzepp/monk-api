#!/usr/bin/env bash
# Note: Removed set -e to handle test failures gracefully

# Test script - finds and runs all test.sh files in spec/ directory serially
# Usage: scripts/test.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

server_start() {
    print_header "Starting server"
    npm run start:bg
    print_success "Server starting, waiting 3 seconds.."
    sleep 3
}

server_stop() {
    print_header "Stopping server (if running)"
    npm run stop
}

# Run the build
npm run build

# Start the API server
server_stop
server_start

# Find all test.sh files and sort by name
if [[ $# -gt 0 ]]; then
    pattern="$1"
    
    # Check for range pattern (e.g., "10-39", "01-15")
    if [[ "$pattern" =~ ^([0-9]{2})-([0-9]{2})$ ]]; then
        start_range="${BASH_REMATCH[1]}"
        end_range="${BASH_REMATCH[2]}"
        
        # Validate range (start <= end)
        if [[ $start_range -le $end_range ]]; then
            print_header "Running tests in range: $start_range-$end_range"
            test_files=$(find spec -name "*.test.sh" -type f | \
                grep -E "^spec/[0-9]{2}-" | \
                awk -v start="$start_range" -v end="$end_range" '
                {
                    # Extract the directory number (characters 6-7 after "spec/")
                    dir_num = substr($0, 6, 2)
                    if(dir_num >= start && dir_num <= end) print
                }' | sort)
            
            if [[ -z "$test_files" ]]; then
                print_error "No test files found in range $start_range-$end_range"
                server_stop
                exit 1
            fi
        else
            print_error "Invalid range: start ($start_range) must be <= end ($end_range)"
            server_stop
            exit 1
        fi
    else
        # Regular pattern matching (existing behavior)
        test_files=$(find spec -name "*.test.sh" -type f | grep -i "$pattern" | sort)
        if [[ -z "$test_files" ]]; then
            print_error "No test files matching pattern '$pattern' found"
            server_stop
            exit 1
        fi
    fi
else
    test_files=$(find spec -name "*.test.sh" -type f | sort)
fi

if [[ -z "$test_files" ]]; then
    print_error "No test files found in spec/ directory"
    exit 1
fi

# Count total tests
test_count=$(echo "$test_files" | wc -l | xargs)
print_header "Running $test_count test files"

# Source test helper for cleanup function
source "$(dirname "${BASH_SOURCE[0]}")/../spec/test-tenant-helper.sh"

# Track results
passed=0
failed=0
failed_tests=()

# Run each test serially
while IFS= read -r test_file; do
    test_name=$(basename "$test_file" .test.sh)
    echo
    print_header "Running: $test_file"

    if bash "$test_file"; then
        print_success "PASSED: $test_name"
        ((passed++))
    else
        print_error "FAILED: $test_name"
        failed_tests+=("$test_file")
        ((failed++))
    fi
done <<< "$test_files"

# Summary
echo
print_header "Test Summary"
echo "Total tests: $test_count"
print_success "Passed: $passed"

# Clean up all test databases at the end of the test suite
cleanup_all_test_databases

if [[ $failed -gt 0 ]]; then
    print_error "Failed: $failed"
    echo
    print_error "Failed tests:"
    for failed_test in "${failed_tests[@]}"; do
        dir=$(dirname "$failed_test" | sed 's|spec/||')
        name=$(basename "$failed_test" .test.sh)
        echo "  - $dir/$name"
    done
    echo
    server_stop
    exit 1
else
    echo
    server_stop
    print_success "All tests passed!"
    exit 0
fi
