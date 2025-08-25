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
if ACCOUNT_RESULT=$(cat "$(dirname "$0")/../schemas/account.yaml" | monk meta create schema 2>&1); then
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

# Test 2: Create contact schema
print_step "Creating contact schema"
if CONTACT_RESULT=$(cat "$(dirname "$0")/../schemas/contact.yaml" | monk meta create schema 2>&1); then
    # Validate YAML response
    if echo "$CONTACT_RESULT" | grep -q "title: Contact" && echo "$CONTACT_RESULT" | grep -q "type: object"; then
        print_success "Contact schema created successfully (YAML response)"
        CONTACT_TITLE=$(echo "$CONTACT_RESULT" | grep "^title:" | cut -d' ' -f2-)
        print_info "  Schema Title: $CONTACT_TITLE"
        print_info "  Response Format: YAML"
    else
        print_error "Contact schema returned invalid YAML"
        print_info "Response: $CONTACT_RESULT"
        exit 1
    fi
else
    print_error "Contact schema creation failed"
    print_info "Error: $CONTACT_RESULT"
    exit 1
fi

echo

# Test 3: Verify schemas can be retrieved individually (since listing will move to data API)
print_step "Verifying individual schema retrieval"

# Test account schema retrieval
if ACCOUNT_GET=$(monk meta get schema account 2>&1); then
    if echo "$ACCOUNT_GET" | grep -q "title: Account"; then
        print_success "Account schema retrievable via meta API"
    else
        print_error "Account schema retrieval failed"
        print_info "Response: $ACCOUNT_GET"
        exit 1
    fi
else
    print_error "Account schema get failed"
    exit 1
fi

# Test contact schema retrieval
if CONTACT_GET=$(monk meta get schema contact 2>&1); then
    if echo "$CONTACT_GET" | grep -q "title: Contact"; then
        print_success "Contact schema retrievable via meta API"
    else
        print_error "Contact schema retrieval failed"
        print_info "Response: $CONTACT_GET"
        exit 1
    fi
else
    print_error "Contact schema get failed"
    exit 1
fi

echo
print_success "🎉 Schema creation test completed successfully!"

# Logout (cleanup handled by test-one.sh)
logout_user

echo
echo "Test Summary:"
echo "  Account Schema: $ACCOUNT_TITLE (YAML)"
echo "  Contact Schema: $CONTACT_TITLE (YAML)"
echo "  Both schemas retrievable via meta API"