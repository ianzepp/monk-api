#!/bin/bash
set -e

# Single spec test runner for Monk API vitest tests
# Runs a specific vitest test file
#
# Usage: scripts/spec-one.sh <test-file> [--verbose]
# 
# Examples:
#   scripts/spec-one.sh spec/05-infrastructure/connectivity.test.ts
#   scripts/spec-one.sh spec/15-authentication/basic-auth.test.ts --verbose

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Parse arguments
test_file="$1"
verbose_flag=""

if [ "$2" = "--verbose" ]; then
    verbose_flag="--reporter=verbose"
fi

# Validate test file
if [ -z "$test_file" ]; then
    print_error "Test file required"
    echo "Usage: $0 <test-file> [--verbose]"
    echo "Example: $0 spec/05-infrastructure/connectivity.test.ts"
    exit 1
fi

if [ ! -f "$test_file" ]; then
    print_error "Test file not found: $test_file"
    exit 1
fi

# Check if it's a .test.ts file
if ! echo "$test_file" | grep -q '\.test\.ts$'; then
    print_error "File must be a .test.ts file: $test_file"
    exit 1
fi

print_info "Running single spec test: $(basename "$test_file")"

if [ -n "$verbose_flag" ]; then
    print_info "Running with verbose output"
fi

# Run the specific test file with vitest
exec npx vitest run "$test_file" $verbose_flag