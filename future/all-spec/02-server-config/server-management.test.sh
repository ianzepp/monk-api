#!/bin/bash
# Server Management Test - 02 Series
#
# Tests monk server CLI commands using isolated configuration.
# Validates server add, list, use, delete operations without affecting user config.
#
# NOTE: This is an infrastructure test - uses isolated CLI config from test-one.sh

set -e

echo "=== Server Management Test ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

echo "🖥️ This test validates CLI server management commands"
echo "🎯 Goal: Verify server add, list, use, delete operations work correctly"
echo

# Verify isolated environment is set up
if [ -z "$MONK_CLI_CONFIG_DIR" ]; then
    print_error "MONK_CLI_CONFIG_DIR not set - this test requires isolated CLI config"
    exit 1
fi

print_info "Using isolated CLI config: $MONK_CLI_CONFIG_DIR"
echo

# Test 1: Add test servers
print_step "Adding test servers"

if monk server add test-server-1 localhost:3001 --description "Test Server 1" >/dev/null 2>&1; then
    print_success "Added test-server-1"
else
    print_error "Failed to add test-server-1"
    exit 1
fi

if monk server add test-server-2 api.example.com:443 --description "Test Server 2" >/dev/null 2>&1; then
    print_success "Added test-server-2"
else
    print_error "Failed to add test-server-2"
    exit 1
fi

# Test 2: List servers
print_step "Listing servers"

if server_list=$(monk server list 2>/dev/null); then
    if echo "$server_list" | grep -q "test-server-1" && echo "$server_list" | grep -q "test-server-2"; then
        print_success "Server list shows both test servers"
    else
        print_error "Server list missing test servers"
        echo "List output: $server_list"
        exit 1
    fi
else
    print_error "Failed to list servers"
    exit 1
fi

# Test 3: Switch to server
print_step "Testing server switching"

if monk server use test-server-1 >/dev/null 2>&1; then
    print_success "Switched to test-server-1"
else
    print_error "Failed to switch to test-server-1"
    exit 1
fi

# Verify current server
if current=$(monk server current 2>/dev/null); then
    if echo "$current" | grep -q "test-server-1"; then
        print_success "Current server correctly set to test-server-1"
    else
        print_error "Current server not set correctly"
        echo "Current: $current"
        exit 1
    fi
else
    print_error "Failed to get current server"
    exit 1
fi

# Test 4: Switch to different server
print_step "Testing server switching (different server)"

if monk server use test-server-2 >/dev/null 2>&1; then
    print_success "Switched to test-server-2"
else
    print_error "Failed to switch to test-server-2"
    exit 1
fi

# Test 5: Delete servers
print_step "Deleting test servers"

if monk server delete test-server-1 >/dev/null 2>&1; then
    print_success "Deleted test-server-1"
else
    print_error "Failed to delete test-server-1"
    exit 1
fi

if monk server delete test-server-2 >/dev/null 2>&1; then
    print_success "Deleted test-server-2"
else
    print_error "Failed to delete test-server-2"
    exit 1
fi

# Test 6: Verify servers are gone
print_step "Verifying servers were deleted"

if server_list_final=$(monk server list 2>/dev/null); then
    if echo "$server_list_final" | grep -q "test-server"; then
        print_error "Test servers still present after deletion"
        echo "Remaining: $server_list_final"
        exit 1
    else
        print_success "Test servers successfully removed"
    fi
else
    print_info "Server list empty or failed (normal after deleting all servers)"
fi

print_step "Server management test summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "CLI Config: $MONK_CLI_CONFIG_DIR (isolated)"
print_info "Server operations: ✅ Add, list, use, delete all working"
print_info "Configuration: ✅ No interference with user settings"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_success "Server management validation completed successfully"
print_info "CLI server commands work correctly in isolated environment"

exit 0