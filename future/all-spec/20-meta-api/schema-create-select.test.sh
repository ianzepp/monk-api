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
if ACCOUNT_RESULT=$(cat "$(dirname "$0")/../fixtures/schema/account.json" | monk meta create schema 2>&1); then
    # Validate YAML response
    if echo "$ACCOUNT_RESULT" | grep -q "title: Account" && echo "$ACCOUNT_RESULT" | grep -q "type: object"; then
        print_success "Account schema created successfully (YAML response)"
        ACCOUNT_TITLE=$(echo "$ACCOUNT_RESULT" | grep "^title:" | cut -d' ' -f2-)
        print_info "  Schema Title: $ACCOUNT_TITLE"
        print_info "  Response Format: YAML"
    else
        print_error "Account schema returned invalid YAML"
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
if RETRIEVED_RESULT=$(monk meta select schema account 2>&1); then
    # Check if result is valid YAML
    if echo "$RETRIEVED_RESULT" | grep -q "title: Account" && echo "$RETRIEVED_RESULT" | grep -q "type: object"; then
        print_success "Account schema retrieved successfully (YAML response)"
        
        # Extract key fields for verification
        RETRIEVED_TITLE=$(echo "$RETRIEVED_RESULT" | grep "^title:" | cut -d' ' -f2-)
        RETRIEVED_TYPE=$(echo "$RETRIEVED_RESULT" | grep "^type:" | cut -d' ' -f2-)
        
        print_info "  Retrieved Title: $RETRIEVED_TITLE"
        print_info "  Retrieved Type: $RETRIEVED_TYPE"
        print_info "  Response Format: YAML"
        
        # Verify titles match
        if [ "$ACCOUNT_TITLE" = "$RETRIEVED_TITLE" ]; then
            print_success "Schema titles match (create → retrieve)"
        else
            print_error "Schema title mismatch: created=$ACCOUNT_TITLE, retrieved=$RETRIEVED_TITLE"
            exit 1
        fi
        
        # Verify key schema properties are present in YAML
        if echo "$RETRIEVED_RESULT" | grep -q "description:" && echo "$RETRIEVED_RESULT" | grep -q "properties:"; then
            print_success "Schema contains expected YAML structure"
            
            # Extract description and required fields for verification
            DESCRIPTION=$(echo "$RETRIEVED_RESULT" | grep "^description:" | cut -d' ' -f2- | tr -d '"')
            REQUIRED_FIELDS=$(echo "$RETRIEVED_RESULT" | sed -n '/^required:/,/^[a-z]/p' | grep "  -" | sed 's/.*- //' | tr '\n' ',' | sed 's/,$//')
            
            print_info "  Description: $DESCRIPTION"
            print_info "  Required fields: $REQUIRED_FIELDS"
            
            # Verify key account schema properties
            if echo "$DESCRIPTION" | grep -q "User account schema"; then
                print_success "Schema description matches expected content"
            else
                print_error "Schema description doesn't match expected content"
                print_info "Expected: contains 'User account schema'"
                print_info "Found: $DESCRIPTION"
                exit 1
            fi
            
            if echo "$REQUIRED_FIELDS" | grep -q "name" && echo "$REQUIRED_FIELDS" | grep -q "email"; then
                print_success "Schema required fields include expected account fields"
            else
                print_error "Schema required fields missing expected account fields"
                print_info "Expected: name, email, username, account_type"
                print_info "Found: $REQUIRED_FIELDS"
                exit 1
            fi
            
        else
            print_error "Schema missing expected YAML structure"
            exit 1
        fi
        
    else
        print_error "Retrieved schema is not valid YAML"
        print_info "Response: $RETRIEVED_RESULT"
        exit 1
    fi
else
    print_error "Account schema retrieval failed"
    print_info "Error: $RETRIEVED_RESULT"
    exit 1
fi

echo

# Test 3: Verify YAML round-trip consistency
print_step "Testing YAML round-trip consistency"

# Save both JSON files for comparison
echo "$ACCOUNT_RESULT" > "/tmp/created-schema.json"
echo "$RETRIEVED_RESULT" > "/tmp/retrieved-schema.json"

# Basic validation that both contain the same key properties
if grep -q '"title":"Account"' "/tmp/created-schema.json" && grep -q '"title":"Account"' "/tmp/retrieved-schema.json"; then
    if grep -q '"username"' "/tmp/created-schema.json" && grep -q '"username"' "/tmp/retrieved-schema.json"; then
        print_success "JSON round-trip preserves key schema properties"
        print_info "  Both schemas contain: title, username, required fields"
    else
        print_error "JSON round-trip missing expected properties"
        exit 1
    fi
else
    print_error "JSON round-trip title mismatch"
    exit 1
fi

# Clean up temp files
rm -f "/tmp/created-schema.json" "/tmp/retrieved-schema.json"

echo
print_success "🎉 Schema create and select test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Test Summary:"
echo "  Schema Created: account"
echo "  Schema Title: $ACCOUNT_TITLE"
echo "  Create/Retrieve Title Match: ✓"
echo "  YAML Round-trip: ✓"
echo "  Schema Properties Verified: ✓"