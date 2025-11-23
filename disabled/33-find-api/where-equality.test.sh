#!/usr/bin/env bash
set -e

# Find API Where Equality Operators Test
# Tests $eq, $ne/$neq equality operators with POST /api/find/:model

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where equality operators"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-equality"
setup_full_auth

# First get all accounts to identify test data
print_step "Getting all accounts to identify test data"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Pick specific test values from the template data
test_account=$(echo "$all_data" | jq -r '.[0]')
test_name=$(echo "$test_account" | jq -r '.name')
test_account_type=$(echo "$test_account" | jq -r '.account_type')

print_success "Using test account: $test_name (type: $test_account_type)"

# Test 1: $eq operator (explicit equality)
print_step "Testing \$eq operator"

eq_filter="{\"where\": {\"name\": {\"\$eq\": \"$test_name\"}}}"

response=$(auth_post "api/find/account" "$eq_filter")
data=$(extract_and_validate_data "$response" "Eq operator results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "\$eq operator returned $record_count record"
else
    test_fail "Expected 1 record for \$eq operator, got: $record_count"
fi

returned_name=$(echo "$data" | jq -r '.[0].name')
if [[ "$returned_name" == "$test_name" ]]; then
    print_success "\$eq returned correct record: $returned_name"
else
    test_fail "Expected name '$test_name', got: '$returned_name'"
fi

# Test 2: $ne operator (not equal)
print_step "Testing \$ne operator"

ne_filter="{\"where\": {\"name\": {\"\$ne\": \"$test_name\"}}}"

response=$(auth_post "api/find/account" "$ne_filter")
data=$(extract_and_validate_data "$response" "Ne operator results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 4 ]]; then
    print_success "\$ne operator returned $record_count records (excluded 1)"
else
    test_fail "Expected 4 records for \$ne operator, got: $record_count"
fi

# Verify the excluded record is not in results
excluded_found=$(echo "$data" | jq --arg name "$test_name" 'map(select(.name == $name)) | length')
if [[ "$excluded_found" -eq 0 ]]; then
    print_success "\$ne correctly excluded target record: $test_name"
else
    test_fail "\$ne operator did not exclude target record"
fi

# Test 3: $neq operator (alternative not equal)
print_step "Testing \$neq operator"

neq_filter="{\"where\": {\"account_type\": {\"\$neq\": \"$test_account_type\"}}}"

response=$(auth_post "api/find/account" "$neq_filter")
data=$(extract_and_validate_data "$response" "Neq operator results")

# Count how many records don't match the test account type
non_matching_count=$(echo "$all_data" | jq --arg type "$test_account_type" 'map(select(.account_type != $type)) | length')
record_count=$(echo "$data" | jq 'length')

if [[ "$record_count" -eq "$non_matching_count" ]]; then
    print_success "\$neq operator returned $record_count records (correct exclusion count)"
else
    test_fail "Expected $non_matching_count records for \$neq operator, got: $record_count"
fi

# Test 4: $eq with null value
print_step "Testing \$eq with null value"

null_filter='{"where": {"credit_limit": {"$eq": null}}}'

response=$(auth_post "api/find/account" "$null_filter")
data=$(extract_and_validate_data "$response" "Null eq results")

# Should return accounts where credit_limit is null/not set
record_count=$(echo "$data" | jq 'length')
print_success "\$eq null returned $record_count records with null credit_limit"

# Verify returned records actually have null credit_limit
null_check=true
for i in $(seq 0 $((record_count - 1))); do
    credit_limit=$(echo "$data" | jq -r ".[$i].credit_limit")
    if [[ "$credit_limit" != "null" ]]; then
        null_check=false
        break
    fi
done

if [[ "$null_check" == "true" ]]; then
    print_success "All returned records correctly have null credit_limit"
else
    test_fail "Some returned records have non-null credit_limit"
fi

# Test 5: $ne with null value
print_step "Testing \$ne with null value"

not_null_filter='{"where": {"credit_limit": {"$ne": null}}}'

response=$(auth_post "api/find/account" "$not_null_filter")
data=$(extract_and_validate_data "$response" "Not null results")

# Should return accounts where credit_limit is not null
record_count=$(echo "$data" | jq 'length')
print_success "\$ne null returned $record_count records with non-null credit_limit"

# Verify returned records have non-null credit_limit
not_null_check=true
for i in $(seq 0 $((record_count - 1))); do
    credit_limit=$(echo "$data" | jq -r ".[$i].credit_limit")
    if [[ "$credit_limit" == "null" ]]; then
        not_null_check=false
        break
    fi
done

if [[ "$not_null_check" == "true" ]]; then
    print_success "All returned records correctly have non-null credit_limit"
else
    test_fail "Some returned records have null credit_limit"
fi

print_success "Find API where equality operators tests completed successfully"
