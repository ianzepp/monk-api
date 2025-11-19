#!/usr/bin/env bash
#
# TypeScript Test Runner - Unit tests with Vitest
#
# Usage: scripts/test-ts.sh [test-pattern]
#   test-pattern: Number pattern to match test directories (e.g., "05", "31", "01-15")
#
# Examples:
#   npm run test:ts           # Run all TypeScript tests
#   npm run test:ts 05        # Run only 05-infrastructure tests
#   npm run test:ts 30-39     # Run tests in range 30-39

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

server_start() {
    print_header "Starting test server on port 9002"
    PORT=9002 npm run start:bg
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

# Find TypeScript test files based on pattern
if [[ $# -gt 0 ]]; then
    pattern="$1"
    
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
    server_stop
    exit 1
fi

# Count test files
test_count=$(echo "$test_files" | wc -l | xargs)
echo "Found $test_count test file(s)"
echo ""

# Run vitest with the specific files
print_header "Executing: npx vitest run"
echo ""

npx vitest run $test_files

exit_code=$?

echo ""
if [[ $exit_code -eq 0 ]]; then
    print_success "All TypeScript tests passed!"
else
    print_error "Some TypeScript tests failed"
fi

server_stop

exit $exit_code