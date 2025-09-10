#!/bin/bash
set -e

# Shell Spec Test Runner with Smart Resolution
# Enhanced version of test-all.sh with intelligent pattern/path handling
#
# Usage: scripts/spec-sh.sh [pattern|path] [--verbose]
#
# Smart Resolution:
# - No args: Run all *.test.sh files in sort order
# - Exact file path: Run specific .test.sh file (via test-one.sh pattern)
# - Pattern: Run *.test.sh files matching pattern
#
# Examples:
#   scripts/spec-sh.sh                                # All shell tests
#   scripts/spec-sh.sh 15                             # All *.test.sh in 15-*
#   scripts/spec-sh.sh spec/20-meta-api               # All *.test.sh in 20-meta-api/
#   scripts/spec-sh.sh spec/15-auth/basic.test.sh     # Single specific test
#   scripts/spec-sh.sh auth                           # All *.test.sh matching "auth"

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
print_error "This test framework file (scripts/spec-sh.sh) is disabled"
exit 1

# Compilation must pass before running tests
print_info "Running TypeScript build before tests..."
if ! npm run build; then
    print_error "TypeScript build failed - cannot run tests"
    exit 1
fi
print_success "TypeScript build successful"

# Parse arguments
pattern_or_path="$1"

if [[ "$2" == "--verbose" ]] || [[ "$1" == "--verbose" && -z "$pattern_or_path" ]]; then
    export CLI_VERBOSE=true
    if [[ "$1" == "--verbose" ]]; then
        pattern_or_path=""
    fi
fi

# Smart resolution function with enhanced range pattern support
resolve_shell_tests() {
    local pattern_or_path="$1"

    if [[ -z "$pattern_or_path" ]]; then
        # No args: run everything in sort order
        find spec/ -name "*.test.sh" | sort
    elif [[ -f "$pattern_or_path" && "$pattern_or_path" == *.test.sh ]]; then
        # Exact file match: single test
        echo "$pattern_or_path"
    elif [[ "$pattern_or_path" =~ ^([0-9]+)-([0-9]+)$ ]]; then
        # Range pattern detected (e.g., 00-09, 15-75, 00-50)
        local start_num="${BASH_REMATCH[1]}"
        local end_num="${BASH_REMATCH[2]}"

        # Find all test files and filter by numeric range
        find spec/ -name "*.test.sh" | while read -r file; do
            # Extract series number from path (e.g., spec/05-infrastructure/test.sh -> 05)
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
        find spec/ -name "*.test.sh" | grep -E "/${pattern_or_path}[0-9]*-" | sort
    else
        # Original string pattern matching
        find spec/ -name "*.test.sh" | grep "$pattern_or_path" | sort
    fi
}

# Get test files to run
test_files=$(resolve_shell_tests "$pattern_or_path")

if [[ -z "$test_files" ]]; then
    print_error "No shell test files found for pattern: $pattern_or_path"
    exit 1
fi

# Count tests
test_count=$(echo "$test_files" | wc -l)

# Display what we're running
if [[ -z "$pattern_or_path" ]]; then
    print_info "Running all shell tests ($test_count files)"
elif [[ -f "$pattern_or_path" ]]; then
    print_info "Running single shell test: $pattern_or_path"
elif [[ "$pattern_or_path" =~ ^([0-9]+)-([0-9]+)$ ]]; then
    start_num="${BASH_REMATCH[1]}"
    end_num="${BASH_REMATCH[2]}"
    print_info "Running shell tests in range ${start_num}-${end_num} ($test_count files)"
else
    print_info "Running shell tests matching '$pattern_or_path' ($test_count files)"
fi

# Track results
passed=0
failed=0
failed_tests=()

# Execute each test file using the existing test-one.sh pattern
while IFS= read -r test_file; do
    test_name=$(basename "$test_file")

    if [[ $test_count -gt 1 ]]; then
        echo -e "${BLUE}🧪 Running: $test_name${NC}"
    else
        echo -e "${YELLOW}ℹ Running single shell test: $test_name${NC}"
    fi

    # Use existing test-one.sh infrastructure for tenant isolation
    if scripts/test-one.sh "$test_file"; then
        ((passed++))
        if [[ $test_count -gt 1 ]]; then
            print_success "$test_name"
        fi
    else
        ((failed++))
        failed_tests+=("$test_name")
        print_error "$test_name"
    fi

    if [[ $test_count -gt 1 ]]; then
        echo ""
    fi
done <<< "$test_files"

# Summary
echo -e "${BLUE}📊 Shell Test Results:${NC}"
echo -e "   Passed: ${GREEN}$passed${NC}"
echo -e "   Failed: ${RED}$failed${NC}"
echo -e "   Total:  $test_count"

if [[ $failed -gt 0 ]]; then
    echo ""
    print_error "Failed tests:"
    for failed_test in "${failed_tests[@]}"; do
        echo -e "   ${RED}✗${NC} $failed_test"
    done
    exit 1
else
    print_success "All shell tests passed"
    exit 0
fi
