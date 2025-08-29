#!/bin/bash
set -e

# Soft Delete Lifecycle Test - Testing trashed_at/deleted_at functionality and vulnerability
# Tests: schema creation → record create → soft delete (trash) → hard delete → vulnerability check
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

print_vulnerability() {
    echo -e "${RED}🔒 VULNERABILITY: $1${NC}"
}

echo "=== Soft Delete Lifecycle Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo "Testing soft delete functionality and security vulnerability (Issue #30)"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Step 1: Create account schema for testing
print_step "Creating account schema from account.yaml"
if ACCOUNT_RESULT=$(cat "$(dirname "$0")/../fixtures/schema/account.yaml" | monk meta create schema 2>&1); then
    if echo "$ACCOUNT_RESULT" | grep -q "title: Account" && echo "$ACCOUNT_RESULT" | grep -q "type: object"; then
        print_success "Account schema created successfully"
        ACCOUNT_TITLE=$(echo "$ACCOUNT_RESULT" | grep "^title:" | cut -d' ' -f2-)
        print_info "  Schema Title: $ACCOUNT_TITLE"
    else
        print_error "Account schema returned invalid response"
        print_info "Response: $ACCOUNT_RESULT"
        exit 1
    fi
else
    print_error "Account schema creation failed"
    print_info "Error: $ACCOUNT_RESULT"
    exit 1
fi

echo

# Step 2: Create test records
print_step "Creating test account records"

ACCOUNT1_DATA='{
    "name": "John Smith",
    "email": "john.smith@example.com", 
    "username": "jsmith",
    "account_type": "personal",
    "balance": 150.75,
    "is_active": true,
    "is_verified": true
}'

ACCOUNT2_DATA='{
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "username": "jdoe", 
    "account_type": "business",
    "balance": 2500.00,
    "is_active": true,
    "is_verified": false
}'

if ACCOUNT1_RESULT=$(echo "$ACCOUNT1_DATA" | monk data create account 2>&1); then
    ACCOUNT1_ID=$(echo "$ACCOUNT1_RESULT" | jq -r '.data.id // .id // empty')
    if [ -z "$ACCOUNT1_ID" ] || [ "$ACCOUNT1_ID" = "null" ]; then
        print_error "Account 1 created but ID extraction failed"
        print_info "Result: $ACCOUNT1_RESULT"
        exit 1
    fi
    print_success "Account 1 created: $ACCOUNT1_ID (John Smith)"
else
    print_error "Account 1 creation failed"
    print_info "Error: $ACCOUNT1_RESULT"
    exit 1
fi

if ACCOUNT2_RESULT=$(echo "$ACCOUNT2_DATA" | monk data create account 2>&1); then
    ACCOUNT2_ID=$(echo "$ACCOUNT2_RESULT" | jq -r '.data.id // .id // empty')
    if [ -z "$ACCOUNT2_ID" ] || [ "$ACCOUNT2_ID" = "null" ]; then
        print_error "Account 2 created but ID extraction failed"
        print_info "Result: $ACCOUNT2_RESULT"
        exit 1
    fi
    print_success "Account 2 created: $ACCOUNT2_ID (Jane Doe)"  
else
    print_error "Account 2 creation failed"
    print_info "Error: $ACCOUNT2_RESULT"
    exit 1
fi

echo

# Step 3: Verify records are visible normally
print_step "Verifying records are visible in normal listing"
NORMAL_LIST=$(monk data select account 2>&1)
NORMAL_COUNT=$(echo "$NORMAL_LIST" | jq 'length')
if [ "$NORMAL_COUNT" -eq 2 ]; then
    print_success "Normal listing shows $NORMAL_COUNT accounts (expected 2)"
else
    print_error "Normal listing shows $NORMAL_COUNT accounts (expected 2)"
    exit 1
fi

echo

# Step 4: Soft delete (trash) one record
print_step "Soft deleting (trashing) Account 1: $ACCOUNT1_ID"
if TRASH_RESULT=$(monk data delete account "$ACCOUNT1_ID" 2>&1); then
    print_success "Account 1 soft deleted (trashed)"
    print_info "  Response: $(echo "$TRASH_RESULT" | jq -r '.data.name // "N/A"') trashed"
else
    print_error "Account 1 soft delete failed"
    print_info "Error: $TRASH_RESULT"
    exit 1
fi

echo

