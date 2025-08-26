#!/bin/bash
set -e

# Schema Protection Test - Comprehensive API boundary enforcement
# Tests: meta API protection + data API protection + normal operations still work
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

echo "=== Schema Protection Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Test 1: Verify recursive discovery works (baseline)
print_step "Verifying recursive schema discovery works"
if SCHEMA_LIST=$(monk data list schema 2>&1); then
    SCHEMA_COUNT=$(echo "$SCHEMA_LIST" | jq 'length')
    print_success "Schema discovery working ($SCHEMA_COUNT schemas found)"
else
    print_error "Schema discovery failed"
    print_info "Error: $SCHEMA_LIST"
    exit 1
fi

echo

# Test 2: Meta API Protection Tests
print_step "Testing meta API protection against system schema modifications"

# Test 2a: Try to create schema named "schema" (should fail)
print_step "  Testing meta create protection"
if echo 'title: Schema\ntype: object\nproperties:\n  test:\n    type: string' | monk meta create schema >/dev/null 2>&1; then
    print_error "Meta API allowed creation of reserved schema name (should be blocked)"
    exit 1
else
    print_success "Meta API properly blocks creation of reserved schema name"
fi

# Test 2b: Try to delete system schema (should fail)  
print_step "  Testing meta delete protection"
if monk meta delete schema schema >/dev/null 2>&1; then
    print_error "Meta API allowed deletion of system schema (should be blocked)"
    exit 1
else
    print_success "Meta API properly blocks deletion of system schema"
fi

echo

# Test 3: Data API Protection Tests  
print_step "Testing data API protection against system table modifications"

# Test 3a: Try to create records in schema table (should fail)
print_step "  Testing data create protection"
if echo '[{"name":"test","table_name":"test_table","status":"active"}]' | monk data create schema >/dev/null 2>&1; then
    print_error "Data API allowed record creation in system table (should be blocked)"
    exit 1
else
    print_success "Data API properly blocks record creation in system table"
fi

# Test 3b: Try to update records in schema table (should fail)
SCHEMA_ID=$(echo "$SCHEMA_LIST" | jq -r '.[0].id')
print_step "  Testing data update protection (ID: ${SCHEMA_ID:0:8}...)"
if echo '{"name":"modified"}' | monk data update schema "$SCHEMA_ID" >/dev/null 2>&1; then
    print_error "Data API allowed record update in system table (should be blocked)"
    exit 1
else
    print_success "Data API properly blocks record updates in system table"
fi

# Test 3c: Try to delete records in schema table (should fail)
print_step "  Testing data delete protection (ID: ${SCHEMA_ID:0:8}...)"
if monk data delete schema "$SCHEMA_ID" >/dev/null 2>&1; then
    print_error "Data API allowed record deletion in system table (should be blocked)"
    exit 1
else
    print_success "Data API properly blocks record deletion in system table"
fi

echo

# Test 4: Verify normal operations still work
print_step "Testing that normal schema operations still work"

# Test 4a: Create user schema (should work)
print_step "  Creating account schema via meta API"
if cat "$(dirname "$0")/../fixtures/schema/account.yaml" | monk meta create schema >/dev/null 2>&1; then
    print_success "User schema creation works normally"
else
    print_error "User schema creation failed (should work)"
    exit 1
fi

# Test 4b: Create data in user schema (should work)
print_step "  Creating account record via data API"
if echo '{"name":"John Doe","email":"john@test.com","username":"jdoe","account_type":"personal"}' | monk data create account >/dev/null 2>&1; then
    print_success "User schema data operations work normally"
else
    print_error "User schema data operations failed (should work)"
    exit 1
fi

# Test 4c: Verify schemas are discoverable
print_step "  Verifying updated schema discovery"
if UPDATED_LIST=$(monk data list schema 2>&1); then
    UPDATED_COUNT=$(echo "$UPDATED_LIST" | jq 'length')
    ACCOUNT_EXISTS=$(echo "$UPDATED_LIST" | jq '[.[] | select(.name == "account")] | length')
    
    if [ "$UPDATED_COUNT" -eq 2 ] && [ "$ACCOUNT_EXISTS" -eq 1 ]; then
        print_success "Schema discovery reflects new user schema (2 total: system + account)"
    else
        print_error "Schema discovery not reflecting changes correctly"
        exit 1
    fi
else
    print_error "Schema discovery failed after user schema creation"
    exit 1
fi

# Test 4d: Clean up user schema (should work)
print_step "  Deleting account schema via meta API"
if monk meta delete schema account >/dev/null 2>&1; then
    print_success "User schema deletion works normally"
else
    print_error "User schema deletion failed (should work)"
    exit 1
fi

echo
print_success "🎉 Comprehensive schema protection test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Test Summary:"
echo "  Meta API Protection: ✓ (blocks system schema modifications)"
echo "  Data API Protection: ✓ (blocks system table record operations)"
echo "  Normal Operations: ✓ (user schemas work correctly)"
echo "  Schema Discovery: ✓ (recursive discovery functional)"
echo "  API Boundaries: ✓ (clean separation maintained)"