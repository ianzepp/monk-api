#!/bin/bash
set -e

# Data API Collection Operations Test
# Tests: collection endpoints lifecycle - select → create → update → delete
# Uses: "users" schema for testing array-based operations
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

echo "=== Data API Collection Operations Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Step 1: SELECT - List empty collection (should return empty array)
print_step "Testing collection SELECT - empty collection"
if EMPTY_USERS=$(monk data select users 2>&1); then
    EMPTY_COUNT=$(echo "$EMPTY_USERS" | jq 'length')
    if [ "$EMPTY_COUNT" -eq 0 ]; then
        print_success "Empty collection returns empty array (length: $EMPTY_COUNT)"
    else
        print_error "Empty collection returned $EMPTY_COUNT items (expected 0)"
        exit 1
    fi
else
    print_error "Failed to list empty users collection"
    print_info "Error: $EMPTY_USERS"
    exit 1
fi

echo

# Step 2: CREATE - Add multiple users via collection endpoint
print_step "Testing collection CREATE - bulk insert"
BULK_USERS='[
  {
    "name": "Alice Johnson", 
    "email": "alice@example.com",
    "role": "admin",
    "active": true
  },
  {
    "name": "Bob Smith",
    "email": "bob@example.com", 
    "role": "user",
    "active": true
  },
  {
    "name": "Charlie Brown",
    "email": "charlie@example.com",
    "role": "guest", 
    "active": false
  }
]'

if CREATED_USERS=$(echo "$BULK_USERS" | monk data create users 2>&1); then
    CREATED_COUNT=$(echo "$CREATED_USERS" | jq 'length')
    if [ "$CREATED_COUNT" -eq 3 ]; then
        print_success "Bulk create successful ($CREATED_COUNT users created)"
        
        # Extract user IDs for later use
        ALICE_ID=$(echo "$CREATED_USERS" | jq -r '.[0].id')
        BOB_ID=$(echo "$CREATED_USERS" | jq -r '.[1].id')
        CHARLIE_ID=$(echo "$CREATED_USERS" | jq -r '.[2].id')
        
        print_info "  Alice ID: $ALICE_ID"
        print_info "  Bob ID: $BOB_ID"  
        print_info "  Charlie ID: $CHARLIE_ID"
    else
        print_error "Bulk create returned $CREATED_COUNT users (expected 3)"
        exit 1
    fi
else
    print_error "Bulk user creation failed"
    print_info "Error: $CREATED_USERS"
    exit 1
fi

echo

# Step 3: SELECT - List populated collection
print_step "Testing collection SELECT - populated collection"
if POPULATED_USERS=$(monk data select users 2>&1); then
    POPULATED_COUNT=$(echo "$POPULATED_USERS" | jq 'length')
    if [ "$POPULATED_COUNT" -eq 3 ]; then
        print_success "Collection listing successful ($POPULATED_COUNT users found)"
        
        # Verify user data integrity
        ALICE_NAME=$(echo "$POPULATED_USERS" | jq -r '.[] | select(.id == "'"$ALICE_ID"'") | .name')
        BOB_EMAIL=$(echo "$POPULATED_USERS" | jq -r '.[] | select(.id == "'"$BOB_ID"'") | .email')
        CHARLIE_ACTIVE=$(echo "$POPULATED_USERS" | jq -r '.[] | select(.id == "'"$CHARLIE_ID"'") | .active')
        
        if [[ "$ALICE_NAME" == "Alice Johnson" && "$BOB_EMAIL" == "bob@example.com" && "$CHARLIE_ACTIVE" == "false" ]]; then
            print_success "User data integrity verified"
        else
            print_error "User data integrity check failed"
            exit 1
        fi
    else
        print_error "Collection listing returned $POPULATED_COUNT users (expected 3)"
        exit 1
    fi
else
    print_error "Failed to list populated users collection"  
    print_info "Error: $POPULATED_USERS"
    exit 1
fi

echo

# Step 4: UPDATE - Bulk update via collection endpoint
print_step "Testing collection UPDATE - bulk operations"
BULK_UPDATES='[
  {
    "id": "'"$ALICE_ID"'",
    "name": "Alice Johnson-Smith",
    "email": "alice.johnson@example.com",
    "role": "admin", 
    "active": true
  },
  {
    "id": "'"$BOB_ID"'",
    "name": "Robert Smith",
    "email": "robert@example.com",
    "role": "admin",
    "active": true  
  }
]'

