#!/bin/bash
set -e

# Comprehensive Test Runner - Executes all tests in numerical order
# Follows the 00-99 numbering system for logical test progression

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() {
    echo -e "\n${YELLOW}=== $1 ===${NC}"
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

# Test results tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

run_test() {
    local test_path="$1"
    local test_name="$2"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    print_step "Running: $test_name"
    
    if [ -x "$test_path" ]; then
        if cd "$(dirname "$test_path")" && "./$(basename "$test_path")" > /dev/null 2>&1; then
            print_success "$test_name"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            print_error "$test_name"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            FAILED_TESTS+=("$test_name")
        fi
    else
        print_error "$test_name (not executable or not found)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name (not found)")
    fi
    
    # Return to test root directory
    cd "$(dirname "$0")"
}

echo "=== Monk API Comprehensive Test Suite ==="
echo "Running tests in numerical order..."
echo

# 00-09: Setup and infrastructure tests
print_header "00-09: Setup and Infrastructure Tests"
run_test "00-setup/database-pool-test.sh" "Database Pool Management Test"

# 10-19: Basic connectivity and auth
print_header "10-19: Connection and Authentication Tests"
run_test "10-connection/ping-test.sh" "Basic Connection & Auth Test"

# 20-29: Meta API basic functionality
print_header "20-29: Meta API Tests"
run_test "20-meta-api/basic-meta-endpoints.sh" "Basic Meta API Endpoints"
run_test "20-meta-api/schema-create-and-delete.sh" "Schema Create and Delete"

# 30-39: Data API basic functionality
print_header "30-39: Data API Tests"
run_test "30-data-api/basic-data-endpoints.sh" "Basic Data API Endpoints"

# 40-49: Reserved for future expansion
print_header "40-49: Reserved for Future Tests"
echo "No additional tests defined yet"

# 50-59: Integration tests
print_header "50-59: Integration Tests"
run_test "50-integration/test-pipeline.sh" "Complete Integration Pipeline"

# 60-69: Lifecycle and CRUD tests
print_header "60-69: Lifecycle Tests"
run_test "60-lifecycle/record-lifecycle-test.sh" "Record Lifecycle Test"

# 70-79: Validation and constraint tests
print_header "70-79: Validation Tests"
run_test "70-validation/schema-restrict-test.sh" "Schema Restriction Test"
run_test "70-validation/schema-validations-change.sh" "Schema Validation Changes"

# 80-89: Reserved for performance/load tests
print_header "80-89: Performance Tests (Reserved)"
echo "No performance tests defined yet"

# 90-99: Error handling and edge cases
print_header "90-99: Error Handling Tests (Reserved)"
echo "No error handling tests defined yet"

# Final results
print_header "Test Results Summary"
echo "Tests Run: $TESTS_RUN"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    print_success "All tests passed!"
    exit 0
else
    print_error "Some tests failed:"
    for failed_test in "${FAILED_TESTS[@]}"; do
        echo "  - $failed_test"
    done
    exit 1
fi