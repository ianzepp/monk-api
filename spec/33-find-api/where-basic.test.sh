#!/usr/bin/env bash
set -e

# Find API Basic Where Test
# Tests simple exact match where conditions with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API basic where functionality"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-basic"
setup_full_auth

# First get all accounts to see what data we're working with
print_step "Getting all accounts to identify test data"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Pick a specific account to test exact matches against
test_account=$(echo "$all_data" | jq -r '.[0]')
test_name=$(echo "$test_account" | jq -r '.name')
test_email=$(echo "$test_account" | jq -r '.email')
test_account_type=$(echo "$test_account" | jq -r '.account_type')

print_success "Using test account: $test_name ($test_email, type: $test_account_type)"

# Test 1: Exact match by name
print_step "Testing exact match by name"

name_filter="{\"where\": {\"name\": \"$test_name\"}}"

response=$(auth_post "api/find/account" "$name_filter")
data=$(extract_and_validate_data "$response" "Name filter results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "Name exact match returned $record_count record"
else
    test_fail "Expected 1 record for exact name match, got: $record_count"
fi

# Verify it's the correct record
returned_name=$(echo "$data" | jq -r '.[0].name')
if [[ "$returned_name" == "$test_name" ]]; then
    print_success "Returned record has correct name: $returned_name"
else
    test_fail "Expected name '$test_name', got: '$returned_name'"
fi

# Test 2: Exact match by email
print_step "Testing exact match by email"

email_filter="{\"where\": {\"email\": \"$test_email\"}}"

response=$(auth_post "api/find/account" "$email_filter")
data=$(extract_and_validate_data "$response" "Email filter results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "Email exact match returned $record_count record"
else
    test_fail "Expected 1 record for exact email match, got: $record_count"
fi

# Test 3: Exact match by account_type (should match multiple)
print_step "Testing exact match by account_type"

type_filter="{\"where\": {\"account_type\": \"$test_account_type\"}}"

response=$(auth_post "api/find/account" "$type_filter")
data=$(extract_and_validate_data "$response" "Account type filter results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -ge 1 ]]; then
    print_success "Account type exact match returned $record_count record(s)"
else
    test_fail "Expected at least 1 record for account_type match, got: $record_count"
fi

# Verify all returned records have the correct account_type
all_types_match=true
for i in $(seq 0 $((record_count - 1))); do
    returned_type=$(echo "$data" | jq -r ".[$i].account_type")
    if [[ "$returned_type" != "$test_account_type" ]]; then
        all_types_match=false
        break
    fi
done

if [[ "$all_types_match" == "true" ]]; then
    print_success "All returned records have correct account_type: $test_account_type"
else
    test_fail "Some returned records have incorrect account_type"
fi

# Test 4: Multiple field exact match
print_step "Testing multiple field exact match"

multi_filter="{\"where\": {\"name\": \"$test_name\", \"account_type\": \"$test_account_type\"}}"

response=$(auth_post "api/find/account" "$multi_filter")
data=$(extract_and_validate_data "$response" "Multi-field filter results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "Multi-field exact match returned $record_count record"
else
    test_fail "Expected 1 record for multi-field exact match, got: $record_count"
fi

# Test 5: No match scenario
print_step "Testing no match scenario"

no_match_filter='{"where": {"name": "Nonexistent User Name"}}'

response=$(auth_post "api/find/account" "$no_match_filter")
data=$(extract_and_validate_data "$response" "No match results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 0 ]]; then
    print_success "No match filter correctly returned empty result set"
else
    test_fail "Expected 0 records for no match filter, got: $record_count"
fi

print_success "Find API basic where functionality tests completed successfully"
