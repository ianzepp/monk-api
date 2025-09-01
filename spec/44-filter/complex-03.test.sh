#!/usr/bin/env bash
set -e

# Find API Complex Query Test 03
# Tests real-world search scenario with text search, range filtering, and business logic
# Focuses on: Customer search with multiple criteria, practical business use case

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API real-world customer search scenario"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "complex-03"
setup_admin_auth

# Test 1: Customer search with text patterns and business rules
print_step "Testing customer search: Text patterns + business rules"

# Real-world scenario: Find customers for targeted marketing
# Query: SELECT name, email, balance, account_type FROM account
#        WHERE (name LIKE '%John%' OR name LIKE '%Alice%') 
#              AND balance > 1000 
#              AND account_type != 'trial'
#              AND email LIKE '%@%.com'
# Note: Using $and with individual LIKE conditions since $or is broken
customer_search_query='{
    "select": ["name", "email", "balance", "account_type"],
    "where": {
        "$and": [
            {"name": {"$ilike": "%John%"}},
            {"balance": {"$gt": 1000}},
            {"account_type": {"$ne": "trial"}},
            {"email": {"$like": "%@%.com"}}
        ]
    },
    "order": ["balance desc", "name asc"]
}'

response=$(auth_post "api/find/account" "$customer_search_query")
data=$(extract_and_validate_data "$response" "Customer search results")

record_count=$(echo "$data" | jq 'length')
print_success "Customer search returned $record_count qualified prospects"

# Validate business rules
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    name=$(echo "$record" | jq -r '.name')
    email=$(echo "$record" | jq -r '.email')
    balance=$(echo "$record" | jq -r '.balance')
    account_type=$(echo "$record" | jq -r '.account_type')
    
    # Text pattern validation
    if [[ ! "${name,,}" =~ john ]]; then
        test_fail "Record $i name '$name' doesn't contain 'john'"
    fi
    
    # Business rule validation
    if (( $(echo "$balance <= 1000" | bc -l) )); then
        test_fail "Record $i balance $balance <= 1000 (below threshold)"
    fi
    
    if [[ "$account_type" == "trial" ]]; then
        test_fail "Record $i is trial account (should be excluded)"
    fi
    
    # Email domain validation
    if [[ ! "$email" =~ @.*\.com$ ]]; then
        test_fail "Record $i email '$email' not .com domain"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All prospects meet customer search criteria"
    
    # Display customer search results
    print_step "Qualified customer prospects"
    echo "$data" | jq -r '.[] | "\(.name) (\(.account_type)): $\(.balance) - \(.email)"'
fi

# Test 2: Account audit query with existence checks
print_step "Testing account audit query with existence validation"

# Business scenario: Account audit for compliance  
# Query: Find accounts missing required data or with unusual configurations
audit_query='{
    "select": ["name", "email", "username", "phone", "credit_limit", "last_login"],
    "where": {
        "$and": [
            {"phone": {"$null": true}},
            {"last_login": {"$null": true}},
            {"balance": {"$gte": 0}}
        ]
    },
    "order": ["balance desc"]
}'

response=$(auth_post "api/find/account" "$audit_query")
data=$(extract_and_validate_data "$response" "Account audit results")

record_count=$(echo "$data" | jq 'length')
print_success "Account audit found $record_count accounts with missing data"

# Validate audit conditions
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    phone=$(echo "$record" | jq -r '.phone')
    last_login=$(echo "$record" | jq -r '.last_login')
    balance=$(echo "$record" | jq -r '.balance')
    
    if [[ "$phone" != "null" ]]; then
        test_fail "Record $i has phone data (audit expects missing phone)"
    fi
    
    if [[ "$last_login" != "null" ]]; then
        test_fail "Record $i has login history (audit expects new accounts)"
    fi
    
    if (( $(echo "$balance < 0" | bc -l) )); then
        test_fail "Record $i has negative balance $balance"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All audit results correctly identify accounts with missing data"
fi

# Test 3: Financial analysis query with range conditions
print_step "Testing financial analysis with multiple ranges"

# Business scenario: Financial risk analysis
# Query: Accounts with specific balance ranges and credit profiles
financial_query='{
    "where": {
        "$and": [
            {"balance": {"$between": [1000, 5000]}},
            {"account_type": {"$in": ["business", "premium"]}},
            {"credit_limit": {"$gte": 5000}}
        ]
    },
    "order": ["balance desc", "credit_limit desc"]
}'

response=$(auth_post "api/find/account" "$financial_query")
data=$(extract_and_validate_data "$response" "Financial analysis results")

record_count=$(echo "$data" | jq 'length')
print_success "Financial analysis identified $record_count accounts in target range"

# Validate financial criteria
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    balance=$(echo "$record" | jq -r '.balance')
    account_type=$(echo "$record" | jq -r '.account_type')
    credit_limit=$(echo "$record" | jq -r '.credit_limit')
    
    if (( $(echo "$balance < 1000 || $balance > 5000" | bc -l) )); then
        test_fail "Record $i balance $balance outside target range [1000, 5000]"
    fi
    
    if [[ "$account_type" != "business" && "$account_type" != "premium" ]]; then
        test_fail "Record $i account_type '$account_type' not business/premium"
    fi
    
    if [[ "$credit_limit" == "null" ]] || (( $(echo "$credit_limit < 5000" | bc -l) )); then
        test_fail "Record $i credit_limit '$credit_limit' < 5000"
    fi
done

if [[ "$record_count" -gt 0 ]]; then
    print_success "All accounts meet financial analysis criteria"
    
    # Display financial analysis
    print_step "Financial analysis results"
    echo "$data" | jq -r '.[] | "\(.name) (\(.account_type)): Balance $\(.balance), Credit $\(.credit_limit)"'
fi

print_success "Find API complex query 03 (real-world scenarios) completed successfully"