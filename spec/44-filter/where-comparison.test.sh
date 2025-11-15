#!/usr/bin/env bash
set -e

# Find API Where Comparison Operators Test
# Tests $gt, $gte, $lt, $lte comparison operators with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where comparison operators"

# Setup test environment with template (provides 5 account records with varying balances)
setup_test_with_template "where-comparison"
setup_full_auth

# First get all accounts to see balance distribution
print_step "Analyzing account balance data for comparison tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Get balance values for testing
balances=$(echo "$all_data" | jq -r '.[].balance' | sort -n)
min_balance=$(echo "$balances" | head -1)
max_balance=$(echo "$balances" | tail -1)
mid_balance=1000  # Use a value that should split the dataset

print_success "Balance range: $min_balance to $max_balance (using $mid_balance for tests)"

# Test 1: $gt operator (greater than)
print_step "Testing \$gt operator (balance > $mid_balance)"

gt_filter="{\"where\": {\"balance\": {\"\$gt\": $mid_balance}}}"

response=$(auth_post "api/find/account" "$gt_filter")
data=$(extract_and_validate_data "$response" "Greater than results")

record_count=$(echo "$data" | jq 'length')
print_success "\$gt $mid_balance returned $record_count records"

# Verify all returned records have balance > mid_balance
gt_check=true
for i in $(seq 0 $((record_count - 1))); do
    balance=$(echo "$data" | jq -r ".[$i].balance")
    if (( $(echo "$balance <= $mid_balance" | bc -l) )); then
        gt_check=false
        break
    fi
done

if [[ "$gt_check" == "true" ]]; then
    print_success "All returned records correctly have balance > $mid_balance"
else
    test_fail "Some returned records have balance <= $mid_balance"
fi

# Test 2: $gte operator (greater than or equal)
print_step "Testing \$gte operator (balance >= $mid_balance)"

gte_filter="{\"where\": {\"balance\": {\"\$gte\": $mid_balance}}}"

response=$(auth_post "api/find/account" "$gte_filter")
data=$(extract_and_validate_data "$response" "Greater than or equal results")

record_count=$(echo "$data" | jq 'length')
print_success "\$gte $mid_balance returned $record_count records"

# Verify all returned records have balance >= mid_balance
gte_check=true
for i in $(seq 0 $((record_count - 1))); do
    balance=$(echo "$data" | jq -r ".[$i].balance")
    if (( $(echo "$balance < $mid_balance" | bc -l) )); then
        gte_check=false
        break
    fi
done

if [[ "$gte_check" == "true" ]]; then
    print_success "All returned records correctly have balance >= $mid_balance"
else
    test_fail "Some returned records have balance < $mid_balance"
fi

# Test 3: $lt operator (less than)
print_step "Testing \$lt operator (balance < $mid_balance)"

lt_filter="{\"where\": {\"balance\": {\"\$lt\": $mid_balance}}}"

response=$(auth_post "api/find/account" "$lt_filter")
data=$(extract_and_validate_data "$response" "Less than results")

record_count=$(echo "$data" | jq 'length')
print_success "\$lt $mid_balance returned $record_count records"

# Verify all returned records have balance < mid_balance
lt_check=true
for i in $(seq 0 $((record_count - 1))); do
    balance=$(echo "$data" | jq -r ".[$i].balance")
    if (( $(echo "$balance >= $mid_balance" | bc -l) )); then
        lt_check=false
        break
    fi
done

if [[ "$lt_check" == "true" ]]; then
    print_success "All returned records correctly have balance < $mid_balance"
else
    test_fail "Some returned records have balance >= $mid_balance"
fi

# Test 4: $lte operator (less than or equal)
print_step "Testing \$lte operator (balance <= $mid_balance)"

lte_filter="{\"where\": {\"balance\": {\"\$lte\": $mid_balance}}}"

response=$(auth_post "api/find/account" "$lte_filter")
data=$(extract_and_validate_data "$response" "Less than or equal results")

record_count=$(echo "$data" | jq 'length')
print_success "\$lte $mid_balance returned $record_count records"

# Verify all returned records have balance <= mid_balance
lte_check=true
for i in $(seq 0 $((record_count - 1))); do
    balance=$(echo "$data" | jq -r ".[$i].balance")
    if (( $(echo "$balance > $mid_balance" | bc -l) )); then
        lte_check=false
        break
    fi
done

if [[ "$lte_check" == "true" ]]; then
    print_success "All returned records correctly have balance <= $mid_balance"
else
    test_fail "Some returned records have balance > $mid_balance"
fi

# Test 5: Range validation ($gt + $lt should cover whole dataset)
print_step "Validating range coverage"

# Count records: $lt + $gte should equal total
lt_count=$(echo "$data" | jq 'length')  # From previous $lte test
gte_response=$(auth_post "api/find/account" "$gte_filter")
gte_data=$(extract_and_validate_data "$gte_response" "Gte validation")
gte_count=$(echo "$gte_data" | jq 'length')

total_expected=5  # Template has 5 accounts
total_actual=$((lt_count + gte_count))

# Note: If mid_balance matches exactly, record will be counted in $lte but not $gte
# So we need to account for potential overlap
if [[ "$total_actual" -ge "$total_expected" ]]; then
    print_success "Range operators cover dataset correctly (lte: $lt_count + gt: $gte_count >= $total_expected)"
else
    test_fail "Range operators missing records (lte: $lt_count + gte: $gte_count < $total_expected)"
fi

print_success "Find API where comparison operators tests completed successfully"
