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

# Cleanup function for test environment
cleanup_test_environment() {
    # Cleanup test tenant
    if [ -n "$TEST_TENANT_NAME" ]; then
        print_info "Cleaning up test tenant: $TEST_TENANT_NAME"
        monk auth logout >/dev/null 2>&1 || true
        monk root tenant delete "$TEST_TENANT_NAME" >/dev/null 2>&1 || true
    fi
    
    # Kill API server if we started it
    if [ -n "$API_SERVER_PID" ]; then
        print_info "Stopping test API server (PID: $API_SERVER_PID)"
        kill $API_SERVER_PID 2>/dev/null || true
        wait $API_SERVER_PID 2>/dev/null || true
    fi
    
    # Clean up temporary CLI config directory
    if [ -n "$TEST_CLI_CONFIG" ] && [ -d "$TEST_CLI_CONFIG" ]; then
        print_info "Cleaning up test CLI config: $TEST_CLI_CONFIG"
        rm -rf "$TEST_CLI_CONFIG" 2>/dev/null || true
    fi
}

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

# Create temporary CLI config directory
TEST_CLI_CONFIG="/tmp/monk-test-$$"
export MONK_CLI_CONFIG_DIR="$TEST_CLI_CONFIG"
print_info "Using isolated CLI config: $TEST_CLI_CONFIG"

# Check if this is an infrastructure test that doesn't need tenant setup
if [[ "$test_file" == */0[0-9]-* ]]; then
    print_info "Infrastructure test detected - running without tenant setup"
    echo
    
    # Run test directly without tenant lifecycle management
    start_time=$(date +%s)
    
    if (cd "$test_dir" && "./$(basename "$test_file")"); then
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        echo
        print_success "Test passed: $test_name (${duration}s)"
        exit 0
    else
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        echo
        print_error "Test failed: $test_name (${duration}s)"
        exit 1
    fi
fi

# Create fresh tenant for integration tests
echo "=== Test Environment Setup ==="

TEST_TENANT_NAME="test-$(date +%s)"
print_info "Creating test tenant: $TEST_TENANT_NAME"

# Set up isolated test environment
print_info "Setting up isolated test environment..."

# Verify global monk command is available
if ! command -v monk >/dev/null 2>&1; then
    print_error "Global monk command not found. Please run: npm link"
    exit 1
fi

# Find available port for test server
find_available_port() {
    local start_port=$1
    local end_port=${2:-$((start_port + 99))}
    
    for port in $(seq $start_port $end_port); do
        if ! lsof -i :$port >/dev/null 2>&1; then
            echo $port
            return 0
        fi
    done
    
    print_error "No available ports in range $start_port-$end_port"
    exit 1
}

TEST_PORT=$(find_available_port 9101)
print_info "Using test port: $TEST_PORT"

# Initialize isolated CLI configuration
print_info "Initializing isolated CLI configuration..."
if monk init >/dev/null 2>&1; then
    print_success "CLI configuration initialized"
else
    print_error "Failed to initialize CLI configuration"
    exit 1
fi

# Create test environment configuration
cat > "$TEST_CLI_CONFIG/env.json" << EOF
{
  "DATABASE_URL": "postgresql://ianzepp:ianzepp@localhost:5432/",
  "NODE_ENV": "test",
  "PORT": "$TEST_PORT",
  "JWT_SECRET": "test-jwt-secret-$(date +%s)"
}
EOF

# Check if API server is running and start if needed
print_info "Starting API server on test port $TEST_PORT..."
# Compile TypeScript
print_info "Compiling TypeScript..."
if npm run compile >/dev/null 2>&1; then
    print_success "Compilation successful"
else
    print_error "Compilation failed"
    exit 1
fi

# Start API server in background on test port
print_info "Starting API server on port $TEST_PORT..."
PORT=$TEST_PORT npm run start >/dev/null 2>&1 &
API_SERVER_PID=$!

# Wait for server to start and check if process is still running
sleep 5

# Verify the API server process is still running
if ! kill -0 $API_SERVER_PID 2>/dev/null; then
    print_error "API server process died during startup"
    exit 1
fi

print_info "API server process running (PID: $API_SERVER_PID)"

# Test direct connectivity before CLI ping
print_info "Testing direct HTTP connectivity..."
if curl -s "http://localhost:$TEST_PORT/health" >/dev/null 2>&1; then
    print_success "Direct HTTP connectivity works"
else
    print_error "Direct HTTP connectivity failed"
    kill $API_SERVER_PID 2>/dev/null || true
    exit 1
fi

# Add test server to CLI configuration
print_info "Configuring CLI for test server..."
if monk server add test-local "localhost:$TEST_PORT" --description "Test server" >/dev/null 2>&1; then
    print_success "Test server added to CLI config"
else
    print_error "Failed to add test server to CLI config"
    kill $API_SERVER_PID 2>/dev/null || true
    exit 1
fi

# Use the test server
if monk server use test-local >/dev/null 2>&1; then
    print_success "Switched to test server"
else
    print_error "Failed to switch to test server"
    kill $API_SERVER_PID 2>/dev/null || true
    exit 1
fi

# Verify server is responding
print_info "Verifying server connectivity..."
if monk server ping >/dev/null 2>&1; then
    print_success "API server is running and responding on port $TEST_PORT"
else
    print_error "API server failed to start or not responding"
    kill $API_SERVER_PID 2>/dev/null || true
    exit 1
fi

# Create tenant with root user (but don't authenticate - let test file handle auth)
if output=$(monk root tenant create "$TEST_TENANT_NAME" 2>&1); then
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
    
    # Cleanup test environment
    echo
    cleanup_test_environment
    
    echo
    print_success "Test passed: $test_name (${duration}s)"
    exit 0
else
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    # Cleanup test environment
    echo
    cleanup_test_environment
    
    echo
    print_error "Test failed: $test_name (${duration}s)"
    exit 1
fi