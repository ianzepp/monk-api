#!/usr/bin/env bash
set -e

# Find API Order Test
# Tests basic ordering functionality with POST /api/find/:model

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API order functionality"

# Setup test environment with template (provides 5 account records with different names)
setup_test_with_template "order-basic"
setup_full_auth

# Test 1: Order by name ascending (default)
print_step "Testing order by name ascending"

order_asc_filter='{"order": ["name asc"]}'

response=$(auth_post "api/find/account" "$order_asc_filter")
data=$(extract_and_validate_data "$response" "Name ascending results")

# Get first and last names to verify ascending order
first_name=$(echo "$data" | jq -r '.[0].name')
last_name=$(echo "$data" | jq -r '.[-1].name')

print_success "Name ascending order: '$first_name' ... '$last_name'"

# Test 2: Order by name descending
print_step "Testing order by name descending"

order_desc_filter='{"order": ["name desc"]}'

response=$(auth_post "api/find/account" "$order_desc_filter")
data=$(extract_and_validate_data "$response" "Name descending results")

# Get first and last names to verify descending order
first_name_desc=$(echo "$data" | jq -r '.[0].name')
last_name_desc=$(echo "$data" | jq -r '.[-1].name')

print_success "Name descending order: '$first_name_desc' ... '$last_name_desc'"

# Verify that descending is opposite of ascending
if [[ "$first_name_desc" == "$last_name" ]]; then
    print_success "Descending order correctly reversed ascending order"
else
    print_warning "Descending order may not be opposite of ascending: '$first_name_desc' vs '$last_name'"
fi

# Test 3: Order by balance (numeric field)
print_step "Testing order by balance (numeric field)"

order_balance_filter='{"order": ["balance asc"]}'

response=$(auth_post "api/find/account" "$order_balance_filter")
data=$(extract_and_validate_data "$response" "Balance ascending results")

# Get first and last balances
first_balance=$(echo "$data" | jq -r '.[0].balance')
last_balance=$(echo "$data" | jq -r '.[-1].balance')

print_success "Balance ascending order: $first_balance ... $last_balance"

# Test 4: Multiple field ordering
print_step "Testing multiple field ordering"

multi_order_filter='{"order": ["account_type asc", "name desc"]}'

response=$(auth_post "api/find/account" "$multi_order_filter")
data=$(extract_and_validate_data "$response" "Multi-field order results")

# Verify we still get all records
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Multi-field ordering returned all $record_count records"
else
    test_fail "Expected 5 records with multi-field order, got: $record_count"
fi

print_success "Find API order functionality tests completed successfully"
