#!/bin/bash
set -e

# Recursive Schema Discovery Integration Test
# Tests: schema creation → data API visibility → schema deletion → data API removal
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"

# Source auth helper for authentication utilities
source "$(dirname "$0")/../helpers/auth-helper.sh"

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

echo "=== Recursive Schema Discovery Integration Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Test 1: Check initial schema state (should only have system schema)
print_step "Checking initial schema state"
if INITIAL_SCHEMAS=$(monk data select schema); then
    INITIAL_COUNT=$(echo "$INITIAL_SCHEMAS" | jq 'length')
    SYSTEM_SCHEMA_EXISTS=$(echo "$INITIAL_SCHEMAS" | jq '[.[] | select(.name == "schema")] | length')
    
    print_success "Initial schema list retrieved"
    print_info "  Initial schema count: $INITIAL_COUNT"
    
    if [ "$SYSTEM_SCHEMA_EXISTS" -eq 1 ]; then
        print_success "System schema (self-reference) found"
    else
        print_error "System schema missing from initial state"
        exit 1
    fi
else
    print_error "Failed to retrieve initial schema list"
    exit 1
fi

echo

# Test 2: Create account schema via meta API
print_step "Creating account schema via meta API"
if cat "$(dirname "$0")/../fixtures/schema/account.json" | monk meta create schema >/dev/null 2>&1; then
    print_success "Account schema created successfully"
else
    print_error "Account schema creation failed"
    exit 1
fi

echo

# Test 3: Verify account schema appears in data API
print_step "Verifying account schema appears in data API"
if UPDATED_SCHEMAS=$(monk data select schema); then
    UPDATED_COUNT=$(echo "$UPDATED_SCHEMAS" | jq 'length')
    ACCOUNT_SCHEMA_EXISTS=$(echo "$UPDATED_SCHEMAS" | jq '[.[] | select(.name == "account")] | length')
    
    print_success "Updated schema list retrieved"
    print_info "  Updated schema count: $UPDATED_COUNT"
    
    if [ "$ACCOUNT_SCHEMA_EXISTS" -eq 1 ]; then
        print_success "Account schema visible in data API"
        ACCOUNT_STATUS=$(echo "$UPDATED_SCHEMAS" | jq -r '.[] | select(.name == "account") | .status')
        ACCOUNT_TABLE=$(echo "$UPDATED_SCHEMAS" | jq -r '.[] | select(.name == "account") | .table_name')
        print_info "  Account schema status: $ACCOUNT_STATUS"
        print_info "  Account table name: $ACCOUNT_TABLE"
    else
        print_error "Account schema not found in data API after creation"
        exit 1
    fi
    
    # Verify count increased by 1
    if [ "$UPDATED_COUNT" -eq $((INITIAL_COUNT + 1)) ]; then
        print_success "Schema count increased correctly ($INITIAL_COUNT → $UPDATED_COUNT)"
    else
        print_error "Schema count unexpected: expected=$((INITIAL_COUNT + 1)), got=$UPDATED_COUNT"
        exit 1
    fi
else
    print_error "Failed to retrieve updated schema list"
    exit 1
fi

echo

# Test 4: Delete account schema via meta API
print_step "Deleting account schema via meta API"
if monk meta delete schema account >/dev/null 2>&1; then
    print_success "Account schema deleted successfully"
else
    print_error "Account schema deletion failed"
    exit 1
fi

echo

# Test 5: Verify account schema disappears from data API
print_step "Verifying account schema disappears from data API"
if FINAL_SCHEMAS=$(monk data select schema); then
    FINAL_COUNT=$(echo "$FINAL_SCHEMAS" | jq 'length')
    ACCOUNT_SCHEMA_GONE=$(echo "$FINAL_SCHEMAS" | jq '[.[] | select(.name == "account")] | length')
    
    print_success "Final schema list retrieved"
    print_info "  Final schema count: $FINAL_COUNT"
    
    if [ "$ACCOUNT_SCHEMA_GONE" -eq 0 ]; then
        print_success "Account schema properly removed from data API"
    else
        print_error "Account schema still visible in data API after deletion"
        exit 1
    fi
    
    # Verify count returned to initial
    if [ "$FINAL_COUNT" -eq "$INITIAL_COUNT" ]; then
        print_success "Schema count restored correctly ($UPDATED_COUNT → $FINAL_COUNT)"
    else
        print_error "Schema count unexpected: expected=$INITIAL_COUNT, got=$FINAL_COUNT"
        exit 1
    fi
    
    # Verify system schema still exists
    SYSTEM_SCHEMA_STILL_EXISTS=$(echo "$FINAL_SCHEMAS" | jq '[.[] | select(.name == "schema")] | length')
    if [ "$SYSTEM_SCHEMA_STILL_EXISTS" -eq 1 ]; then
        print_success "System schema (self-reference) still present"
    else
        print_error "System schema missing after account deletion"
        exit 1
    fi
else
    print_error "Failed to retrieve final schema list"
    exit 1
fi

echo
print_success "🎉 Recursive schema discovery integration test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Test Summary:"
echo "  Initial schemas: $INITIAL_COUNT (system only)"
echo "  After creation: $UPDATED_COUNT (system + account)"
echo "  After deletion: $FINAL_COUNT (system only)"
echo "  System schema: Always present"
echo "  User schemas: Properly managed via meta API, visible via data API"
echo "  Recursive discovery: ✓ Working perfectly"