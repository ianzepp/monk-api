#!/bin/bash
set -e

# Schema Create Test - Deploy predefined test schemas
# Tests: account schema creation → contact schema creation → JSON validation
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

echo "=== Schema Create Test ==="
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
if ACCOUNT_RESULT=$(cat tests/schemas/account.yaml | monk meta create schema 2>&1); then
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

# Test 2: Create contact schema
print_step "Creating contact schema"
if CONTACT_RESULT=$(cat tests/schemas/contact.yaml | monk meta create schema 2>&1); then
    # Validate JSON response
    if echo "$CONTACT_RESULT" | jq . >/dev/null 2>&1; then
        CONTACT_ID=$(echo "$CONTACT_RESULT" | jq -r '.id // empty')
        CONTACT_NAME=$(echo "$CONTACT_RESULT" | jq -r '.name // empty')
        
        if [ -n "$CONTACT_ID" ] && [ -n "$CONTACT_NAME" ]; then
            print_success "Contact schema created successfully"
            print_info "  Schema ID: $CONTACT_ID"
            print_info "  Schema Name: $CONTACT_NAME"
        else
            print_error "Contact schema response missing required fields"
            print_info "Response: $CONTACT_RESULT"
            exit 1
        fi
    else
        print_error "Contact schema returned invalid JSON"
        print_info "Response: $CONTACT_RESULT"
        exit 1
    fi
else
    print_error "Contact schema creation failed"
    print_info "Error: $CONTACT_RESULT"
    exit 1
fi

echo

# Test 3: Verify both schemas are registered
print_step "Verifying schema registration"
if SCHEMA_LIST=$(monk meta list schema 2>&1); then
    if echo "$SCHEMA_LIST" | jq . >/dev/null 2>&1; then
        SCHEMA_COUNT=$(echo "$SCHEMA_LIST" | jq 'length')
        SCHEMA_NAMES=$(echo "$SCHEMA_LIST" | jq -r '.[].name' | tr '\n' ' ')
        
        print_success "Schema list retrieved successfully"
        print_info "  Schema count: $SCHEMA_COUNT"
        print_info "  Schema names: $SCHEMA_NAMES"
        
        # Verify our schemas are in the list
        if echo "$SCHEMA_LIST" | jq -r '.[].name' | grep -q "^account$"; then
            print_success "Account schema found in registry"
        else
            print_error "Account schema not found in registry"
            exit 1
        fi
        
        if echo "$SCHEMA_LIST" | jq -r '.[].name' | grep -q "^contact$"; then
            print_success "Contact schema found in registry"
        else
            print_error "Contact schema not found in registry"
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
print_success "🎉 Schema creation test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Test Summary:"
echo "  Account Schema ID: $ACCOUNT_ID"
echo "  Contact Schema ID: $CONTACT_ID"
echo "  Total Schemas: $SCHEMA_COUNT"