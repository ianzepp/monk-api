#!/usr/bin/env bash
set -e

# Find API Complex Query Test 02
# Tests deep WHERE clauses with nested $and conditions and mixed operator types
# Focuses on: Deep logical nesting, operator combinations, multiple data types

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API deep WHERE clauses with nested \$and conditions"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "complex-02"
setup_full_auth

# Test 1: Three-level nested $and with different operator types
print_step "Testing three-level nested \$and conditions"

# Query: WHERE (balance >= 0 AND name != 'Charlie Brown')
#               AND (account_type IN ['personal', 'business', 'premium'] AND is_active = true)
#               AND (credit_limit IS NULL OR credit_limit > 1000)
nested_query='{
    "where": {
        "$and": [
            {
                "$and": [
                    {"balance": {"$gte": 0}},
                    {"name": {"$ne": "Charlie Brown"}}
                ]
            },
            {
                "$and": [
                    {"account_type": {"$in": ["personal", "business", "premium"]}},
                    {"is_active": true}
                ]
            },
            {
                "$and": [
                    {"credit_limit": {"$null": true}}
                ]
            }
        ]
    }
}'

response=$(auth_post "api/find/account" "$nested_query")
data=$(extract_and_validate_data "$response" "Nested and results")

record_count=$(echo "$data" | jq 'length')
print_success "Three-level nested \$and returned $record_count records"

# Verify all nested conditions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    name=$(echo "$record" | jq -r '.name')
    balance=$(echo "$record" | jq -r '.balance')
    account_type=$(echo "$record" | jq -r '.account_type')
    is_active=$(echo "$record" | jq -r '.is_active')
    credit_limit=$(echo "$record" | jq -r '.credit_limit')

    # Level 1: balance >= 0 AND name != 'Charlie Brown'
    if (( $(echo "$balance < 0" | bc -l) )); then
        test_fail "Record $i balance $balance < 0"
    fi

    if [[ "$name" == "Charlie Brown" ]]; then
        test_fail "Record $i is Charlie Brown (should be excluded)"
    fi

    # Level 2: account_type IN [...] AND is_active = true
    if [[ "$account_type" != "personal" && "$account_type" != "business" && "$account_type" != "premium" ]]; then
        test_fail "Record $i account_type '$account_type' not in allowed list"
    fi

    if [[ "$is_active" != "true" ]]; then
        test_fail "Record $i is_active '$is_active' (expected true)"
    fi

    # Level 3: credit_limit IS NULL
    if [[ "$credit_limit" != "null" ]]; then
        test_fail "Record $i credit_limit '$credit_limit' (expected null)"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All records meet complex nested \$and conditions"
fi

# Test 2: Mixed operator types in single $and
print_step "Testing mixed operator types in single \$and"

# Query: WHERE balance BETWEEN 100 AND 10000
#               AND name REGEX '^[A-Z][a-z]+ [A-Z][a-z]+$'
#               AND email LIKE '%@%'
#               AND account_type != 'trial'
mixed_operators_query='{
    "where": {
        "$and": [
            {"balance": {"$between": [100, 10000]}},
            {"name": {"$regex": "^[A-Z][a-z]+ [A-Z][a-z]+$"}},
            {"email": {"$like": "%@%"}},
            {"account_type": {"$ne": "trial"}}
        ]
    },
    "order": ["name asc"]
}'

response=$(auth_post "api/find/account" "$mixed_operators_query")
data=$(extract_and_validate_data "$response" "Mixed operators results")

record_count=$(echo "$data" | jq 'length')
print_success "Mixed operator types \$and returned $record_count records"

# Verify mixed conditions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    balance=$(echo "$record" | jq -r '.balance')
    name=$(echo "$record" | jq -r '.name')
    email=$(echo "$record" | jq -r '.email')
    account_type=$(echo "$record" | jq -r '.account_type')

    # BETWEEN condition
    if (( $(echo "$balance < 100 || $balance > 10000" | bc -l) )); then
        test_fail "Record $i balance $balance outside range [100, 10000]"
    fi

    # REGEX condition (First Last name pattern)
    if [[ ! "$name" =~ ^[A-Z][a-z]+\ [A-Z][a-z]+$ ]]; then
        test_fail "Record $i name '$name' doesn't match First Last pattern"
    fi

    # LIKE condition (contains @)
    if [[ ! "$email" =~ @ ]]; then
        test_fail "Record $i email '$email' doesn't contain @"
    fi

    # NOT EQUAL condition
    if [[ "$account_type" == "trial" ]]; then
        test_fail "Record $i is trial account (should be excluded)"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All records meet mixed operator conditions"

    # Display results
    print_step "Mixed operator query results"
    echo "$data" | jq -r '.[] | "\(.name) (\(.account_type)): $\(.balance) - \(.email)"'
fi

# Test 3: Numeric range combinations
print_step "Testing numeric range combinations"

# Query: WHERE (balance > 1000 AND balance < 3000) AND credit_limit >= 5000
numeric_ranges_query='{
    "where": {
        "$and": [
            {"balance": {"$gt": 1000}},
            {"balance": {"$lt": 3000}},
            {"credit_limit": {"$gte": 5000}}
        ]
    }
}'

response=$(auth_post "api/find/account" "$numeric_ranges_query")
data=$(extract_and_validate_data "$response" "Numeric ranges results")

record_count=$(echo "$data" | jq 'length')
print_success "Numeric range combinations returned $record_count records"

# Verify numeric conditions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    balance=$(echo "$record" | jq -r '.balance')
    credit_limit=$(echo "$record" | jq -r '.credit_limit')

    if (( $(echo "$balance <= 1000 || $balance >= 3000" | bc -l) )); then
        test_fail "Record $i balance $balance not in range (1000, 3000)"
    fi

    if [[ "$credit_limit" == "null" ]] || (( $(echo "$credit_limit < 5000" | bc -l) )); then
        test_fail "Record $i credit_limit '$credit_limit' < 5000"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All records meet numeric range conditions"
fi

# Test 4: Text pattern combinations
print_step "Testing text pattern combinations"

# Query: WHERE name LIKE 'J%' AND email NOT LIKE '%@demo.%' AND username REGEX '^[a-z]+$'
text_patterns_query='{
    "where": {
        "$and": [
            {"name": {"$like": "J%"}},
            {"email": {"$nlike": "%@demo.%"}},
            {"username": {"$regex": "^[a-z]+$"}}
        ]
    }
}'

response=$(auth_post "api/find/account" "$text_patterns_query")
data=$(extract_and_validate_data "$response" "Text patterns results")

record_count=$(echo "$data" | jq 'length')
print_success "Text pattern combinations returned $record_count records"

# Verify text pattern conditions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    name=$(echo "$record" | jq -r '.name')
    email=$(echo "$record" | jq -r '.email')
    username=$(echo "$record" | jq -r '.username')

    if [[ ! "$name" =~ ^J ]]; then
        test_fail "Record $i name '$name' doesn't start with J"
    fi

    if [[ "$email" =~ @demo\. ]]; then
        test_fail "Record $i email '$email' contains @demo. (should be excluded)"
    fi

    if [[ ! "$username" =~ ^[a-z]+$ ]]; then
        test_fail "Record $i username '$username' doesn't match lowercase pattern"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All records meet text pattern conditions"
fi

print_success "Find API complex query 02 (deep WHERE clauses) completed successfully"
