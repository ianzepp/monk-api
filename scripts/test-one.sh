#!/bin/bash
set -e

# Tenant lifecycle manager for Monk API tests
# Creates fresh tenant, runs test file, and cleans up tenant
#
# Usage: scripts/test-one.sh <test-file> [--verbose]
# 
# Architecture: Three-Layer Design (Layer 2)
# Layer 1 (test-all.sh): Pattern matching and orchestration
# Layer 2 (this script): Tenant lifecycle management
# Layer 3 (test files): Authentication scenarios and test logic
#
# Features:
# - Creates unique test tenant with timestamp naming (test-$(date +%s))
# - Exports TEST_TENANT_NAME for test file to use
# - Test file handles its own authentication scenarios
# - Automatically cleans up tenant after test completion
# - Supports multi-user authentication testing within single tenant
#
# Examples:
#   scripts/test-one.sh tests/05-infrastructure/servers-config-test.sh
#   scripts/test-one.sh tests/20-meta-api/basic-meta-endpoints.sh --verbose

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
test_file=""

while [ $# -gt 0 ]; do
    case $1 in
        --verbose)
            export CLI_VERBOSE=true
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            echo "Usage: $0 <test-file> [--verbose]"
            exit 1
            ;;
        *)
            test_file="$1"
            shift
            ;;
    esac
done

if [ -z "$test_file" ]; then
    print_error "Test file required"
    echo "Usage: $0 <test-file> [--verbose]"
    echo ""
    echo "Examples:"
    echo "  $0 tests/05-infrastructure/servers-config-test.sh"
    echo "  $0 tests/20-meta-api/basic-meta-endpoints.sh --verbose"
    exit 1
fi

# Check if test file exists
if [ ! -f "$test_file" ]; then
    print_error "Test file not found: $test_file"
    exit 1
fi

# Check if test file is executable
if [ ! -x "$test_file" ]; then
    print_error "Test file not executable: $test_file"
    print_info "Run: chmod +x $test_file"
    exit 1
fi

# Get test info
test_name=$(basename "$test_file" .sh)
test_dir=$(dirname "$test_file")

print_info "Running single test: $test_name"
echo

# Create fresh tenant for this test run
echo "=== Test Environment Setup ==="

TEST_TENANT_NAME="test-$(date +%s)"

print_info "Creating test tenant: $TEST_TENANT_NAME"

# Verify global monk command is available
if ! command -v monk >/dev/null 2>&1; then
    print_error "Global monk command not found. Please run: npm link"
    exit 1
fi

# Check if API server is running and start if needed
print_info "Checking API server status..."
if server_status=$(monk servers current 2>/dev/null | grep "Status:" | awk '{print $2}'); then
    if [ "$server_status" = "down" ]; then
        print_info "API server is stopped, starting it..."
        
        # Compile TypeScript
        print_info "Compiling TypeScript..."
        if npm run compile >/dev/null 2>&1; then
            print_success "Compilation successful"
        else
            print_error "Compilation failed"
            exit 1
        fi
        
        # Start API server in background
        print_info "Starting API server in background..."
        npm run api:start >/dev/null 2>&1 &
        API_SERVER_PID=$!
        
        # Wait a moment for server to start
        sleep 2
        
        # Verify server is responding
        print_info "Verifying server startup..."
        if monk ping >/dev/null 2>&1; then
            print_success "API server is running and responding"
        else
            print_error "API server failed to start or not responding"
            # Clean up background process
            kill $API_SERVER_PID 2>/dev/null || true
            exit 1
        fi
    else
        print_success "API server is already running"
    fi
else
    print_warning "Could not check server status, assuming server is available"
fi

# Create tenant with root user (but don't authenticate - let test file handle auth)
if output=$(monk tenant create "$TEST_TENANT_NAME" 2>&1); then
    print_success "Test tenant created: $TEST_TENANT_NAME"
else
    print_error "Failed to create test tenant"
    echo "Error output:"
    echo "$output" | sed 's/^/  /'
    exit 1
fi

# Export tenant name for test file to use
export TEST_TENANT_NAME

print_info "Test tenant: $TEST_TENANT_NAME (available to test file)"
echo "========================"
echo

# Run the test
start_time=$(date +%s)

# Change to test directory and run the test
if (cd "$test_dir" && "./$(basename "$test_file")"); then
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    # Always cleanup the test tenant we created
    if [ -n "$TEST_TENANT_NAME" ]; then
        echo
        print_info "Cleaning up test tenant: $TEST_TENANT_NAME"
        if monk tenant delete "$TEST_TENANT_NAME" >/dev/null 2>&1; then
            print_success "Test tenant cleaned up"
        else
            print_info "Test tenant cleanup failed (non-fatal)"
        fi
    fi
    
    echo
    print_success "Test passed: $test_name (${duration}s)"
    exit 0
else
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    # Always cleanup the test tenant we created
    if [ -n "$TEST_TENANT_NAME" ]; then
        echo
        print_info "Cleaning up test tenant: $TEST_TENANT_NAME"
        monk auth logout >/dev/null 2>&1 || true
        monk tenant delete "$TEST_TENANT_NAME" >/dev/null 2>&1 || true
    fi
    
    echo
    print_error "Test failed: $test_name (${duration}s)"
    exit 1
fi