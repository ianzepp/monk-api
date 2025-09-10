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
test_files=$(find spec -name "*.test.sh" -type f | sort)

if [[ -z "$test_files" ]]; then
    print_error "No test files found in spec/ directory"
    server_stop
    exit 1
fi

# Count total tests
test_count=$(echo "$test_files" | wc -l | xargs)
print_header "Running $test_count test files"

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
        failed_tests+=("$test_name")
        ((failed++))
    fi
done <<< "$test_files"

# Summary
echo
print_header "Test Summary"
echo "Total tests: $test_count"
print_success "Passed: $passed"

if [[ $failed -gt 0 ]]; then
    print_error "Failed: $failed"
    echo
    print_error "Failed tests:"
    for failed_test in "${failed_tests[@]}"; do
        echo "  - $failed_test"
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
