#!/usr/bin/env bash
set -e

# Find API Where Existence Operators Test
# Tests $exists, $null existence operators with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where existence operators"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-exists"
setup_full_auth

# First get all accounts to analyze field presence
print_step "Analyzing account data for existence tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Analyze which fields might be null vs not null
print_success "Analyzing field existence in template data:"
echo "$all_data" | jq -r '.[] | "Name: \(.name), Phone: \(.phone), Credit Limit: \(.credit_limit)"'

# Test 1: $exists true - field is not null (use credit_limit which has some non-null values)
print_step "Testing \$exists true (credit_limit field is not null)"

exists_true_filter='{"where": {"credit_limit": {"$exists": true}}}'

response=$(auth_post "api/find/account" "$exists_true_filter")
data=$(extract_and_validate_data "$response" "Exists true results")

record_count=$(echo "$data" | jq 'length')
print_success "\$exists true for credit_limit returned $record_count records"

# Verify all returned records have non-null credit_limit field
exists_check=true
for i in $(seq 0 $((record_count - 1))); do
    credit_limit=$(echo "$data" | jq -r ".[$i].credit_limit")
    if [[ "$credit_limit" == "null" ]]; then
        exists_check=false
        print_warning "Record $i has null credit_limit field"
        break
    fi
done

if [[ "$exists_check" == "true" ]]; then
    print_success "All returned records correctly have non-null credit_limit field"
else
    test_fail "Some returned records have null credit_limit field"
fi

# Test 2: $exists false - field is null
print_step "Testing \$exists false (credit_limit field is null)"

exists_false_filter='{"where": {"credit_limit": {"$exists": false}}}'

response=$(auth_post "api/find/account" "$exists_false_filter")
data=$(extract_and_validate_data "$response" "Exists false results")

record_count=$(echo "$data" | jq 'length')
print_success "\$exists false for credit_limit returned $record_count records"

# Verify all returned records have null credit_limit field
not_exists_check=true
for i in $(seq 0 $((record_count - 1))); do
    credit_limit=$(echo "$data" | jq -r ".[$i].credit_limit")
    if [[ "$credit_limit" != "null" ]]; then
        not_exists_check=false
        print_warning "Record $i has non-null credit_limit field: $credit_limit"
        break
    fi
done

if [[ "$not_exists_check" == "true" ]]; then
    print_success "All returned records correctly have null credit_limit field"
else
    test_fail "Some returned records have non-null credit_limit field"
fi

# Test 3: $null true - field is null (same as $exists false)
print_step "Testing \$null true (credit_limit field is null)"

null_true_filter='{"where": {"credit_limit": {"$null": true}}}'

response=$(auth_post "api/find/account" "$null_true_filter")
data=$(extract_and_validate_data "$response" "Null true results")

record_count=$(echo "$data" | jq 'length')
print_success "\$null true for credit_limit returned $record_count records"

# Verify all returned records have null credit_limit
null_check=true
for i in $(seq 0 $((record_count - 1))); do
    credit_limit=$(echo "$data" | jq -r ".[$i].credit_limit")
    if [[ "$credit_limit" != "null" ]]; then
        null_check=false
        print_warning "Record $i has non-null credit_limit: $credit_limit"
        break
    fi
done

if [[ "$null_check" == "true" ]]; then
    print_success "All returned records correctly have null credit_limit"
else
    test_fail "Some returned records have non-null credit_limit"
fi

# Test 4: $null false - field is not null (same as $exists true)
print_step "Testing \$null false (credit_limit field is not null)"

null_false_filter='{"where": {"credit_limit": {"$null": false}}}'

response=$(auth_post "api/find/account" "$null_false_filter")
data=$(extract_and_validate_data "$response" "Null false results")

record_count=$(echo "$data" | jq 'length')
print_success "\$null false for credit_limit returned $record_count records"

# Verify all returned records have non-null credit_limit
not_null_check=true
for i in $(seq 0 $((record_count - 1))); do
    credit_limit=$(echo "$data" | jq -r ".[$i].credit_limit")
    if [[ "$credit_limit" == "null" ]]; then
        not_null_check=false
        print_warning "Record $i has null credit_limit"
        break
    fi
done

if [[ "$not_null_check" == "true" ]]; then
    print_success "All returned records correctly have non-null credit_limit"
else
    test_fail "Some returned records have null credit_limit"
fi

# Test 5: Verify logical consistency ($exists vs $null)
print_step "Testing logical consistency between \$exists and \$null"

# Compare $exists true vs $null false (should be equivalent)
exists_true_count=$(auth_post "api/find/account" "$exists_true_filter" | jq '.data | length')
null_false_count=$(echo "$data" | jq 'length')

if [[ "$exists_true_count" -eq "$null_false_count" ]]; then
    print_success "\$exists true and \$null false are logically equivalent"
else
    print_warning "\$exists true ($exists_true_count) and \$null false ($null_false_count) have different counts"
fi

# Compare $exists false vs $null true (should be equivalent)
exists_false_count=$(auth_post "api/find/account" "$exists_false_filter" | jq '.data | length')
null_true_count=$(auth_post "api/find/account" "$null_true_filter" | jq '.data | length')

if [[ "$exists_false_count" -eq "$null_true_count" ]]; then
    print_success "\$exists false and \$null true are logically equivalent"
else
    print_warning "\$exists false ($exists_false_count) and \$null true ($null_true_count) have different counts"
fi

# Test 6: Coverage validation (null + not null should equal total)
print_step "Testing coverage validation"

null_count=$(auth_post "api/find/account" "$null_true_filter" | jq '.data | length')
not_null_count=$(auth_post "api/find/account" "$null_false_filter" | jq '.data | length')
total_count=$((null_count + not_null_count))

if [[ "$total_count" -eq 5 ]]; then
    print_success "Existence operators cover complete dataset: null ($null_count) + not null ($not_null_count) = $total_count"
else
    test_fail "Existence operators don't cover complete dataset: $null_count + $not_null_count = $total_count (expected 5)"
fi

print_success "Find API where existence operators tests completed successfully"
