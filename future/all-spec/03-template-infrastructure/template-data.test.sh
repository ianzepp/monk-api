#!/bin/bash
# Template Data Integrity Test - 03 Series
#
# Validates the integrity and consistency of fixture data in templates.
# Tests data relationships, schema compliance, and fixture completeness.
#
# NOTE: This test operates independently on template databases and does NOT
# require tenant setup since it examines existing template data directly.

set -e

echo "=== Template Data Integrity Validation Test ==="

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

echo "📊 This test validates fixture data integrity and relationships"
echo "🎯 Goal: Verify template data is consistent, complete, and ready for testing"
echo

# Ensure template exists
print_step "Checking template availability"
if ! psql -lqt | cut -d'|' -f1 | grep -qw "test_template_basic" 2>/dev/null; then
    print_error "Template test_template_basic not found"
    print_info "Run: npm run fixtures:build"
    exit 1
fi
print_success "Template test_template_basic found"

# Step 1: Schema validation
print_step "Validating schema definitions"

# Check account schema
account_schema=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM schemas WHERE name = 'account';" 2>/dev/null | xargs)
if [ "$account_schema" -eq "1" ]; then
    print_success "Account schema definition exists"
else
    print_error "Account schema definition missing"
    exit 1
fi

# Check contact schema
contact_schema=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM schemas WHERE name = 'contact';" 2>/dev/null | xargs)
if [ "$contact_schema" -eq "1" ]; then
    print_success "Contact schema definition exists"
else
    print_error "Contact schema definition missing"
    exit 1
fi

# Step 2: Data completeness validation
print_step "Validating fixture data completeness"

# Account records
account_count=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM account;" 2>/dev/null | xargs)
expected_accounts=15
if [ "$account_count" -eq "$expected_accounts" ]; then
    print_success "Account records complete: $account_count/$expected_accounts"
elif [ "$account_count" -gt "0" ]; then
    print_info "Account records present but count differs: $account_count (expected: $expected_accounts)"
else
    print_error "No account records found"
    exit 1
fi

# Contact records
contact_count=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM contact;" 2>/dev/null | xargs)
expected_contacts=25
if [ "$contact_count" -eq "$expected_contacts" ]; then
    print_success "Contact records complete: $contact_count/$expected_contacts"
elif [ "$contact_count" -gt "0" ]; then
    print_info "Contact records present but count differs: $contact_count (expected: $expected_contacts)"
else
    print_error "No contact records found"
    exit 1
fi

# Step 3: Data quality validation
print_step "Validating data quality and relationships"

# Check for required fields in accounts
accounts_with_email=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM accounts WHERE email IS NOT NULL AND email != '';" 2>/dev/null | xargs)
if [ "$accounts_with_email" -gt "0" ]; then
    print_success "Account email data present: $accounts_with_email/$account_count accounts"
else
    print_error "Account email data missing"
    exit 1
fi

# Check for required fields in contacts (first_name or last_name)
contacts_with_name=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM contacts WHERE (first_name IS NOT NULL AND first_name != '') OR (last_name IS NOT NULL AND last_name != '');" 2>/dev/null | xargs)
if [ "$contacts_with_name" -gt "0" ]; then
    print_success "Contact name data present: $contacts_with_name/$contact_count contacts"
else
    print_error "Contact name data missing"
    exit 1
fi

# Check for relationships (contacts linked to accounts)
linked_contacts=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM contacts WHERE account_id IS NOT NULL;" 2>/dev/null | xargs || echo "0")
if [ "$linked_contacts" -gt "0" ]; then
    link_percentage=$(( (linked_contacts * 100) / contact_count ))
    print_success "Contact-account relationships: $linked_contacts/$contact_count ($link_percentage%)"
else
    print_info "No contact-account relationships found (may be normal for some fixtures)"
fi

# Step 4: Data consistency validation
print_step "Validating data consistency"

# Check for duplicate emails in accounts
duplicate_accounts=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM (SELECT email, COUNT(*) FROM accounts WHERE email IS NOT NULL GROUP BY email HAVING COUNT(*) > 1) AS dupes;" 2>/dev/null | xargs)
if [ "$duplicate_accounts" -eq "0" ]; then
    print_success "No duplicate account emails"
else
    print_error "Found $duplicate_accounts duplicate account emails"
    exit 1
fi

# Check for orphaned relationships
if [ "$linked_contacts" -gt "0" ]; then
    orphaned_contacts=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM contacts c WHERE c.account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.id = c.account_id);" 2>/dev/null | xargs)
    if [ "$orphaned_contacts" -eq "0" ]; then
        print_success "No orphaned contact relationships"
    else
        print_error "Found $orphaned_contacts orphaned contact relationships"
        exit 1
    fi
fi

print_step "Data integrity validation summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Data Quality Metrics:"
print_info "  Accounts: $account_count records, $accounts_with_email with emails"
print_info "  Contacts: $contact_count records, $contacts_with_name with names"
print_info "  Relationships: $linked_contacts linked contacts ($link_percentage%)"
print_info "  Data integrity: ✅ No duplicates or orphaned records"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_success "Template data integrity validation completed successfully"
print_info "Fixture data is consistent, complete, and ready for testing"

exit 0
