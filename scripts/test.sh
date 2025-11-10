#!/usr/bin/env bash
# Unified Test Runner - Orchestrates TypeScript and Shell tests
# Usage: scripts/test.sh [test-pattern]
#   test-pattern: Pattern to match test files (e.g., "31-meta", "01-basic")
# Environment Variables:
#   TEST_VERBOSE: Set to "1" or "true" for detailed output messages

# Check TEST_VERBOSE environment variable
TEST_VERBOSE="${TEST_VERBOSE:-false}"

# Preserve command line arguments for test file matching

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    # Always show test headers, even in quiet mode
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    # Success messages (✓) only shown in verbose mode
    if [[ "$TEST_VERBOSE" == "true" ]] || [[ "$TEST_VERBOSE" == "1" ]]; then
        echo -e "${GREEN}✓ $1${NC}"
    fi
}

print_warning() {
    # Warning messages (⚠) always shown by default
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    # Error messages (✗) always shown by default
    echo -e "${RED}✗ $1${NC}"
}

# Track overall results
OVERALL_PASSED=0
OVERALL_FAILED=0
OVERALL_FAILED_TESTS=()

# Function to run TypeScript tests
run_typescript_tests() {
    print_header "TypeScript Tests"
    
    # Check if TypeScript tests are implemented
    if ! grep -q "🚧 TypeScript tests are planned" "$(dirname "${BASH_SOURCE[0]}")/test-ts.sh"; then
        print_success "Running TypeScript tests..."
        
        # Run TypeScript tests with the same arguments
        if "$(dirname "${BASH_SOURCE[0]}")/test-ts.sh" "$@"; then
            print_success "TypeScript tests passed"
            ((OVERALL_PASSED++))
        else
            print_error "TypeScript tests failed"
            ((OVERALL_FAILED++))
            OVERALL_FAILED_TESTS+=("TypeScript Tests")
        fi
    else
        print_warning "TypeScript tests not yet implemented - skipping"
    fi
}

# Function to run Shell tests
run_shell_tests() {
    print_header "Shell Integration Tests"
    
    # Run shell tests with the same arguments
    if "$(dirname "${BASH_SOURCE[0]}")/test-sh.sh" "$@"; then
        print_success "Shell tests passed"
        ((OVERALL_PASSED++))
    else
        print_error "Shell tests failed"
        ((OVERALL_FAILED++))
        OVERALL_FAILED_TESTS+=("Shell Tests")
    fi
}

# Main execution
print_header "Monk API Test Suite"

echo
print_success "Building project..."
if ! npm run build; then
    print_error "Build failed - aborting tests"
    exit 1
fi

echo
run_typescript_tests

echo
run_shell_tests

# Final summary
echo
print_header "Test Suite Summary"
echo "Test suites run: $((OVERALL_PASSED + OVERALL_FAILED))"
print_success "Passed: $OVERALL_PASSED"

if [[ $OVERALL_FAILED -gt 0 ]]; then
    print_error "Failed: $OVERALL_FAILED"
    echo
    print_error "Failed test suites:"
    for failed_suite in "${OVERALL_FAILED_TESTS[@]}"; do
        echo "  - $failed_suite"
    done
    echo
    exit 1
else
    echo
    print_success "All test suites passed!"
    exit 0
fi