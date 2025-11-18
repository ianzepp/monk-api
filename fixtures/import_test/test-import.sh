#!/usr/bin/env bash
# Test script to validate SQL vs JSON fixture loading

set -e

SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$SCRIPT_DIR/../.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_header "Testing import_test Fixture Build Methods"

# Clean up any existing templates
echo "→ Cleaning up existing templates"
dropdb monk_template_import_test 2>/dev/null || true
psql -d monk -c "DELETE FROM tenants WHERE name = 'monk_import_test'" >/dev/null 2>&1 || true
print_success "Cleanup complete"

# Test 1: Build with SQL
print_header "Test 1: Build with SQL (default)"
cd "$PROJECT_ROOT"
npm run fixtures:build -- --force import_test

# Verify SQL build
sql_count=$(psql -d monk_template_import_test -t -c "SELECT COUNT(*) FROM records" 2>/dev/null | xargs)
if [[ "$sql_count" == "5" ]]; then
    print_success "SQL build successful: $sql_count records loaded"
else
    print_error "SQL build failed: expected 5 records, got $sql_count"
    exit 1
fi

# Save SQL results for comparison
psql -d monk_template_import_test -c "SELECT name, email, age, balance, is_active, status FROM records ORDER BY name" > /tmp/sql_results.txt

# Clean up for JSON test
dropdb monk_template_import_test 2>/dev/null || true
psql -d monk -c "DELETE FROM tenants WHERE name = 'monk_import_test'" >/dev/null 2>&1 || true

# Test 2: Build with JSON
print_header "Test 2: Build with JSON (via Data API)"
npm run fixtures:build -- --force --with-json import_test

# Verify JSON build
json_count=$(psql -d monk_template_import_test -t -c "SELECT COUNT(*) FROM records" 2>/dev/null | xargs)
if [[ "$json_count" == "5" ]]; then
    print_success "JSON build successful: $json_count records loaded"
else
    print_error "JSON build failed: expected 5 records, got $json_count"
    exit 1
fi

# Save JSON results for comparison
psql -d monk_template_import_test -c "SELECT name, email, age, balance, is_active, status FROM records ORDER BY name" > /tmp/json_results.txt

# Test 3: Compare results
print_header "Test 3: Compare SQL vs JSON Results"

if diff /tmp/sql_results.txt /tmp/json_results.txt > /dev/null 2>&1; then
    print_success "Results match! Both methods produce identical data"
else
    print_error "Results differ between SQL and JSON loading"
    echo "Differences:"
    diff /tmp/sql_results.txt /tmp/json_results.txt || true
    exit 1
fi

# Test 4: Validate data integrity
print_header "Test 4: Validate Data Integrity"

# Check for required fields
missing_names=$(psql -d monk_template_import_test -t -c "SELECT COUNT(*) FROM records WHERE name IS NULL OR name = ''" | xargs)
missing_emails=$(psql -d monk_template_import_test -t -c "SELECT COUNT(*) FROM records WHERE email IS NULL OR email = ''" | xargs)

if [[ "$missing_names" == "0" ]]; then
    print_success "All records have name (required field)"
else
    print_error "Found $missing_names records with missing name"
    exit 1
fi

if [[ "$missing_emails" == "0" ]]; then
    print_success "All records have email (required field)"
else
    print_error "Found $missing_emails records with missing email"
    exit 1
fi

# Check enum constraint
invalid_status=$(psql -d monk_template_import_test -t -c "SELECT COUNT(*) FROM records WHERE status NOT IN ('pending', 'active', 'inactive', 'archived')" | xargs)
if [[ "$invalid_status" == "0" ]]; then
    print_success "All status values are valid enum values"
else
    print_error "Found $invalid_status records with invalid status"
    exit 1
fi

# Cleanup
rm -f /tmp/sql_results.txt /tmp/json_results.txt

print_header "All Tests Passed!"
echo "Both SQL and JSON loading methods work correctly and produce identical results."