if UPDATED_USERS=$(echo "$BULK_UPDATES" | monk data update users 2>&1); then
    UPDATED_COUNT=$(echo "$UPDATED_USERS" | jq 'length')
    if [ "$UPDATED_COUNT" -eq 2 ]; then
        print_success "Bulk update successful ($UPDATED_COUNT users updated)"
        
        # Verify updates took effect
        ALICE_NEW_NAME=$(echo "$UPDATED_USERS" | jq -r '.[0].name')
        BOB_NEW_EMAIL=$(echo "$UPDATED_USERS" | jq -r '.[] | select(.name == "Robert Smith") | .email')
        
        if [[ "$ALICE_NEW_NAME" == "Alice Johnson-Smith" && "$BOB_NEW_EMAIL" == "robert@example.com" ]]; then
            print_success "Bulk update data integrity verified"
        else
            print_error "Bulk update data integrity check failed"
            exit 1
        fi
    else
        print_error "Bulk update returned $UPDATED_COUNT users (expected 2)"
        exit 1
    fi
else
    print_error "Bulk user update failed"
    print_info "Error: $UPDATED_USERS"
    exit 1
fi

echo

# Step 5: SELECT - Verify updates in collection
print_step "Testing collection SELECT - verify updates"
if UPDATED_COLLECTION=$(monk data select users 2>&1); then
    FINAL_COUNT=$(echo "$UPDATED_COLLECTION" | jq 'length')
    if [ "$FINAL_COUNT" -eq 3 ]; then
        print_success "Collection still contains all users ($FINAL_COUNT)")
        
        # Check specific updated values
        ALICE_UPDATED=$(echo "$UPDATED_COLLECTION" | jq -r '.[] | select(.id == "'"$ALICE_ID"'") | .name')
        BOB_UPDATED=$(echo "$UPDATED_COLLECTION" | jq -r '.[] | select(.id == "'"$BOB_ID"'") | .email')
        
        if [[ "$ALICE_UPDATED" == "Alice Johnson-Smith" && "$BOB_UPDATED" == "robert@example.com" ]]; then
            print_success "Collection reflects bulk updates correctly"
        else
            print_error "Collection does not reflect bulk updates"
            exit 1
        fi
    else
        print_error "Collection count changed unexpectedly ($FINAL_COUNT)")
        exit 1
    fi
else
    print_error "Failed to verify updated collection"
    exit 1
fi

echo

# Step 6: DELETE - Bulk delete via collection endpoint  
print_step "Testing collection DELETE - bulk operations"
BULK_DELETES='[
  {"id": "'"$ALICE_ID"'"},
  {"id": "'"$CHARLIE_ID"'"}  
]'

if DELETED_RESULT=$(echo "$BULK_DELETES" | monk data delete users 2>&1); then
    DELETED_COUNT=$(echo "$DELETED_RESULT" | jq 'length')
    if [ "$DELETED_COUNT" -eq 2 ]; then
        print_success "Bulk delete successful ($DELETED_COUNT users deleted)"
    else
        print_error "Bulk delete returned $DELETED_COUNT results (expected 2)"
        exit 1
    fi
else
    print_error "Bulk user deletion failed"
    print_info "Error: $DELETED_RESULT"
    exit 1
fi

echo

# Step 7: SELECT - Verify deletions in collection
print_step "Testing collection SELECT - verify deletions"
if REMAINING_USERS=$(monk data select users 2>&1); then
    REMAINING_COUNT=$(echo "$REMAINING_USERS" | jq 'length')
    if [ "$REMAINING_COUNT" -eq 1 ]; then
        print_success "Collection shows remaining users ($REMAINING_COUNT)")
        
        # Verify correct user remains
        REMAINING_NAME=$(echo "$REMAINING_USERS" | jq -r '.[0].name')
        REMAINING_ID=$(echo "$REMAINING_USERS" | jq -r '.[0].id')
        
        if [[ "$REMAINING_NAME" == "Robert Smith" && "$REMAINING_ID" == "$BOB_ID" ]]; then
            print_success "Correct user remains after bulk delete"
        else
            print_error "Unexpected user remains after bulk delete"
            exit 1
        fi
    else
        print_error "Collection has $REMAINING_COUNT users (expected 1)"
        exit 1
    fi
else
    print_error "Failed to verify collection after deletions"
    exit 1
fi

echo

# Step 8: Cleanup - Delete remaining user  
print_step "Cleaning up test data"
if echo '[{"id": "'"$BOB_ID"'"}]' | monk data delete users >/dev/null 2>&1; then
    print_success "Remaining user deleted"
else
    print_error "Failed to delete remaining user"
fi

echo
print_success "🎉 All collection operations tests passed!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Collection Operations Test Summary:"
echo "  ✓ Empty collection listing"
echo "  ✓ Bulk user creation (3 users)"
echo "  ✓ Populated collection listing"
echo "  ✓ Data integrity verification"
echo "  ✓ Bulk user updates (2 users)"
echo "  ✓ Update verification in collection"
echo "  ✓ Bulk user deletion (2 users)"
echo "  ✓ Deletion verification in collection"
echo "  ✓ Test cleanup completed"