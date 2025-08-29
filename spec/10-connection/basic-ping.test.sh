#!/bin/bash
set -e

# Basic Ping Test - No Authentication Required
# Tests server connectivity without authentication to verify infrastructure
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

echo "=== Basic Connection Test ==="
echo "Testing server connectivity and API response"
echo

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"
print_info "Testing both HTTP and CLI connectivity"
echo

# Test 1: Direct HTTP connectivity (fundamental)
print_step "Test 1: Direct HTTP connectivity"
if current_server=$(monk server current 2>/dev/null | grep "Endpoint:" | awk '{print $2}'); then
    print_info "Testing endpoint: $current_server"
    
    if response=$(curl -s "$current_server/" 2>/dev/null); then
        if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
            api_name=$(echo "$response" | jq -r '.data.name // "API"')
            api_version=$(echo "$response" | jq -r '.data.version // "unknown"')
            print_success "HTTP connectivity working: $api_name v$api_version"
        else
            print_error "HTTP response invalid JSON"
            exit 1
        fi
    else
        print_error "HTTP connectivity failed"
        exit 1
    fi
else
    print_error "Could not determine server endpoint"
    exit 1
fi

# Test 2: CLI server ping (validates CLI integration)
print_step "Test 2: CLI server ping"
if monk server ping >/dev/null 2>&1; then
    print_success "CLI server ping successful"
else
    print_error "CLI server ping failed"
    exit 1
fi

# Test 3: JSON server ping with detailed metadata
print_step "Test 3: JSON server ping with connectivity metadata"
ping_json=$(monk server ping --json 2>/dev/null || echo '{"error": "ping failed"}')
if echo "$ping_json" | jq -e '.success' >/dev/null 2>&1; then
    print_success "Server ping JSON response received"
    
    # Extract connectivity metadata
    if server_name=$(echo "$ping_json" | jq -r '.server_name // "unknown"' 2>/dev/null); then
        print_info "Server: $server_name"
    fi
    if endpoint=$(echo "$ping_json" | jq -r '.endpoint // "unknown"' 2>/dev/null); then
        print_info "Endpoint: $endpoint"
    fi
    if response_time=$(echo "$ping_json" | jq -r '.response_time_ms // "unknown"' 2>/dev/null); then
        print_info "Response time: ${response_time}ms"
    fi
else
    print_error "Invalid server ping JSON response"
    print_info "Got: $ping_json"
    exit 1
fi

# Test 4: Server endpoint validation
print_step "Test 4: Verify server endpoint accessibility"
if monk server current >/dev/null 2>&1; then
    current_server=$(monk server current 2>/dev/null | grep "Endpoint:" | awk '{print $2}')
    print_success "Server endpoint accessible"
    print_info "Endpoint: $current_server"
else
    print_error "Server endpoint check failed"
    exit 1
fi

echo
print_success "All basic ping tests passed!"
print_info "Server connectivity verified without authentication"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"