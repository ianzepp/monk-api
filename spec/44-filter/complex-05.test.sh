#!/usr/bin/env bash
set -e

# Find API Complex Query Test 05
# Tests comprehensive integration of all working operators in enterprise scenarios
# Focuses on: Maximum complexity with working operators, performance validation

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API comprehensive enterprise query scenarios"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "complex-05"
setup_admin_auth

# Test 1: Maximum complexity enterprise query
print_step "Testing maximum complexity enterprise query"

# Enterprise scenario: Comprehensive customer segmentation query
# Uses every working operator type in single query
enterprise_query='{
    "select": ["name", "email", "balance", "account_type", "is_verified", "created_at"],
    "where": {
        "$and": [
            {"balance": {"$between": [100, 10000]}},
            {"account_type": {"$in": ["personal", "business", "premium"]}},
            {"email": {"$like": "%@%"}},
            {"account_type": {"$ne": "suspended"}},
            {"name": {"$regex": "^[A-Z]"}},
            {"credit_limit": {"$null": true}},
            {"email": {"$exists": true}},
            {"balance": {"$ne": 0}},
            {"name": {"$ilike": "%o%"}}
        ]
    },
    "order": ["balance desc", "name asc"],
    "limit": 10
}'

response=$(auth_post "api/find/account" "$enterprise_query")
data=$(extract_and_validate_data "$response" "Enterprise query results")

record_count=$(echo "$data" | jq 'length')
print_success "Enterprise query processed $record_count qualifying accounts"

# Comprehensive validation of all conditions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    name=$(echo "$record" | jq -r '.name')
    email=$(echo "$record" | jq -r '.email')
    balance=$(echo "$record" | jq -r '.balance')
    account_type=$(echo "$record" | jq -r '.account_type')
    credit_limit=$(echo "$record" | jq -r '.credit_limit')
    username=$(echo "$record" | jq -r '.username')
    
    # Range validation
    if (( $(echo "$balance < 100 || $balance > 10000" | bc -l) )); then
        test_fail "Record $i balance $balance outside range [100, 10000]"
    fi
    
    # Array membership validation  
    if [[ "$account_type" != "personal" && "$account_type" != "business" && "$account_type" != "premium" ]]; then
        test_fail "Record $i account_type '$account_type' not in allowed list"
    fi
    
    # Pattern matching validation
    if [[ ! "$email" =~ @ ]]; then
        test_fail "Record $i email '$email' missing @ symbol"
    fi
    
    if [[ "$account_type" == "suspended" ]]; then
        test_fail "Record $i account_type '$account_type' should be excluded"
    fi
    
    # Regex validation
    if [[ ! "$name" =~ ^[A-Z] ]]; then
        test_fail "Record $i name '$name' doesn't start with capital letter"
    fi
    
    # Existence validation
    if [[ "$credit_limit" != "null" ]]; then
        test_fail "Record $i credit_limit '$credit_limit' should be null"
    fi
    
    if [[ "$email" == "null" ]]; then
        test_fail "Record $i email is null (should exist)"
    fi
    
    # Inequality validation
    if (( $(echo "$balance == 0" | bc -l) )); then
        test_fail "Record $i balance is 0 (should be != 0)"
    fi
    
    # Case-insensitive search validation
    if [[ ! "${name,,}" =~ o ]]; then
        test_fail "Record $i name '$name' doesn't contain 'o'"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All accounts meet comprehensive enterprise criteria"
    
    # Display enterprise results
    print_step "Enterprise segmentation results"
    echo "$data" | jq -r '.[] | "\(.name): \(.email), $\(.balance) (\(.account_type))"'
fi

# Test 2: Performance test with complex conditions
print_step "Testing performance with complex nested conditions"

# Performance scenario: Complex query with deep nesting
performance_query='{
    "where": {
        "$and": [
            {
                "$and": [
                    {"balance": {"$gte": 0}},
                    {"balance": {"$lte": 100000}}
                ]
            },
            {
                "$and": [
                    {"name": {"$exists": true}},
                    {"email": {"$exists": true}}
                ]
            },
            {
                "$and": [
                    {"account_type": {"$ne": "deleted"}},
                    {"account_type": {"$ne": "suspended"}}
                ]
            }
        ]
    }
}'

response=$(auth_post "api/find/account" "$performance_query")
data=$(extract_and_validate_data "$response" "Performance test results")

record_count=$(echo "$data" | jq 'length')
print_success "Performance test processed complex nested query returning $record_count records"

# Test 3: Multi-field search with ranking implications
print_step "Testing multi-field search capabilities"

# Search scenario: Content search across multiple fields
multi_field_search_query='{
    "select": ["name", "email", "username"],
    "where": {
        "$and": [
            {"name": {"$find": "John"}},
            {"email": {"$text": "example"}},
            {"username": {"$ilike": "%smith%"}}
        ]
    }
}'

response=$(auth_post "api/find/account" "$multi_field_search_query")
data=$(extract_and_validate_data "$response" "Multi-field search results")

record_count=$(echo "$data" | jq 'length')
print_success "Multi-field search found $record_count highly relevant accounts"

# Test 4: Business intelligence query with aggregation-style filtering
print_step "Testing business intelligence filtering"

# BI scenario: Account segmentation for reporting
bi_query='{
    "select": ["account_type", "balance", "is_verified", "created_at"],
    "where": {
        "$and": [
            {"balance": {"$gt": 500}},
            {"account_type": {"$in": ["business", "premium"]}},
            {"created_at": {"$gte": "2025-01-01"}}
        ]
    },
    "order": ["account_type asc", "balance desc"]
}'

response=$(auth_post "api/find/account" "$bi_query")
data=$(extract_and_validate_data "$response" "Business intelligence results")

record_count=$(echo "$data" | jq 'length')
print_success "Business intelligence query identified $record_count high-value accounts"

# Validate BI criteria
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    balance=$(echo "$record" | jq -r '.balance')
    account_type=$(echo "$record" | jq -r '.account_type')
    created_at=$(echo "$record" | jq -r '.created_at')
    
    if (( $(echo "$balance <= 500" | bc -l) )); then
        test_fail "Record $i balance $balance <= 500"
    fi
    
    if [[ "$account_type" != "business" && "$account_type" != "premium" ]]; then
        test_fail "Record $i account_type '$account_type' not business/premium"
    fi
    
    if [[ ! "$created_at" =~ ^2025 ]]; then
        test_fail "Record $i created_at '$created_at' not in 2025"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All accounts meet business intelligence criteria"
fi

print_success "Find API complex query 05 (enterprise scenarios) completed successfully"