#!/usr/bin/env bash
set -e

# Find API Limit Test
# Tests limit functionality with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API limit functionality"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "limit-basic"
setup_full_auth

# Test 1: Limit functionality - request only 2 records
print_step "Testing limit=2 functionality"

limit_filter='{"limit": 2}'

response=$(auth_post "api/find/account" "$limit_filter")
data=$(extract_and_validate_data "$response" "Limited results")

# Verify limit is respected
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 2 ]]; then
    print_success "Limit=2 correctly returned $record_count records"
else
    test_fail "Expected 2 records with limit=2, got: $record_count"
fi

# Test 2: Limit larger than dataset
print_step "Testing limit=10 (larger than dataset)"

large_limit_filter='{"limit": 10}'

response=$(auth_post "api/find/account" "$large_limit_filter")
data=$(extract_and_validate_data "$response" "Large limit results")

# Should return all available records (5)
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Large limit correctly returned all $record_count available records"
else
    test_fail "Expected 5 records (all available), got: $record_count"
fi

print_success "Find API limit functionality tests completed successfully"
