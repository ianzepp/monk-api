#!/bin/bash
set -e

# Single test runner script for Monk API project
# Extracted from monk CLI test_one_command for project-local usage
#
# Usage: scripts/test-one.sh <test-file>
# 
# Examples:
#   scripts/test-one.sh tests/05-infrastructure/servers-config-test.sh
#   scripts/test-one.sh tests/20-meta-api/basic-meta-endpoints.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Get test file from command line
test_file="${1:-}"

if [ -z "$test_file" ]; then
    print_error "Test file required"
    echo "Usage: $0 <test-file>"
    echo ""
    echo "Examples:"
    echo "  $0 tests/05-infrastructure/servers-config-test.sh"
    echo "  $0 tests/20-meta-api/basic-meta-endpoints.sh"
    exit 1
fi

# Check if test file exists
if [ ! -f "$test_file" ]; then
    print_error "Test file not found: $test_file"
    exit 1
fi

# Check if test file is executable
if [ ! -x "$test_file" ]; then
    print_error "Test file not executable: $test_file"
    print_info "Run: chmod +x $test_file"
    exit 1
fi

# Get test info
test_name=$(basename "$test_file" .sh)
test_dir=$(dirname "$test_file")

print_info "Running single test: $test_name"
echo

# Show test environment information
if [ -f "scripts/test-info.sh" ] && [ -x "scripts/test-info.sh" ]; then
    echo "=== Test Environment ==="
    ./scripts/test-info.sh
    echo "========================"
    echo
fi

# Run the test
start_time=$(date +%s)

# Change to test directory and run the test
if (cd "$test_dir" && "./$(basename "$test_file")"); then
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo
    print_success "Test passed: $test_name (${duration}s)"
    exit 0
else
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo
    print_error "Test failed: $test_name (${duration}s)"
    exit 1
fi