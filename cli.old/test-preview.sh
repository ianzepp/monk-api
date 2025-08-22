#!/bin/bash
set -e

# Test Preview - Show tests without running them

# Load common functions  
source "$(dirname "$0")/common.sh"

# Test configuration
TEST_BASE_DIR="../monk-api-test/tests"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Check if test directory exists
check_test_directory() {
    if [ ! -d "$TEST_BASE_DIR" ]; then
        print_error "Test directory not found: $TEST_BASE_DIR"
        print_info "Make sure you're running this from the monk-cli directory"
        exit 1
    fi
}

# Find all test scripts (portable across Unix/Linux/macOS)
find_all_tests() {
    find "$TEST_BASE_DIR" -name "*.sh" -type f | while read -r file; do
        if [ -x "$file" ]; then
            echo "$file"
        fi
    done | sort
}

# Find tests matching a pattern (portable across Unix/Linux/macOS)
find_tests_by_pattern() {
    local pattern="$1"
    local temp_file
    
    # Create temporary file (portable across systems)
    if command -v mktemp >/dev/null 2>&1; then
        temp_file=$(mktemp)
    else
        temp_file="/tmp/monk_test_$$"
    fi
    
    # Get all tests first
    find_all_tests > "$temp_file"
    
    # Apply pattern matching
    if echo "$pattern" | grep -E "^[0-9]+-[0-9]+$" >/dev/null 2>&1; then
        # Range pattern like "10-29" or "00-49"
        local start_num=${pattern%-*}
        local end_num=${pattern#*-}
        
        # Remove leading zeros for arithmetic
        start_num=$((10#$start_num))
        end_num=$((10#$end_num))
        
        grep -E "/[0-9][0-9]-" "$temp_file" | while IFS= read -r test_path; do
            local test_num=$(basename "$(dirname "$test_path")" | cut -d'-' -f1)
            test_num=$((10#$test_num))
            if [ "$test_num" -ge "$start_num" ] && [ "$test_num" -le "$end_num" ]; then
                echo "$test_path"
            fi
        done
        
    elif echo "$pattern" | grep -E "^[0-9]+$" >/dev/null 2>&1; then
        # Single number pattern like "00" or "10"
        printf -v padded_pattern "%02d" "$pattern"
        grep -E "/${padded_pattern}-" "$temp_file"
        
    else
        # Text pattern like "meta-api", "connection", etc.
        grep -i "$pattern" "$temp_file"
    fi
    
    # Clean up
    rm -f "$temp_file"
}

# Show usage information
show_usage() {
    cat << EOF
Usage: monk test preview [pattern]

Preview tests that would be run with a given pattern without actually running them.

Arguments:
  [pattern]               Test pattern to match (optional - shows all tests if omitted)

Pattern Examples:
  (no pattern)            Show all available tests
  00                      Show all tests in 00-* directories
  10-29                   Show tests in ranges 10 through 29
  meta-api                Show all tests with 'meta-api' in path/name
  connection              Show all tests with 'connection' in path/name
  lifecycle               Show all tests with 'lifecycle' in path/name

Examples:
  monk test preview                # Show all available tests
  monk test preview 10             # Show tests in 10-* directories
  monk test preview 10-29          # Show tests in range 10-29
  monk test preview meta-api       # Show tests matching 'meta-api'
  monk test preview connection     # Show tests matching 'connection'

EOF
}

# Preview tests matching pattern (show without running)
preview_tests() {
    local pattern="$1"
    
    if [ -z "$pattern" ]; then
        print_header "Preview: All Available Tests"
        local all_tests
        all_tests=$(find_all_tests)
        
        if [ -z "$all_tests" ]; then
            print_error "No tests found"
            return 1
        fi
        
        local test_count
        test_count=$(echo "$all_tests" | wc -l | tr -d ' ')
        print_info "Found $test_count total tests"
        echo
        
        echo "$all_tests" | while IFS= read -r test_path; do
            if [ -n "$test_path" ]; then
                local test_name=$(basename "$test_path" .sh)
                local relative_path=${test_path#$TEST_BASE_DIR/}
                printf "  %-30s %s\n" "$test_name" "$relative_path"
            fi
        done
        
        return 0
    else
        print_header "Preview: Tests Matching Pattern '$pattern'"
        
        local matching_tests
        matching_tests=$(find_tests_by_pattern "$pattern")
        
        if [ -z "$matching_tests" ]; then
            print_error "No tests found matching pattern: $pattern"
            print_info "Available patterns: 00, 00-49, meta-api, connection, lifecycle, etc."
            return 1
        fi
        
        local test_count
        test_count=$(echo "$matching_tests" | wc -l | tr -d ' ')
        print_info "Found $test_count matching tests"
        echo
        
        echo "$matching_tests" | while IFS= read -r test_path; do
            if [ -n "$test_path" ]; then
                local test_name=$(basename "$test_path" .sh)
                local relative_path=${test_path#$TEST_BASE_DIR/}
                printf "  %-30s %s\n" "$test_name" "$relative_path"
            fi
        done
        
        return 0
    fi
}

# Main command handling
main() {
    # Handle help
    case "${1:-}" in
        -h|--help|help)
            show_usage
            exit 0
            ;;
    esac
    
    check_test_directory
    preview_tests "$1"
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi