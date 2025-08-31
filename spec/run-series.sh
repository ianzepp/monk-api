#!/usr/bin/env bash
set -e

#
# Test Series Runner for Monk API
# 
# Runs all tests in a specified test series directory sequentially.
# Each test must pass before proceeding to the next.
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

print_header() {
    echo
    echo -e "${BOLD}${BLUE}=== $1 ===${NC}"
    echo
}

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Usage information
show_usage() {
    echo "Monk API Test Series Runner"
    echo
    echo "Usage: $0 <series-directory>"
    echo
    echo "Examples:"
    echo "  $0 01-basic              # Run all tests in spec/01-basic/"
    echo "  $0 10-auth               # Run all tests in spec/10-auth/"
    echo "  $0 20-protected          # Run all tests in spec/20-protected/"
    echo
    echo "Available test series:"
    for dir in spec/*/; do
        if [[ -d "$dir" && "$dir" != "spec/helpers/" ]]; then
            series_name=$(basename "$dir")
            test_count=$(find "$dir" -name "*.test.sh" | wc -l | tr -d ' ')
            echo "  $series_name ($test_count tests)"
        fi
    done
}

# Main execution
main() {
    local series="$1"
    
    # Validate input
    if [[ -z "$series" ]]; then
        print_error "Test series directory required"
        show_usage
        exit 1
    fi
    
    # Check if series directory exists
    local series_dir="spec/$series"
    if [[ ! -d "$series_dir" ]]; then
        print_error "Test series directory not found: $series_dir"
        show_usage
        exit 1
    fi
    
    # Find all test files in the series
    local test_files=($(find "$series_dir" -name "*.test.sh" | sort))
    
    if [[ ${#test_files[@]} -eq 0 ]]; then
        print_warning "No test files found in $series_dir"
        exit 0
    fi
    
    print_header "Running Test Series: $series"
    print_step "Found ${#test_files[@]} test files"
    echo
    
    local passed=0
    local failed=0
    local start_time=$(date +%s)
    
    # Run each test file
    for test_file in "${test_files[@]}"; do
        local test_name=$(basename "$test_file" .test.sh)
        
        print_step "Running $test_name..."
        
        if bash "$test_file"; then
            print_success "$test_name passed"
            ((passed++))
        else
            print_error "$test_name failed"
            ((failed++))
            
            # Stop on first failure
            print_error "Test series stopped due to failure"
            break
        fi
        
        echo
    done
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_header "Test Series Summary: $series"
    print_step "Tests passed: $passed"
    print_step "Tests failed: $failed"
    print_step "Duration: ${duration}s"
    
    if [[ $failed -eq 0 ]]; then
        print_success "All tests in $series passed!"
        exit 0
    else
        print_error "Test series $series failed"
        exit 1
    fi
}

# Handle help flag
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_usage
    exit 0
fi

main "$@"