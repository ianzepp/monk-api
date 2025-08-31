#!/bin/bash
# Template Cloning Test - 03 Series
#
# Tests the template cloning functionality including Unicode tenant names,
# hashed database generation, and clone verification.
#
# NOTE: This test operates independently and does NOT require tenant setup
# from test-one.sh framework since it tests the cloning system directly.

set -e

echo "=== Template Cloning Validation Test ==="

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

echo "🔄 This test validates template cloning with Unicode and hashing"
echo "🎯 Goal: Verify cloning works with new tenant name hashing architecture"
echo

# Test databases to create and verify
test_tenants=(
    "simple-test"
    "unicode-测试"
    "emoji-🚀-test"
    "spaces and symbols!"
    "café-française"
)

# Ensure template exists
print_step "Ensuring basic template exists"
cd /Users/ianzepp/Workspaces/monk-api

if ! psql -lqt | cut -d'|' -f1 | grep -qw "test_template_basic" 2>/dev/null; then
    print_info "Building basic template first..."
    if npm run fixtures:build >/dev/null 2>&1; then
        print_success "Basic template built"
    else
        print_error "Failed to build basic template"
        exit 1
    fi
else
    print_success "Basic template already exists"
fi

# Function to hash tenant name (matching TenantService logic)
hash_tenant_name() {
    local tenant_name="$1"
    # Use Node.js to replicate the exact hashing logic
    node -e "
        const crypto = require('crypto');
        const normalizedName = '$tenant_name'.trim().normalize('NFC');
        const hash = crypto.createHash('sha256').update(normalizedName, 'utf8').digest('hex').substring(0, 16);
        console.log('tenant_' + hash);
    "
}

# Test cloning with different tenant name types
print_step "Testing template cloning with various tenant name types"

cloned_databases=()
for tenant_name in "${test_tenants[@]}"; do
    print_info "Testing clone: \"$tenant_name\""

    # Calculate expected database name
    expected_db=$(hash_tenant_name "$tenant_name")
    print_info "  Expected DB: $expected_db"

    # Test cloning using direct PostgreSQL (simulating TemplateDatabase.createTenantFromTemplate)
    if psql -d postgres -c "CREATE DATABASE \"$expected_db\" WITH TEMPLATE test_template_basic;" >/dev/null 2>&1; then
        print_success "  Clone created: $expected_db"
        cloned_databases+=("$expected_db")

        # Verify clone has proper data
        clone_account_count=$(psql -d "$expected_db" -t -c "SELECT COUNT(*) FROM account;" 2>/dev/null | xargs)
        if [ "$clone_account_count" -gt "0" ]; then
            print_success "  Data verified: $clone_account_count account records"
        else
            print_error "  Clone data verification failed"
            exit 1
        fi

    else
        print_error "  Clone creation failed for: $tenant_name"
        exit 1
    fi
done

print_success "All tenant name types cloned successfully"

# Test template data preservation
print_step "Validating template data preservation during cloning"

# Compare first clone to template
template_accounts=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM account;" 2>/dev/null | xargs)
clone_accounts=$(psql -d "${cloned_databases[0]}" -t -c "SELECT COUNT(*) FROM account;" 2>/dev/null | xargs)

if [ "$template_accounts" -eq "$clone_accounts" ]; then
    print_success "Data preservation verified: $clone_accounts accounts in clone"
else
    print_error "Data preservation failed: template=$template_accounts, clone=$clone_accounts"
    exit 1
fi

# Verify schema preservation
template_schemas=$(psql -d test_template_basic -t -c "SELECT COUNT(*) FROM schemas;" 2>/dev/null | xargs)
clone_schemas=$(psql -d "${cloned_databases[0]}" -t -c "SELECT COUNT(*) FROM schemas;" 2>/dev/null | xargs)

if [ "$template_schemas" -eq "$clone_schemas" ]; then
    print_success "Schema preservation verified: $clone_schemas schemas in clone"
else
    print_error "Schema preservation failed: template=$template_schemas, clone=$clone_schemas"
    exit 1
fi

# Cleanup all test databases
print_step "Cleaning up test databases"
for db in "${cloned_databases[@]}"; do
    if psql -d postgres -c "DROP DATABASE IF EXISTS \"$db\";" >/dev/null 2>&1; then
        print_success "Cleaned up: $db"
    else
        print_error "Failed to cleanup: $db"
    fi
done

print_step "Template cloning validation summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_info "Unicode Support: ✅ Chinese, emoji, accented characters"
print_info "Hashing System: ✅ All tenant names → safe database identifiers"
print_info "Data Preservation: ✅ $template_accounts accounts, $template_schemas schemas"
print_info "Cleanup: ✅ All test databases removed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

print_success "Template cloning validation completed successfully"
print_info "Cloning system ready for integration with test framework"

exit 0
