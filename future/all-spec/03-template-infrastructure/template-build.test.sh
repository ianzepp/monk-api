#!/bin/bash
# Template Build Test - 03 Series
#
# Validates that the template building system works correctly.
# Tests template creation, database initialization, and fixture data loading.
#
# NOTE: This test runs independently of API server - only tests database operations.
# It does NOT require tenant setup from test-one.sh framework since it operates
# directly on template databases.

set -e

echo "=== Template Build Validation Test ==="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

echo "🏗️ This test validates the template building infrastructure"
echo "🎯 Goal: Verify templates can be built, contain proper data, and are ready for cloning"
echo

# Step 1: Clean any existing basic template
print_step "Cleaning existing basic template (if any)"
if psql -d postgres -c "DROP DATABASE IF EXISTS test_template_basic;" >/dev/null 2>&1; then
    print_success "Cleaned any existing basic template"
else
    print_info "No existing template to clean (normal)"
fi

# Step 2: Build basic template
print_step "Building basic template"
cd /Users/ianzepp/Workspaces/monk-api
if npm run fixtures:build >/dev/null 2>&1; then
    print_success "Template build command completed"
else
    print_error "Template build command failed"
    exit 1
fi

# Step 3: Verify template database exists
print_step "Verifying template database creation"
if psql -lqt | cut -d'|' -f1 | grep -qw "test_template_basic" 2>/dev/null; then
    print_success "Template database exists: test_template_basic"
else
    print_error "Template database was not created"
    exit 1
fi

# Step 4: Check template database structure
print_step "Validating template database structure"

# Check for required system tables
if psql -d test_template_basic -c "SELECT 1 FROM schemas LIMIT 1;" >/dev/null 2>&1; then
    print_success "Schema table exists and accessible"
else
    print_error "Schema table missing or inaccessible"
    exit 1
fi

if psql -d test_template_basic -c "SELECT 1 FROM users LIMIT 1;" >/dev/null 2>&1; then
    print_success "Users table exists and accessible"
else
    print_error "Users table missing or inaccessible"
    exit 1
fi

# Step 5: Validate fixture data content
print_step "Validating fixture data content"

# Check account records
account_count=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM accounts;" 2>/dev/null | xargs || echo "0")
if [ "$account_count" -gt "0" ]; then
    print_success "Account data loaded: $account_count records"
else
    print_error "No account data found in template"
    exit 1
fi

# Check contact records
contact_count=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM contacts;" 2>/dev/null | xargs || echo "0")
if [ "$contact_count" -gt "0" ]; then
    print_success "Contact data loaded: $contact_count records"
else
    print_error "No contact data found in template"
    exit 1
fi

# Step 6: Validate schema definitions
print_step "Validating schema definitions in template"
schema_count=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM schemas WHERE name IN ('account', 'contact');" 2>/dev/null | xargs || echo "0")
if [ "$schema_count" -eq "2" ]; then
    print_success "Schema definitions present: account and contact"
else
    print_error "Schema definitions missing or incomplete (found: $schema_count/2)"
    exit 1
fi

# Step 7: Test template listing
print_step "Testing template discovery"
cd /Users/ianzepp/Workspaces/monk-api
if template_list=$(npm run fixtures:list 2>/dev/null | grep "basic"); then
    print_success "Template discovery working: basic template found"
else
    print_error "Template discovery failed - basic template not found"
    exit 1
fi

print_step "Template validation summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Template: test_template_basic"
print_info "Account records: $account_count"
print_info "Contact records: $contact_count"
print_info "Schema definitions: $schema_count/2"
print_info "Total fixture data: $((account_count + contact_count)) records"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_success "Template build validation completed successfully"
print_info "Template infrastructure is ready for fast test cloning"

exit 0
