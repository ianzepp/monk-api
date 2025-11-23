#!/usr/bin/env bash
set -e

# Find API Basic Test
# Tests the POST /api/find/:model endpoint with empty filter to verify basic functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API basic functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "basic-find"
setup_full_auth

# Test 1: Basic empty filter test - should return all records
print_step "Testing POST /api/find/account with empty filter"

# Empty filter should return all account records from template
empty_filter='{}'

response=$(auth_post "api/find/account" "$empty_filter")
data=$(extract_and_validate_data "$response" "Find API response")

# Verify we get records back (template has 5 accounts)
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Empty filter returned all $record_count account records"
else
    print_warning "Expected 5 account records from template, got: $record_count"
fi

# Verify structure of returned records
first_record=$(echo "$data" | jq -r '.[0]')
if [[ "$first_record" != "null" ]]; then
    validate_record_fields "$first_record" "id" "name" "email"
    validate_system_timestamps "$first_record"
    print_success "Find API returned properly structured records"
else
    test_fail "Find API returned empty or invalid record data"
fi

print_success "Find API basic functionality tests completed successfully"
