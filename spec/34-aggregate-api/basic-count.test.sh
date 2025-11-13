#!/usr/bin/env bash
# Test: Aggregate API - Basic COUNT aggregation
# Purpose: Verify simple COUNT(*) aggregation works

set -e
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Aggregate API - Basic COUNT"

# Setup
setup_test_with_template "aggregate-basic-count"
setup_admin_auth

# Create test records with known fields
print_step "Creating test records for aggregation"
for i in {1..10}; do
    auth_post "api/data/account" "[{\"name\": \"Test Account ${i}\", \"email\": \"test${i}@example.com\", \"username\": \"test${i}\", \"account_type\": \"personal\", \"balance\": 0, \"is_active\": true}]" > /dev/null
done

for i in {1..5}; do
    auth_post "api/data/account" "[{\"name\": \"Inactive Account ${i}\", \"email\": \"inactive${i}@example.com\", \"username\": \"inactive${i}\", \"account_type\": \"personal\", \"balance\": 0, \"is_active\": false}]" > /dev/null
done

# Test 1: Simple COUNT(*) aggregation
print_step "Test 1: Simple COUNT(*) aggregation"
response=$(auth_post "api/aggregate/account" '{
    "aggregate": {
        "total": {"$count": "*"}
    }
}')

data=$(extract_and_validate_data "$response" "Aggregate API response")
total=$(echo "$data" | jq -r '.[0].total')

# Template has 5 accounts + 15 new = 20 total
if (( total < 20 )); then
    test_fail "Expected at least 20 total records, got: $total"
fi

print_success "Total count: $total"

# Test 2: COUNT with WHERE filter
print_step "Test 2: COUNT with WHERE filter (is_active=true)"
response=$(auth_post "api/aggregate/account" '{
    "where": {"is_active": true},
    "aggregate": {
        "active_count": {"$count": "*"}
    }
}')

data=$(extract_and_validate_data "$response" "Aggregate API response")
active_count=$(echo "$data" | jq -r '.[0].active_count')

# Template has 4 active + 10 new = 14 total (one template account is inactive)
if (( active_count < 14 )); then
    test_fail "Expected at least 14 active records, got: $active_count"
fi

print_success "Active count: $active_count"

# Test 3: Multiple COUNT aggregations
print_step "Test 3: Multiple aggregations in one query"
response=$(auth_post "api/aggregate/account" '{
    "aggregate": {
        "total_records": {"$count": "*"},
        "unique_names": {"$distinct": "name"}
    }
}')

data=$(extract_and_validate_data "$response" "Aggregate API response")
total_records=$(echo "$data" | jq -r '.[0].total_records')
unique_names=$(echo "$data" | jq -r '.[0].unique_names')

if (( total_records < 20 )); then
    test_fail "Expected at least 20 total records, got: $total_records"
fi

if (( unique_names < 20 )); then
    test_fail "Expected at least 20 unique names, got: $unique_names"
fi

print_success "Total records: $total_records, Unique names: $unique_names"

print_success "All basic count aggregation tests passed"
