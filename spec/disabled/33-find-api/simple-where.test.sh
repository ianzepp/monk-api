#!/usr/bin/env bash
set -e

# Find API Simple Where Test
# Tests basic where conditions with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API simple where functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "simple-where"
setup_full_auth

# First get all accounts to identify test data
print_step "Getting all accounts to identify test data"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Pick first account for exact match testing
test_account=$(echo "$all_data" | jq -r '.[0]')
test_name=$(echo "$test_account" | jq -r '.name')
test_email=$(echo "$test_account" | jq -r '.email')

print_success "Using test account: $test_name ($test_email)"

# Test 1: Exact match by name
print_step "Testing exact match where condition by name"

name_filter=$(jq -n --arg name "$test_name" '{where: {name: $name}}')

response=$(auth_post "api/find/account" "$name_filter")
data=$(extract_and_validate_data "$response" "Name filtered results")

# Should return exactly one matching record
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "Name filter returned exactly 1 matching record"

    # Verify it's the correct record
    found_name=$(echo "$data" | jq -r '.[0].name')
    if [[ "$found_name" == "$test_name" ]]; then
        print_success "Correct record returned: $found_name"
    else
        test_fail "Expected name '$test_name', got: '$found_name'"
    fi
else
    test_fail "Expected 1 record for name filter, got: $record_count"
fi

# Test 2: Exact match by email
print_step "Testing exact match where condition by email"

email_filter=$(jq -n --arg email "$test_email" '{where: {email: $email}}')

response=$(auth_post "api/find/account" "$email_filter")
data=$(extract_and_validate_data "$response" "Email filtered results")

# Should return exactly one matching record
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "Email filter returned exactly 1 matching record"

    # Verify it's the correct record
    found_email=$(echo "$data" | jq -r '.[0].email')
    if [[ "$found_email" == "$test_email" ]]; then
        print_success "Correct record returned: $found_email"
    else
        test_fail "Expected email '$test_email', got: '$found_email'"
    fi
else
    test_fail "Expected 1 record for email filter, got: $record_count"
fi

# Test 3: Non-matching condition
print_step "Testing non-matching where condition"

nomatch_filter='{"where": {"name": "NonExistentUser"}}'

response=$(auth_post "api/find/account" "$nomatch_filter")
data=$(extract_and_validate_data "$response" "Non-matching results")

# Should return empty array
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 0 ]]; then
    print_success "Non-matching filter correctly returned 0 records"
else
    test_fail "Expected 0 records for non-matching filter, got: $record_count"
fi

print_success "Find API simple where functionality tests completed successfully"
