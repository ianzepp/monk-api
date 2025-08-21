#!/bin/bash
set -e

# Test Comparison - Compare test results between test run environments

# Load common functions
source "$(dirname "$0")/common.sh"

# Test configuration
RUN_HISTORY_DIR="../monk-api-test/run-history"

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

# Ensure test run server is running
ensure_test_run_server() {
    local run_name="$1"
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    
    if [ ! -f "$run_dir/.run-info" ]; then
        print_error "Test run not found: $run_name"
        return 1
    fi
    
    local port=$(grep "server_port=" "$run_dir/.run-info" | cut -d'=' -f2)
    
    # Check if server is running
    if lsof -i ":$port" >/dev/null 2>&1; then
        print_info "Server for $run_name is already running on port $port"
        return 0
    fi
    
    # Start the server using test-git.sh
    print_step "Starting server for $run_name"
    if "$(dirname "$0")/test-git.sh" "$run_name" >/dev/null 2>&1; then
        print_success "Server started for $run_name"
    else
        print_error "Failed to start server for $run_name"
        return 1
    fi
}

# Run tests on a specific test run environment
run_tests_on_environment() {
    local run_name="$1"
    local pattern="${2:-}"
    local results_file="$3"
    
    local run_dir="$RUN_HISTORY_DIR/$run_name"
    
    if [ ! -d "$run_dir" ]; then
        print_error "Test run not found: $run_name"
        return 1
    fi
    
    # Ensure server is running
    ensure_test_run_server "$run_name"
    
    # Set this as the active environment temporarily
    local original_active=""
    local active_run_file="$RUN_HISTORY_DIR/.active-run"
    if [ -f "$active_run_file" ]; then
        original_active=$(cat "$active_run_file")
    fi
    
    echo "$run_name" > "$active_run_file"
    
    # Run tests and capture results
    local test_start=$(date +%s)
    local test_result
    
    if [ -n "$pattern" ]; then
        "$(dirname "$0")/test-all.sh" "$pattern" > "$results_file" 2>&1
        test_result=$?
    else
        "$(dirname "$0")/test-all.sh" > "$results_file" 2>&1
        test_result=$?
    fi
    
    local test_end=$(date +%s)
    local test_duration=$((test_end - test_start))
    
    # Restore original active environment
    if [ -n "$original_active" ]; then
        echo "$original_active" > "$active_run_file"
    else
        rm -f "$active_run_file"
    fi
    
    # Store test metadata
    cat >> "$results_file" << EOF

# Test Metadata
TEST_RUN_NAME=$run_name
TEST_DURATION=${test_duration}s
TEST_RESULT=$test_result
TEST_TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
EOF
    
    return $test_result
}

# Compare test results between two test runs
compare_test_runs() {
    local run1="$1"
    local run2="$2"
    local pattern="${3:-}"
    
    if [ -z "$run1" ] || [ -z "$run2" ]; then
        print_error "Two test run names required"
        print_info "Usage: monk test diff <run1> <run2> [pattern]"
        return 1
    fi
    
    local run1_dir="$RUN_HISTORY_DIR/$run1"
    local run2_dir="$RUN_HISTORY_DIR/$run2"
    
    # Validate both test runs exist
    if [ ! -d "$run1_dir" ]; then
        print_error "Test run not found: $run1"
        print_info "Use 'monk test run $run1' to create it"
        return 1
    fi
    
    if [ ! -d "$run2_dir" ]; then
        print_error "Test run not found: $run2"
        print_info "Use 'monk test run $run2' to create it"
        return 1
    fi
    
    print_header "Test Run Comparison: $run1 vs $run2"
    
    # Show git info for both runs
    if [ -f "$run1_dir/.run-info" ] && [ -f "$run2_dir/.run-info" ]; then
        local run1_commit=$(grep "git_commit_short=" "$run1_dir/.run-info" | cut -d'=' -f2)
        local run1_branch=$(grep "git_branch=" "$run1_dir/.run-info" | cut -d'=' -f2)
        local run2_commit=$(grep "git_commit_short=" "$run2_dir/.run-info" | cut -d'=' -f2)
        local run2_branch=$(grep "git_branch=" "$run2_dir/.run-info" | cut -d'=' -f2)
        
        echo "Environment 1: $run1_branch ($run1_commit)"
        echo "Environment 2: $run2_branch ($run2_commit)"
        echo
    fi
    
    # Create temporary files for test results
    local results1=$(mktemp)
    local results2=$(mktemp)
    
    # Ensure cleanup
    trap "rm -f '$results1' '$results2'" EXIT
    
    # Run tests on both environments in parallel
    print_step "Running tests on both environments"
    
    local start_time=$(date +%s)
    
    # Run tests in parallel
    (
        print_info "Running tests on $run1..."
        run_tests_on_environment "$run1" "$pattern" "$results1"
        echo $? > "${results1}.exitcode"
    ) &
    local pid1=$!
    
    (
        print_info "Running tests on $run2..."
        run_tests_on_environment "$run2" "$pattern" "$results2"
        echo $? > "${results2}.exitcode"
    ) &
    local pid2=$!
    
    # Wait for both to complete
    wait $pid1
    wait $pid2
    
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    # Get exit codes
    local exit1=$(cat "${results1}.exitcode" 2>/dev/null || echo "1")
    local exit2=$(cat "${results2}.exitcode" 2>/dev/null || echo "1")
    
    # Show comparison results
    print_header "Comparison Results (${total_duration}s total)"
    
    printf "%-30s %-15s %-15s %s\n" "Environment" "Result" "Duration" "Status"
    echo "-----------------------------------------------------------------------"
    
    local duration1=$(grep "TEST_DURATION=" "$results1" 2>/dev/null | cut -d'=' -f2 || echo "?")
    local duration2=$(grep "TEST_DURATION=" "$results2" 2>/dev/null | cut -d'=' -f2 || echo "?")
    
    local status1="FAILED"
    local status2="FAILED"
    if [ "$exit1" = "0" ]; then status1="PASSED"; fi
    if [ "$exit2" = "0" ]; then status2="PASSED"; fi
    
    printf "%-30s %-15s %-15s %s\n" "$run1" "$status1" "$duration1" ""
    printf "%-30s %-15s %-15s %s\n" "$run2" "$status2" "$duration2" ""
    
    echo
    
    # Show summary
    if [ "$exit1" = "0" ] && [ "$exit2" = "0" ]; then
        print_success "Both environments passed all tests"
    elif [ "$exit1" = "0" ] && [ "$exit2" != "0" ]; then
        print_error "$run1 passed, $run2 failed"
    elif [ "$exit1" != "0" ] && [ "$exit2" = "0" ]; then
        print_error "$run1 failed, $run2 passed"
    else
        print_error "Both environments failed tests"
    fi
    
    # Store comparison results
    local comparison_file="$RUN_HISTORY_DIR/.last-comparison"
    cat > "$comparison_file" << EOF
run1=$run1
run2=$run2
pattern=$pattern
timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
duration=${total_duration}s
exit1=$exit1
exit2=$exit2
results1_file=$results1
results2_file=$results2
EOF
    
    print_info "Detailed results saved to temporary files:"
    print_info "  $run1: $results1"
    print_info "  $run2: $results2"
    print_info "Comparison metadata: $comparison_file"
    
    # Clean up exit code files
    rm -f "${results1}.exitcode" "${results2}.exitcode"
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    compare_test_runs "$@"
fi