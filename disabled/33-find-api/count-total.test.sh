#!/usr/bin/env bash
# Test: Find API with count=true returns total filtered count
# Purpose: Verify pagination metadata includes total count

set -e
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API - Total Count Parameter"

# Setup
setup_test_with_template "find-count-total"
setup_full_auth

# Create test records
print_step "Creating test records for counting"
for i in {1..15}; do
    auth_post "api/data/account" "[{\"name\": \"Test Account ${i}\", \"email\": \"test${i}@example.com\", \"username\": \"test${i}\", \"account_type\": \"personal\", \"balance\": 0, \"is_active\": true}]" > /dev/null
done

# Test 1: Find with count=true
print_step "Test 1: Request with count=true parameter"
response=$(auth_post "api/find/account" '{
    "count": true,
    "limit": 5,
    "where": {"is_active": true}
}')

success=$(echo "$response" | jq -r '.success')
data_count=$(echo "$response" | jq -r '.data | length')
total=$(echo "$response" | jq -r '.total')

if [[ "$success" != "true" ]]; then
    test_fail "Expected success=true, got: $success"
fi

if [[ "$data_count" != "5" ]]; then
    test_fail "Expected 5 records in data array, got: $data_count"
fi

if [[ "$total" == "null" || "$total" == "" ]]; then
    test_fail "Expected total count in response, got: $total"
fi

# Template has 4 active + 15 new = 19 total active (one template account is inactive)
if (( total < 19 )); then
    test_fail "Expected total >= 19, got: $total"
fi

print_success "Response includes total count: $total (returned $data_count records)"

# Test 2: Find with includeTotal=true (alias)
print_step "Test 2: Request with includeTotal=true parameter"
response=$(auth_post "api/find/account" '{
    "includeTotal": true,
    "limit": 3,
    "where": {"is_active": true}
}')

total2=$(echo "$response" | jq -r '.total')

if [[ "$total2" == "null" || "$total2" == "" ]]; then
    test_fail "Expected total count with includeTotal parameter, got: $total2"
fi

print_success "includeTotal parameter works as alias: $total2"

# Test 3: Find without count parameter (no total)
print_step "Test 3: Request without count parameter"
response=$(auth_post "api/find/account" '{
    "limit": 5,
    "where": {"is_active": true}
}')

total3=$(echo "$response" | jq -r '.total // "not_present"')

if [[ "$total3" != "not_present" ]]; then
    test_fail "Expected no total field without count parameter, got: $total3"
fi

print_success "Response without count parameter has no total field"

print_success "All count parameter tests passed"
