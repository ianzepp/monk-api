#!/usr/bin/env bash
#
# TypeScript Test Runner - Unit tests with Vitest
#
# Usage: scripts/test-ts.sh [test-pattern] [vitest-args...]
#   test-pattern: Number pattern to match test directories (e.g., "05", "31", "01-15")
#   vitest-args: Additional arguments passed to vitest (e.g., -t "test name")
#
# Examples:
#   npm run test:ts           # Run all TypeScript tests
#   npm run test:ts 05        # Run only 05-infrastructure tests
#   npm run test:ts 30-39     # Run tests in range 30-39
#   npm run test:ts -- -t "should create"  # Run tests matching name
#   npm run test:ts 31 -- -t "should create"  # Run tests in 31-* matching name

set -e

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

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Parse arguments: first arg is optional pattern, rest are vitest args
pattern=""
vitest_args=()

# Check if first argument looks like a file pattern (not a vitest flag)
if [[ $# -gt 0 && ! "$1" =~ ^- ]]; then
    pattern="$1"
    shift
fi

# Remaining arguments are vitest flags
vitest_args=("$@")

# Find TypeScript test files based on pattern
if [[ -n "$pattern" ]]; then
    # Check for range pattern (e.g., "10-39", "01-15")
    if [[ "$pattern" =~ ^([0-9]{2})-([0-9]{2})$ ]]; then
        start_range="${BASH_REMATCH[1]}"
        end_range="${BASH_REMATCH[2]}"

        # Validate range (start <= end)
        if [[ $start_range -le $end_range ]]; then
            print_header "Running TypeScript tests in range: $start_range-$end_range"
            test_files=$(find spec -name "*.test.ts" -type f | \
                grep -E "^spec/[0-9]{2}-" | \
                awk -v start="$start_range" -v end="$end_range" '
                {
                    dir_num = substr($0, 6, 2)
                    if(dir_num >= start && dir_num <= end) print
                }' | sort)
        else
            print_error "Invalid range: start ($start_range) must be <= end ($end_range)"
            exit 1
        fi
    else
        # Any pattern (e.g., "05", "04-connection", "basic-connection.test.ts", etc.)
        print_header "Running TypeScript tests matching: $pattern"
        test_files=$(find spec -name "*.test.ts" -type f | grep "$pattern" | sort)
    fi
else
    # Run all TypeScript tests
    print_header "Running all TypeScript tests"
    test_files=$(find spec -name "*.test.ts" -type f | sort)
fi

# Check if any test files exist
if [[ -z "$test_files" ]]; then
    print_error "No TypeScript test files found"
    echo ""
    if [[ -n "$pattern" ]]; then
        echo "No tests found matching pattern: $pattern"
    else
        echo "No TypeScript tests found in spec/ directory"
    fi
    echo ""
    echo "TypeScript tests should be placed in spec/XX-category/*.test.ts"
    echo "Example: spec/05-infrastructure/database-naming.test.ts"
    exit 1
fi

# Count test files
test_count=$(echo "$test_files" | wc -l | xargs)
echo "Found $test_count test file(s)"
echo ""

# Run vitest with the specific files and any additional arguments
if [[ ${#vitest_args[@]} -gt 0 ]]; then
    print_header "Executing: npx vitest run ${vitest_args[*]}"
else
    print_header "Executing: npx vitest run"
fi
echo ""

npx vitest run $test_files "${vitest_args[@]}"

exit_code=$?

echo ""
if [[ $exit_code -eq 0 ]]; then
    print_success "All TypeScript tests passed!"
else
    print_error "Some TypeScript tests failed"
fi

exit $exit_code