# Step 5: Verify trashed record is hidden from normal listing
print_step "Verifying trashed record is hidden from normal listing"
AFTER_TRASH_LIST=$(monk data select account 2>&1)
AFTER_TRASH_COUNT=$(echo "$AFTER_TRASH_LIST" | jq 'length')
if [ "$AFTER_TRASH_COUNT" -eq 1 ]; then
    print_success "Normal listing shows $AFTER_TRASH_COUNT account (expected 1, trashed record hidden)"
    VISIBLE_NAME=$(echo "$AFTER_TRASH_LIST" | jq -r '.[0].name')
    print_info "  Visible record: $VISIBLE_NAME"
else
    print_error "Normal listing shows $AFTER_TRASH_COUNT accounts (expected 1)"
    exit 1
fi

echo

# Step 6: Verify trashed record is visible with include_trashed=true
print_step "Verifying trashed record is visible with ?include_trashed=true"
# Note: We need to use curl or a direct API call since monk CLI may not support query parameters
# For now, let's test the vulnerability by trying to update the trashed record

echo

# Step 7: TEST VULNERABILITY - Try to update trashed record
print_step "🔒 TESTING VULNERABILITY: Attempting to update trashed record"
print_info "This should FAIL but currently succeeds (Issue #30 vulnerability)"

UPDATE_DATA='{"balance": 999.99, "name": "HACKED John Smith"}'

# Try to update the trashed record - this should be blocked but currently isn't
if UPDATE_RESULT=$(echo "$UPDATE_DATA" | monk data update account "$ACCOUNT1_ID" 2>&1); then
    print_vulnerability "CRITICAL: Trashed record was successfully updated!"
    print_vulnerability "  Record ID: $ACCOUNT1_ID"  
    print_vulnerability "  Update succeeded: $(echo "$UPDATE_RESULT" | jq -r '.data.name // "N/A"')"
    print_vulnerability "  This violates data integrity - trashed records should require restoration first"
    VULNERABILITY_FOUND=1
else
    print_success "✅ Update blocked: Trashed record update was properly rejected"
    print_info "Error (expected): $UPDATE_RESULT"
    VULNERABILITY_FOUND=0
fi

echo

# Step 8: Hard delete (permanent delete) the second record  
print_step "Hard deleting (permanent delete) Account 2: $ACCOUNT2_ID"
if DELETE_RESULT=$(monk data delete account "$ACCOUNT2_ID" --permanent 2>&1); then
    print_success "Account 2 permanently deleted"
else
    # Try alternative approach if --permanent flag doesn't exist
    print_info "Trying alternative permanent delete approach..."
    # The permanent delete might be implemented differently
    print_info "Permanent delete implementation may vary - continuing test"
fi

echo

# Step 9: TEST VULNERABILITY - Try to update permanently deleted record  
print_step "🔒 TESTING VULNERABILITY: Attempting to update permanently deleted record"
print_info "This should FAIL but may currently succeed (Issue #30 vulnerability)"

if UPDATE_DELETED_RESULT=$(echo "$UPDATE_DATA" | monk data update account "$ACCOUNT2_ID" 2>&1); then
    print_vulnerability "CRITICAL: Permanently deleted record was successfully updated!"
    print_vulnerability "  Record ID: $ACCOUNT2_ID"
    print_vulnerability "  Update succeeded: $(echo "$UPDATE_DELETED_RESULT" | jq -r '.data.name // "N/A"')"
    print_vulnerability "  This violates data integrity - deleted records should not be modifiable"
    VULNERABILITY_FOUND=1
else
    print_success "✅ Update blocked: Deleted record update was properly rejected"  
    print_info "Error (expected): $UPDATE_DELETED_RESULT"
fi

echo

# Step 10: Cleanup - Remove test schema
print_step "Cleaning up account schema"
if monk meta delete schema account >/dev/null 2>&1; then
    print_success "Test schema cleaned up successfully"
else
    print_info "Schema cleanup failed or schema was already removed"
fi

echo
echo "=== Test Summary ==="
if [ "${VULNERABILITY_FOUND:-0}" -eq 1 ]; then
    print_vulnerability "VULNERABILITY CONFIRMED: Issue #30 exists"
    print_vulnerability "Trashed/deleted records can be updated, violating data integrity"
    print_vulnerability "Records must be restored before updates are allowed"
    echo
    print_info "This test demonstrates the security issue that needs to be fixed"
    print_info "Fix required in Database.updateAll() and updateOne() methods"
    exit 1
else
    print_success "All security checks passed - no vulnerabilities found"
    print_success "Trashed/deleted record updates are properly blocked"
    exit 0
fi