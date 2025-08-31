#!/bin/bash
set -e

# TypeScript Spec Test Runner with Smart Resolution
# Enhanced version of spec-all.sh with intelligent pattern/path handling
#
# Usage: scripts/spec-ts.sh [pattern|path] [--verbose]
#
# Smart Resolution:
# - No args: Run all *.test.ts files in sort order
# - Exact file path: Run specific .test.ts file (list size = 1)
# - Pattern: Run *.test.ts files matching pattern
#
# Examples:
#   scripts/spec-ts.sh                                # All TypeScript tests
#   scripts/spec-ts.sh 15                             # All *.test.ts in 15-*
#   scripts/spec-ts.sh spec/unit/filter               # All *.test.ts in unit/filter/
#   scripts/spec-ts.sh spec/15-auth/basic.test.ts     # Single specific test
#   scripts/spec-ts.sh auth                           # All *.test.ts matching "auth"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# DISABLED
print_error "This test framework file (scripts/spec-ts.sh) is disabled"
exit 1

# Compilation must pass before running tests
print_info "Running TypeScript build before tests..."
if ! npm run build; then
    print_error "TypeScript build failed - cannot run tests"
    exit 1
fi
print_success "TypeScript build successful"

print_info "Running TypeScript build:spec before tests..."
if ! npm run build:spec; then
    print_error "TypeScript build:spec failed - cannot run tests"
    exit 1
fi
print_success "TypeScript build:spec successful"

# Parse arguments
pattern_or_path="$1"
verbose_flag=""

if [[ "$2" == "--verbose" ]] || [[ "$1" == "--verbose" && -z "$pattern_or_path" ]]; then
    verbose_flag="--reporter=verbose"
    if [[ "$1" == "--verbose" ]]; then
        pattern_or_path=""
    fi
fi

# Smart resolution function with enhanced range pattern support
resolve_typescript_tests() {
    local pattern_or_path="$1"

    if [[ -z "$pattern_or_path" ]]; then
        # No args: run everything in sort order
        find spec/ -name "*.test.ts" | sort
    elif [[ -f "$pattern_or_path" && "$pattern_or_path" == *.test.ts ]]; then
        # Exact file match: single test
        echo "$pattern_or_path"
    elif [[ "$pattern_or_path" =~ ^([0-9]+)-([0-9]+)$ ]]; then
        # Range pattern detected (e.g., 00-09, 15-75, 00-50)
        local start_num="${BASH_REMATCH[1]}"
        local end_num="${BASH_REMATCH[2]}"

        # Find all test files and filter by numeric range
        find spec/ -name "*.test.ts" | while read -r file; do
            # Extract series number from path (e.g., spec/05-infrastructure/test.ts -> 05)
            if [[ "$file" =~ /([0-9]+)- ]]; then
                series_num="${BASH_REMATCH[1]}"
                # Remove leading zeros for numeric comparison
                series_num=$((10#$series_num))
                start_num=$((10#$start_num))
                end_num=$((10#$end_num))

                if [[ $series_num -ge $start_num && $series_num -le $end_num ]]; then
                    echo "$file"
                fi
            fi
        done | sort
    elif [[ "$pattern_or_path" =~ ^[0-9]+$ ]]; then
        # Single number - match series (e.g., 05 matches 05-infrastructure)
        find spec/ -name "*.test.ts" | grep -E "/${pattern_or_path}[0-9]*-" | sort
    else
        # Original string pattern matching
        find spec/ -name "*.test.ts" | grep "$pattern_or_path" | sort
    fi
}

# Get test files to run
test_files=$(resolve_typescript_tests "$pattern_or_path")

if [[ -z "$test_files" ]]; then
    print_info "No TypeScript test files found for pattern: $pattern_or_path (this is normal for some test series)"
    print_success "TypeScript test phase completed (no tests to run)"
    exit 0
fi

# Count tests
test_count=$(echo "$test_files" | wc -l)

# Display what we're running
if [[ -z "$pattern_or_path" ]]; then
    print_info "Running all TypeScript tests ($test_count files)"
elif [[ -f "$pattern_or_path" ]]; then
    print_info "Running single TypeScript test: $pattern_or_path"
elif [[ "$pattern_or_path" =~ ^([0-9]+)-([0-9]+)$ ]]; then
    start_num="${BASH_REMATCH[1]}"
    end_num="${BASH_REMATCH[2]}"
    print_info "Running TypeScript tests in range ${start_num}-${end_num} ($test_count files)"
else
    print_info "Running TypeScript tests matching '$pattern_or_path' ($test_count files)"
fi

# Run vitest with the resolved files
if [[ $test_count -eq 1 ]]; then
    # Single test - show which one
    echo -e "${YELLOW}ℹ Running single spec test: $(basename "$test_files")${NC}"
fi

# Execute vitest
npx vitest run $test_files $verbose_flag

exit_code=$?

if [[ $exit_code -eq 0 ]]; then
    print_success "TypeScript tests completed successfully"
else
    print_error "TypeScript tests failed"
fi

exit $exit_code
