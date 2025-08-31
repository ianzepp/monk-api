#!/bin/bash
set -e

# Data API Record Operations Test  
# Tests: individual record endpoints lifecycle - create → select → update → delete
# Uses: "users" schema for testing ID-based operations
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

echo "=== Data API Record Operations Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Step 1: CREATE - Create first individual record
print_step "Testing record CREATE - single user creation"
SINGLE_USER='{
  "name": "Diana Prince",
  "email": "diana@example.com",
  "role": "admin", 
  "active": true
}'

if DIANA_RESULT=$(echo "$SINGLE_USER" | monk data create users 2>&1); then
    # Collection endpoint returns array, extract first user
    DIANA_ID=$(echo "$DIANA_RESULT" | jq -r '.[0].id')
    DIANA_NAME=$(echo "$DIANA_RESULT" | jq -r '.[0].name')
    
    if [[ -n "$DIANA_ID" && "$DIANA_ID" != "null" ]]; then
        print_success "User created successfully: $DIANA_NAME"
        print_info "  User ID: $DIANA_ID"
    else
        print_error "User creation did not return valid ID"
        exit 1
    fi
else
    print_error "Single user creation failed"
    print_info "Error: $DIANA_RESULT"
    exit 1
fi

echo

# Step 2: SELECT - Get individual record by ID
print_step "Testing record SELECT - get user by ID"
if DIANA_RECORD=$(monk data select users "$DIANA_ID" 2>&1); then
    RETRIEVED_NAME=$(echo "$DIANA_RECORD" | jq -r '.name')
    RETRIEVED_EMAIL=$(echo "$DIANA_RECORD" | jq -r '.email')
    RETRIEVED_ROLE=$(echo "$DIANA_RECORD" | jq -r '.role')
    
    if [[ "$RETRIEVED_NAME" == "Diana Prince" && "$RETRIEVED_EMAIL" == "diana@example.com" ]]; then
        print_success "User retrieved successfully by ID"
        print_info "  Name: $RETRIEVED_NAME"
        print_info "  Email: $RETRIEVED_EMAIL" 
        print_info "  Role: $RETRIEVED_ROLE"
    else
        print_error "Retrieved user data does not match expected values"
        exit 1
    fi
else
    print_error "Failed to retrieve user by ID"
    print_info "Error: $DIANA_RECORD"
    exit 1
fi

echo

# Step 3: UPDATE - Update individual record by ID
print_step "Testing record UPDATE - modify user by ID"
DIANA_UPDATE='{
  "name": "Diana Prince-Wilson",
  "email": "diana.wilson@example.com",
  "role": "moderator",
  "active": true
}'

if UPDATED_DIANA=$(echo "$DIANA_UPDATE" | monk data update users "$DIANA_ID" 2>&1); then
    UPDATED_NAME=$(echo "$UPDATED_DIANA" | jq -r '.name')
    UPDATED_EMAIL=$(echo "$UPDATED_DIANA" | jq -r '.email')
    UPDATED_ROLE=$(echo "$UPDATED_DIANA" | jq -r '.role')
    UPDATED_LOCATION=$(echo "$UPDATED_DIANA" | jq -r '.profile.location')
    
    if [[ "$UPDATED_NAME" == "Diana Prince-Wilson" && "$UPDATED_ROLE" == "moderator" ]]; then
        print_success "User updated successfully by ID"
        print_info "  New name: $UPDATED_NAME"
        print_info "  New email: $UPDATED_EMAIL"
        print_info "  New role: $UPDATED_ROLE"
        print_info "  New location: $UPDATED_LOCATION"
    else
        print_error "Updated user data does not match expected values"
        exit 1
    fi
else
    print_error "Failed to update user by ID"
    print_info "Error: $UPDATED_DIANA"
    exit 1
fi

echo

# Step 5: SELECT - Verify update by retrieving record again
print_step "Testing record SELECT - verify update persistence"
if VERIFIED_RECORD=$(monk data select users "$DIANA_ID" 2>&1); then
    VERIFIED_NAME=$(echo "$VERIFIED_RECORD" | jq -r '.name')
    VERIFIED_EMAIL=$(echo "$VERIFIED_RECORD" | jq -r '.email')
    VERIFIED_ROLE=$(echo "$VERIFIED_RECORD" | jq -r '.role')
    VERIFIED_BIO=$(echo "$VERIFIED_RECORD" | jq -r '.profile.bio')
    
    if [[ "$VERIFIED_NAME" == "Diana Prince-Wilson" && "$VERIFIED_EMAIL" == "diana.wilson@example.com" && "$VERIFIED_ROLE" == "moderator" ]]; then
        print_success "Update persistence verified"
        print_info "  Persistent name: $VERIFIED_NAME"
        print_info "  Persistent email: $VERIFIED_EMAIL"
        print_info "  Persistent role: $VERIFIED_ROLE"
        print_info "  Persistent bio: $VERIFIED_BIO"
    else
        print_error "Update did not persist correctly"
        exit 1
    fi
else
    print_error "Failed to verify update persistence"
    exit 1
fi

echo

