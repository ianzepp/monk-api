#!/usr/bin/env bash
set -e

# Find API Where Array Operators Test
# Tests $in, $nin array membership operators with POST /api/find/:model

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where array operators"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-arrays"
setup_full_auth

# First get all accounts to identify test values
print_step "Analyzing account data for array membership tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Get unique values for testing
all_names=$(echo "$all_data" | jq -r '.[].name')
all_types=$(echo "$all_data" | jq -r '.[].account_type' | sort -u)

print_success "Available account types: $(echo "$all_types" | tr '\n' ' ')"
print_success "Available names: $(echo "$all_names" | tr '\n' ' ')"

# Test 1: $in operator with multiple names
print_step "Testing \$in operator with multiple names"

# Select first two names for testing
name1=$(echo "$all_data" | jq -r '.[0].name')
name2=$(echo "$all_data" | jq -r '.[1].name')

in_filter="{\"where\": {\"name\": {\"\$in\": [\"$name1\", \"$name2\"]}}}"

response=$(auth_post "api/find/account" "$in_filter")
data=$(extract_and_validate_data "$response" "In operator results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 2 ]]; then
    print_success "\$in operator returned $record_count records"
else
    test_fail "Expected 2 records for \$in operator, got: $record_count"
fi

# Verify all returned records have names in the array
in_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ "$name" != "$name1" && "$name" != "$name2" ]]; then
        in_check=false
        break
    fi
done

if [[ "$in_check" == "true" ]]; then
    print_success "All returned records correctly have names in [\$name1, \$name2]"
else
    test_fail "Some returned records have names not in the \$in array"
fi

# Test 2: $nin operator (NOT IN)
print_step "Testing \$nin operator (NOT IN names array)"

nin_filter="{\"where\": {\"name\": {\"\$nin\": [\"$name1\", \"$name2\"]}}}"

response=$(auth_post "api/find/account" "$nin_filter")
data=$(extract_and_validate_data "$response" "Not in operator results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 3 ]]; then
    print_success "\$nin operator returned $record_count records (excluded 2)"
else
    test_fail "Expected 3 records for \$nin operator, got: $record_count"
fi

# Verify no returned records have the excluded names
nin_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ "$name" == "$name1" || "$name" == "$name2" ]]; then
        nin_check=false
        break
    fi
done

if [[ "$nin_check" == "true" ]]; then
    print_success "All returned records correctly excluded from [\$name1, \$name2]"
else
    test_fail "Some returned records incorrectly included excluded names"
fi

# Test 3: $in with account_types (enum-like values)
print_step "Testing \$in operator with account types"

# Get all unique account types and select subset
type_array=$(echo "$all_types" | head -2 | tr '\n' ' ' | sed 's/ $//')
type1=$(echo "$all_types" | sed -n '1p')
type2=$(echo "$all_types" | sed -n '2p')

type_in_filter="{\"where\": {\"account_type\": {\"\$in\": [\"$type1\"]}}}"

response=$(auth_post "api/find/account" "$type_in_filter")
data=$(extract_and_validate_data "$response" "Account type in results")

record_count=$(echo "$data" | jq 'length')
print_success "\$in account_type [\$type1] returned $record_count records"

# Verify all returned records have the correct account_type
type_in_check=true
for i in $(seq 0 $((record_count - 1))); do
    account_type=$(echo "$data" | jq -r ".[$i].account_type")
    if [[ "$account_type" != "$type1" ]]; then
        type_in_check=false
        break
    fi
done

if [[ "$type_in_check" == "true" ]]; then
    print_success "All returned records correctly have account_type '$type1'"
else
    test_fail "Some returned records have incorrect account_type"
fi

# Test 4: $in with empty array (edge case)
print_step "Testing \$in with empty array"

empty_in_filter='{"where": {"name": {"$in": []}}}'

response=$(auth_post "api/find/account" "$empty_in_filter")
data=$(extract_and_validate_data "$response" "Empty in array results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 0 ]]; then
    print_success "\$in with empty array correctly returned 0 records"
else
    test_fail "Expected 0 records for empty \$in array, got: $record_count"
fi

# Test 5: $nin with empty array (edge case)
print_step "Testing \$nin with empty array"

empty_nin_filter='{"where": {"name": {"$nin": []}}}'

response=$(auth_post "api/find/account" "$empty_nin_filter")
data=$(extract_and_validate_data "$response" "Empty nin array results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "\$nin with empty array correctly returned all $record_count records"
else
    test_fail "Expected 5 records for empty \$nin array, got: $record_count"
fi

print_success "Find API where array operators tests completed successfully"
