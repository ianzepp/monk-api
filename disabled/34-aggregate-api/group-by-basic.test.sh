#!/usr/bin/env bash
# Test: Aggregate API - GROUP BY aggregation
# Purpose: Verify GROUP BY with aggregations works

set -e
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Aggregate API - GROUP BY"

# Setup
setup_test_with_template "aggregate-group-by"
setup_full_auth

# Create test records with different account types
print_step "Creating test records with different account types"
for i in {1..8}; do
    auth_post "api/data/account" "[{\"name\": \"Personal ${i}\", \"email\": \"personal${i}@test.com\", \"username\": \"personal${i}\", \"account_type\": \"personal\", \"balance\": 0}]" > /dev/null
done

for i in {1..5}; do
    auth_post "api/data/account" "[{\"name\": \"Business ${i}\", \"email\": \"business${i}@test.com\", \"username\": \"business${i}\", \"account_type\": \"business\", \"balance\": 0}]" > /dev/null
done

# Test 1: GROUP BY single field
print_step "Test 1: GROUP BY account_type with COUNT"
response=$(auth_post "api/aggregate/account" '{
    "aggregate": {
        "count": {"$count": "*"}
    },
    "groupBy": ["account_type"]
}')

data=$(extract_and_validate_data "$response" "Aggregate API response")
data_length=$(echo "$data" | jq -r 'length')

if (( data_length < 2 )); then
    test_fail "Expected at least 2 groups (personal, business), got: $data_length"
fi

print_success "GROUP BY single field works correctly: $data_length groups"

# Test 2: Multiple aggregations with GROUP BY
print_step "Test 2: Multiple aggregations with GROUP BY"
response=$(auth_post "api/aggregate/account" '{
    "aggregate": {
        "total": {"$count": "*"},
        "unique_names": {"$distinct": "name"}
    },
    "groupBy": ["account_type"]
}')

data=$(extract_and_validate_data "$response" "Aggregate API response")
data_length=$(echo "$data" | jq -r 'length')

if (( data_length < 2 )); then
    test_fail "Expected at least 2 groups, got: $data_length"
fi

# Verify all aggregations are present
first_row=$(echo "$data" | jq -r '.[0]')
has_account_type=$(echo "$first_row" | jq 'has("account_type")')
has_total=$(echo "$first_row" | jq 'has("total")')
has_unique=$(echo "$first_row" | jq 'has("unique_names")')

if [[ "$has_account_type" != "true" || "$has_total" != "true" || "$has_unique" != "true" ]]; then
    test_fail "Missing expected fields in grouped aggregation"
fi

print_success "Multiple aggregations with GROUP BY works correctly"

print_success "All GROUP BY aggregation tests passed"
