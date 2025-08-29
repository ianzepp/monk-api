#!/bin/bash
set -e

# ===================================================================
# EXAMPLE TEST SCRIPT - Recommended Pattern for Monk API Tests
# ===================================================================
#
# This script demonstrates the recommended pattern for writing test
# scripts that use tenant-based authentication with the Monk API.
#
# Key Principles:
# - Test tenant created by test-one.sh (available as $TEST_TENANT_NAME)
# - Test files handle their own authentication scenarios
# - Support for multi-user authentication testing
# - Clean separation of concerns between layers
#
# Usage:
#   ./scripts/test-one.sh test/test-example.sh
#   ./scripts/test-all.sh (includes this test)
#
# Requirements:
#   - Monk API server running (npm start)
#   - monk CLI available in PATH
#   - Run via test-one.sh (provides $TEST_TENANT_NAME)
#
# ===================================================================

# Auto-configure test environment
source "$(dirname "$0")/test-env-setup.sh"

# Source auth helper for tenant management
source "$(dirname "$0")/auth-helper.sh"

# Colors for output (if not already defined)
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
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

# Test configuration
echo "=== Example Test Script ==="
echo "This demonstrates the recommended test pattern for Monk API"
echo

# ===================================================================
# STEP 1: VERIFY SETUP - Check tenant is available and authenticate
# ===================================================================

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_step "Verifying test environment"
print_info "Using test tenant: $TEST_TENANT_NAME"

# Authenticate as root user (primary test user)
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# ===================================================================
# STEP 2: RUN YOUR TESTS - All tests use the same authenticated session
# ===================================================================

print_step "Test Case 1: Basic API Operations"
# Example: Test ping (already authenticated)
if monk server ping >/dev/null 2>&1; then
    print_success "Ping test passed"
else
    print_error "Ping test failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 2: Meta API Operations"
# Example: List schemas (should return empty array for new tenant)
if schema_result=$(monk meta list 2>/dev/null); then
    print_success "Meta list schemas successful"
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Schema result: $schema_result"
    fi
else
    print_error "Meta list schemas failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 3: Authentication Status Check"
# Example: Verify authentication status
if monk auth status >/dev/null 2>&1; then
    print_success "Authentication status verified"
else
    print_error "Authentication status check failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 4: Token Information"
# Example: Check JWT token contents (optional)
if monk auth info >/dev/null 2>&1; then
    print_success "JWT token information accessible"
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "JWT details:"
        monk auth info 2>/dev/null | sed 's/^/  /'
    fi
else
    print_error "JWT token information failed"
    cleanup_auth
    exit 1
fi

print_step "Test Case 5: Multi-User Authentication Example"
# Create a test user with limited access
if create_test_user "alice" "read"; then
    # Test switching between users
    if auth_as_user "alice"; then
        print_success "Switched to alice user"
        
        # Alice can read but not create (this should work)
        if monk meta list >/dev/null 2>&1; then
            print_success "Alice can read schemas"
        else
            print_error "Alice cannot read schemas"
            exit 1
        fi
        
        # Switch back to root
        if auth_as_user "root"; then
            print_success "Switched back to root user"
        else
            print_error "Failed to switch back to root"
            exit 1
        fi
    else
        print_error "Failed to authenticate as alice"
        exit 1
    fi
else
    print_info "Multi-user test skipped (user creation failed)"
fi

print_step "Test Case 6: Custom Test Logic"
# Add your specific test cases here
# Examples:
# - monk data create user_schema < test-data.json
# - monk data list user_schema
# - monk meta create schema < schema.yaml
# - etc.

# Simulate a custom test
sleep 0.5  # Simulate test work
print_success "Custom test logic completed"

echo

# ===================================================================
# STEP 3: CLEANUP - Logout (tenant cleanup handled by test-one.sh)
# ===================================================================

print_step "Logging out current user"
logout_user
print_success "User logout completed"

echo
print_success "🎉 All example tests passed!"
print_info "Test tenant $TEST_TENANT_NAME cleanup handled by test-one.sh"

# ===================================================================
# PATTERN SUMMARY FOR REFERENCE:
# ===================================================================
cat << 'EOF'

📋 THREE-LAYER ARCHITECTURE:
=============================

Layer 1: test-all.sh (Orchestrator)
- Pattern matching and test discovery
- Delegates execution to test-one.sh
- Aggregates results and reporting

Layer 2: test-one.sh (Tenant Manager)
- Creates unique test tenant
- Exports TEST_TENANT_NAME to test file
- Executes individual test file
- Cleans up tenant after completion

Layer 3: Individual Test Files (Authentication & Logic)
- Handle their own authentication scenarios
- Can switch between multiple users
- Focus on test logic and verification

NEW TEST FILE PATTERN:
======================

1. Check tenant availability:
   if [ -z "$TEST_TENANT_NAME" ]; then
       print_error "Run via scripts/test-one.sh"
       exit 1
   fi

2. Source auth helper:
   source "$(dirname "$0")/../helpers/auth-helper.sh"

3. Authenticate and run tests:
   auth_as_user "root"              # Authenticate as root
   monk meta list                   # Test as root
   
   create_test_user "alice" "read"  # Create limited user
   auth_as_user "alice"             # Switch to alice
   monk meta list                   # Test as alice
   
   auth_as_user "root"              # Switch back to root

4. Logout (optional):
   logout_user

Available Helper Functions:
- auth_as_user(username)     : Authenticate as specific user in tenant
- create_test_user(name, access) : Create additional user in tenant  
- test_connectivity()        : Test ping/connectivity
- logout_user()              : Logout current user

Global Variables:
- $TEST_TENANT_NAME          : Tenant name (set by test-one.sh)

Usage Examples:
- scripts/test-one.sh test/my-test.sh
- scripts/test-all.sh 10-20
- scripts/test-all.sh connection

EOF