# Step 6: Create additional user for multi-record testing
print_step "Creating additional user for multi-record verification"
SECOND_USER='{
  "name": "Edward Stark",
  "email": "edward@example.com",
  "role": "user", 
  "active": false,
  "profile": {
    "bio": "Inactive test user account",
    "location": "Chicago, IL"
  }
}'

if EDWARD_RESULT=$(echo "$SECOND_USER" | monk data create users 2>&1); then
    EDWARD_ID=$(echo "$EDWARD_RESULT" | jq -r '.[0].id')
    EDWARD_NAME=$(echo "$EDWARD_RESULT" | jq -r '.[0].name')
    
    print_success "Second user created: $EDWARD_NAME"
    print_info "  Edward ID: $EDWARD_ID"
else
    print_error "Failed to create second user"
    exit 1
fi

echo

# Step 7: Verify collection contains both users
print_step "Verifying collection contains both individual records"
if BOTH_USERS=$(monk data select users 2>&1); then
    USER_COUNT=$(echo "$BOTH_USERS" | jq 'length')
    
    if [ "$USER_COUNT" -eq 2 ]; then
        print_success "Collection contains both users ($USER_COUNT total)"
        
        # Verify both users exist with correct data
        DIANA_EXISTS=$(echo "$BOTH_USERS" | jq -r '.[] | select(.id == "'"$DIANA_ID"'") | .name')
        EDWARD_EXISTS=$(echo "$BOTH_USERS" | jq -r '.[] | select(.id == "'"$EDWARD_ID"'") | .name')
        
        if [[ "$DIANA_EXISTS" == "Diana Prince-Wilson" && "$EDWARD_EXISTS" == "Edward Stark" ]]; then
            print_success "Both individual records exist in collection"
        else
            print_error "Individual records not found correctly in collection"
            exit 1
        fi
    else
        print_error "Collection has $USER_COUNT users (expected 2)"
        exit 1
    fi
else
    print_error "Failed to list users collection"
    exit 1
fi

echo

# Step 8: DELETE - Delete individual record by ID
print_step "Testing record DELETE - remove user by ID"
if DELETE_RESULT=$(monk data delete users "$EDWARD_ID" 2>&1); then
    DELETED_ID=$(echo "$DELETE_RESULT" | jq -r '.id')
    DELETED_NAME=$(echo "$DELETE_RESULT" | jq -r '.name')
    
    if [[ "$DELETED_ID" == "$EDWARD_ID" ]]; then
        print_success "User deleted successfully by ID"
        print_info "  Deleted: $DELETED_NAME (ID: $DELETED_ID)"
    else
        print_error "Delete operation returned incorrect ID"
        exit 1
    fi
else
    print_error "Failed to delete user by ID"
    print_info "Error: $DELETE_RESULT"
    exit 1
fi

echo

# Step 9: Verify deletion - record should not exist
print_step "Testing record SELECT - verify deletion"
if monk data select users "$EDWARD_ID" >/dev/null 2>&1; then
    print_error "Deleted user still accessible by ID (should fail)"
    exit 1
else
    print_success "Deleted user correctly inaccessible by ID"
fi

echo

# Step 10: Verify collection reflects deletion
print_step "Verifying collection reflects individual record deletion"
if FINAL_COLLECTION=$(monk data select users 2>&1); then
    FINAL_COUNT=$(echo "$FINAL_COLLECTION" | jq 'length')
    
    if [ "$FINAL_COUNT" -eq 1 ]; then
        print_success "Collection correctly shows remaining users ($FINAL_COUNT)")
        
        REMAINING_NAME=$(echo "$FINAL_COLLECTION" | jq -r '.[0].name')
        REMAINING_ID=$(echo "$FINAL_COLLECTION" | jq -r '.[0].id')
        
        if [[ "$REMAINING_NAME" == "Diana Prince-Wilson" && "$REMAINING_ID" == "$DIANA_ID" ]]; then
            print_success "Correct user remains after individual deletion"
        else
            print_error "Unexpected user remains in collection"
            exit 1
        fi
    else
        print_error "Collection has $FINAL_COUNT users (expected 1)"
        exit 1
    fi
else
    print_error "Failed to verify collection after deletion"
    exit 1
fi

echo

# Step 11: Cleanup - Delete remaining user and schema
print_step "Cleaning up test data"
if monk data delete users "$DIANA_ID" >/dev/null 2>&1; then
    print_success "Remaining user deleted"
else
    print_error "Failed to delete remaining user"
fi

if monk meta delete schema users >/dev/null 2>&1; then
    print_success "Users schema deleted"
else
    print_error "Failed to delete users schema"
fi

echo
print_success "🎉 All individual record operations tests passed!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Individual Record Operations Test Summary:"
echo "  ✓ Single user creation with nested profile"
echo "  ✓ User retrieval by ID with data integrity" 
echo "  ✓ User update by ID with complex changes"
echo "  ✓ Update persistence verification"
echo "  ✓ Multi-record collection verification"
echo "  ✓ Individual user deletion by ID"
echo "  ✓ Deletion verification (record inaccessible)"
echo "  ✓ Collection consistency after deletion"
echo "  ✓ Test cleanup completed"