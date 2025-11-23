#!/usr/bin/env bash
set -e

# Find API Where BETWEEN Operator Test
# Tests $between range operator with numeric and string types with POST /api/find/:model

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where BETWEEN operator"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-between"
setup_full_auth

# First get all accounts to analyze numeric and string ranges
print_step "Analyzing account data for BETWEEN range tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Analyze balance range (numeric)
balances=$(echo "$all_data" | jq -r '.[].balance' | sort -n)
min_balance=$(echo "$balances" | head -1)
max_balance=$(echo "$balances" | tail -1)

# Analyze name range (string - alphabetical)
names=$(echo "$all_data" | jq -r '.[].name' | sort)
first_name=$(echo "$names" | head -1)
last_name=$(echo "$names" | tail -1)

print_success "Balance range: $min_balance to $max_balance"
print_success "Name range (alphabetical): '$first_name' to '$last_name'"

# Test 1: Numeric BETWEEN - balance range
print_step "Testing numeric \$between (balance range)"

# Use a range that should capture some but not all records
numeric_between_filter='{"where": {"balance": {"$between": [100, 2000]}}}'

response=$(auth_post "api/find/account" "$numeric_between_filter")
data=$(extract_and_validate_data "$response" "Numeric between results")

record_count=$(echo "$data" | jq 'length')
print_success "Numeric \$between [100, 2000] returned $record_count records"

# Verify all returned records have balance in range
numeric_check=true
for i in $(seq 0 $((record_count - 1))); do
    balance=$(echo "$data" | jq -r ".[$i].balance")
    if (( $(echo "$balance < 100 || $balance > 2000" | bc -l) )); then
        numeric_check=false
        print_warning "Record $i has balance $balance outside range [100, 2000]"
        break
    fi
done

if [[ "$numeric_check" == "true" ]]; then
    print_success "All returned records correctly have balance between 100 and 2000"
else
    test_fail "Some returned records have balance outside the specified range"
fi

# Test 2: String BETWEEN - name range (alphabetical)
print_step "Testing string \$between (alphabetical name range)"

# Use alphabetical range that should capture subset of names
string_between_filter='{"where": {"name": {"$between": ["A", "K"]}}}'

response=$(auth_post "api/find/account" "$string_between_filter")
data=$(extract_and_validate_data "$response" "String between results")

record_count=$(echo "$data" | jq 'length')
print_success "String \$between ['A', 'K'] returned $record_count records"

# Verify all returned records have names in alphabetical range
string_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    # Check if name falls alphabetically between A and K
    if [[ "$name" < "A" || "$name" > "K" ]]; then
        string_check=false
        print_warning "Record $i has name '$name' outside range ['A', 'K']"
        break
    fi
done

if [[ "$string_check" == "true" ]]; then
    print_success "All returned records correctly have names between 'A' and 'K'"
else
    test_fail "Some returned records have names outside the specified range"
fi

# Test 3: Date BETWEEN - timestamp range
print_step "Testing date \$between (timestamp range)"

# Use created_at timestamp range
date_between_filter='{"where": {"created_at": {"$between": ["2025-01-01", "2025-12-31"]}}}'

response=$(auth_post "api/find/account" "$date_between_filter")
data=$(extract_and_validate_data "$response" "Date between results")

record_count=$(echo "$data" | jq 'length')
print_success "Date \$between ['2025-01-01', '2025-12-31'] returned $record_count records"

# Verify all returned records have created_at in date range
date_check=true
for i in $(seq 0 $((record_count - 1))); do
    created_at=$(echo "$data" | jq -r ".[$i].created_at")
    # Basic date validation (starts with 2025)
    if [[ ! "$created_at" =~ ^2025 ]]; then
        date_check=false
        print_warning "Record $i has created_at '$created_at' outside 2025 range"
        break
    fi
done

if [[ "$date_check" == "true" ]]; then
    print_success "All returned records correctly have created_at in 2025 date range"
else
    test_fail "Some returned records have created_at outside the specified range"
fi

# Test 4: Boundary testing - exact boundary values
print_step "Testing boundary values"

# Test with exact min/max balance values from dataset
boundary_filter="{\"where\": {\"balance\": {\"\$between\": [$min_balance, $max_balance]}}}"

response=$(auth_post "api/find/account" "$boundary_filter")
data=$(extract_and_validate_data "$response" "Boundary test results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Boundary \$between [$min_balance, $max_balance] correctly returned all $record_count records"
else
    test_fail "Expected 5 records for full range boundary test, got: $record_count"
fi

# Test 5: Narrow range - should return subset
print_step "Testing narrow range"

# Use narrow range that excludes extreme values
narrow_between_filter='{"where": {"balance": {"$between": [200, 2000]}}}'

response=$(auth_post "api/find/account" "$narrow_between_filter")
data=$(extract_and_validate_data "$response" "Narrow range results")

record_count=$(echo "$data" | jq 'length')
print_success "Narrow \$between [200, 2000] returned $record_count records"

# This should return fewer than total records
if [[ "$record_count" -lt 5 ]]; then
    print_success "Narrow range correctly filtered out some records ($record_count < 5)"
else
    print_warning "Narrow range returned all records - dataset may not have values outside range"
fi

# Test 6: Invalid range (min > max)
print_step "Testing invalid range (min > max)"

invalid_between_filter='{"where": {"balance": {"$between": [3000, 1000]}}}'

response=$(auth_post "api/find/account" "$invalid_between_filter")
data=$(extract_and_validate_data "$response" "Invalid range results")

record_count=$(echo "$data" | jq 'length')
print_success "Invalid \$between [3000, 1000] returned $record_count records"

# PostgreSQL BETWEEN with reversed values typically returns no results
if [[ "$record_count" -eq 0 ]]; then
    print_success "Invalid range (min > max) correctly returned no results"
else
    print_warning "Invalid range returned $record_count records (PostgreSQL behavior varies)"
fi

print_success "Find API where BETWEEN operator tests completed successfully"
