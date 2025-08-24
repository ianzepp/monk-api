#!/bin/bash
set -e

# Spec test orchestrator script for Monk API vitest tests
# Finds spec tests by pattern and runs them with vitest
#
# Usage: scripts/spec-all.sh [pattern] [--verbose]
# 
# Features:
# - Pattern-based test discovery and filtering for spec/ directory
# - Runs vitest with specific test file patterns
# - Supports numeric ranges and text patterns
#
# Examples:
#   scripts/spec-all.sh              # Run all spec tests
#   scripts/spec-all.sh 05           # Run category 05 spec tests
#   scripts/spec-all.sh 15-30        # Run categories 15-30 spec tests
#   scripts/spec-all.sh auth         # Run spec tests matching "auth"
#   scripts/spec-all.sh --verbose    # Run all spec tests with verbose output

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
verbose_flag=""

while [ $# -gt 0 ]; do
    case $1 in
        --verbose)
            verbose_flag="--reporter=verbose"
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

# Spec directory
SPEC_BASE_DIR="spec"

if [ ! -d "$SPEC_BASE_DIR" ]; then
    print_error "Spec directory not found: $SPEC_BASE_DIR"
    print_info "Run from monk-api project root directory"
    exit 1
fi

print_info "Finding and running spec tests"
echo

# Function to find spec tests by pattern
find_spec_tests_by_pattern() {
    local pattern="$1"
    
    if [ -z "$pattern" ]; then
        # No pattern - find all spec tests
        find "$SPEC_BASE_DIR" -name "*.test.ts" -type f | sort
        return
    fi
    
    # Check if pattern is a number range (e.g., "05", "15-30")
    if echo "$pattern" | grep -E '^[0-9]{2}(-[0-9]{2})?$' >/dev/null 2>&1; then
        # Extract start and end numbers
        if echo "$pattern" | grep -q '-'; then
            start_num=$(echo "$pattern" | cut -d'-' -f1)
            end_num=$(echo "$pattern" | cut -d'-' -f2)
        else
            start_num="$pattern"
            end_num="$pattern"
        fi
        
        # Find spec tests in numeric range
        find "$SPEC_BASE_DIR" -name "*.test.ts" -type f | while read -r file; do
            dir_name=$(basename $(dirname "$file"))
            if echo "$dir_name" | grep -E "^[0-9]{2}" >/dev/null 2>&1; then
                file_num=$(echo "$dir_name" | sed 's/^\([0-9][0-9]\).*/\1/')
                if [ "$file_num" -ge "$start_num" ] && [ "$file_num" -le "$end_num" ]; then
                    echo "$file"
                fi
            fi
        done | sort
        return
    fi
    
    # Text pattern - find tests containing the pattern
    find "$SPEC_BASE_DIR" -name "*.test.ts" -type f | while read -r file; do
        if echo "$file" | grep -i "$pattern" >/dev/null 2>&1; then
            echo "$file"
        fi
    done | sort
}

# Get list of test files
test_files=$(find_spec_tests_by_pattern "$pattern")

if [ -z "$test_files" ]; then
    if [ -n "$pattern" ]; then
        print_error "No spec tests found matching pattern: $pattern"
    else
        print_error "No spec tests found in $SPEC_BASE_DIR"
    fi
    exit 1
fi

# Count tests
test_count=$(echo "$test_files" | wc -l | tr -d ' ')
print_info "Found $test_count spec test file(s)"

if [ "$test_count" -eq 1 ]; then
    # Single test file - run with spec-one.sh
    test_file=$(echo "$test_files" | head -1)
    print_info "Running single spec test: $(basename "$test_file")"
    exec scripts/spec-one.sh "$test_file" $verbose_flag
else
    # Multiple test files - run all with vitest
    print_info "Running all matching spec tests with vitest"
    
    if [ -n "$verbose_flag" ]; then
        print_info "Running with verbose output"
    fi
    
    # Convert file list to vitest pattern
    echo "$test_files" | tr '\n' ' ' | xargs npx vitest run $verbose_flag
fi