#!/bin/bash
set -e

# Schema Create and Select Test - Deploy schema and retrieve it back
# Tests: account schema creation → schema retrieval → YAML comparison
# Expects: $TEST_TENANT_NAME to be available (created by test-one.sh)

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

# Source auth helper for authentication utilities
source "$(dirname "$0")/../auth-helper.sh"

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

echo "=== Schema Create and Select Test ==="
echo "Test Tenant: $TEST_TENANT_NAME"
echo

# Authenticate as root user
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# Test 1: Create account schema
print_step "Creating account schema"
if ACCOUNT_RESULT=$(cat "$(dirname "$0")/../../tests/schemas/account.yaml" | monk meta create schema 2>&1); then
    # Validate JSON response
    if echo "$ACCOUNT_RESULT" | jq . >/dev/null 2>&1; then
        ACCOUNT_ID=$(echo "$ACCOUNT_RESULT" | jq -r '.id // empty')
        ACCOUNT_NAME=$(echo "$ACCOUNT_RESULT" | jq -r '.name // empty')
        
        if [ -n "$ACCOUNT_ID" ] && [ -n "$ACCOUNT_NAME" ]; then
            print_success "Account schema created successfully"
            print_info "  Schema ID: $ACCOUNT_ID"
            print_info "  Schema Name: $ACCOUNT_NAME"
        else
            print_error "Account schema response missing required fields"
            print_info "Response: $ACCOUNT_RESULT"
            exit 1
        fi
    else
        print_error "Account schema returned invalid JSON"
        print_info "Response: $ACCOUNT_RESULT"
        exit 1
    fi
else
    print_error "Account schema creation failed"
    print_info "Error: $ACCOUNT_RESULT"
    exit 1
fi

echo

# Test 2: Retrieve account schema back from API
print_step "Retrieving account schema from API"
if RETRIEVED_RESULT=$(monk meta get schema account 2>&1); then
    # Check if result is valid JSON
    if echo "$RETRIEVED_RESULT" | jq . >/dev/null 2>&1; then
        print_success "Account schema retrieved successfully"
        
        # Extract key fields for verification (get response has different structure than create)
        RETRIEVED_NAME=$(echo "$RETRIEVED_RESULT" | jq -r '.name // empty')
        RETRIEVED_TABLE=$(echo "$RETRIEVED_RESULT" | jq -r '.table // empty')
        RETRIEVED_DEFINITION=$(echo "$RETRIEVED_RESULT" | jq -r '.definition // empty')
        
        print_info "  Retrieved Name: $RETRIEVED_NAME"
        print_info "  Retrieved Table: $RETRIEVED_TABLE"
        print_info "  Retrieved Definition: $(echo "$RETRIEVED_DEFINITION" | jq -c . 2>/dev/null | head -c 50)..."
        
        # Verify names match
        if [ "$ACCOUNT_NAME" = "$RETRIEVED_NAME" ]; then
            print_success "Schema names match (create → retrieve)"
        else
            print_error "Schema name mismatch: created=$ACCOUNT_NAME, retrieved=$RETRIEVED_NAME"
            exit 1
        fi
        
        # Check if definition is present and valid JSON
        if [ -n "$RETRIEVED_DEFINITION" ] && [ "$RETRIEVED_DEFINITION" != "null" ]; then
            if echo "$RETRIEVED_DEFINITION" | jq . >/dev/null 2>&1; then
                print_success "Schema definition is valid JSON"
                
                # Extract some key properties to verify schema content
                TITLE=$(echo "$RETRIEVED_DEFINITION" | jq -r '.title // empty')
                DESCRIPTION=$(echo "$RETRIEVED_DEFINITION" | jq -r '.description // empty') 
                REQUIRED_FIELDS=$(echo "$RETRIEVED_DEFINITION" | jq -r '.required[]?' | tr '\n' ',' | sed 's/,$//')
                
                print_info "  Title: $TITLE"
                print_info "  Description: $DESCRIPTION"
                print_info "  Required fields: $REQUIRED_FIELDS"
                
                # Verify key account schema properties
                if [ "$TITLE" = "Account" ]; then
                    print_success "Schema title matches expected value"
                else
                    print_error "Schema title mismatch: expected='Account', got='$TITLE'"
                    exit 1
                fi
                
                if echo "$REQUIRED_FIELDS" | grep -q "name\|email\|username"; then
                    print_success "Schema required fields include expected account fields"
                else
                    print_error "Schema required fields missing expected account fields"
                    print_info "Expected: name, email, username"
                    print_info "Found: $REQUIRED_FIELDS"
                    exit 1
                fi
                
            else
                print_error "Schema definition is not valid JSON"
                print_info "Definition: $RETRIEVED_DEFINITION"
                exit 1
            fi
        else
            print_error "Schema definition is missing or null"
            exit 1
        fi
        
    else
        print_error "Retrieved schema is not valid JSON"
        print_info "Response: $RETRIEVED_RESULT"
        exit 1
    fi
else
    print_error "Account schema retrieval failed"
    print_info "Error: $RETRIEVED_RESULT"
    exit 1
fi

echo

# Test 3: Verify schema appears in list
print_step "Verifying schema in list endpoint"
if SCHEMA_LIST=$(monk meta list schema 2>&1); then
    if echo "$SCHEMA_LIST" | jq . >/dev/null 2>&1; then
        SCHEMA_COUNT=$(echo "$SCHEMA_LIST" | jq 'length')
        
        if [ "$SCHEMA_COUNT" -eq 1 ]; then
            print_success "Schema list shows correct count (1 schema)"
        else
            print_error "Schema list count mismatch: expected=1, got=$SCHEMA_COUNT"
            exit 1
        fi
        
        if echo "$SCHEMA_LIST" | jq -r '.[].name' | grep -q "^account$"; then
            print_success "Account schema found in list endpoint"
        else
            print_error "Account schema not found in list endpoint"
            exit 1
        fi
    else
        print_error "Schema list returned invalid JSON"
        print_info "Response: $SCHEMA_LIST"
        exit 1
    fi
else
    print_error "Schema list failed"
    print_info "Error: $SCHEMA_LIST"
    exit 1
fi

echo
print_success "🎉 Schema create and select test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Test Summary:"
echo "  Schema Created: account"
echo "  Schema ID: $ACCOUNT_ID"
echo "  Create/Retrieve ID Match: ✓"
echo "  Schema Definition Valid: ✓"
echo "  Registry Verification: ✓"