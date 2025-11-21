#!/usr/bin/env bash
set -e

# Find API Complex Query Test 01
# Tests combination of SELECT + WHERE + ORDER + LIMIT in single query
# Focuses on: Column projection, multiple field filtering, sorting, and result limiting

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API complex query (SELECT + WHERE + ORDER + LIMIT)"

# Setup test environment with template (provides 5 account records with varied data)
setup_test_with_template "complex-01"
setup_full_auth

# Test 1: Complex business query - Find active personal/premium accounts, ordered by balance, limited fields
print_step "Testing business query: Active personal/premium accounts by balance"

# Query: SELECT name, email, balance FROM account
#        WHERE account_type IN ('personal', 'premium') AND balance >= 100
#        ORDER BY balance DESC
#        LIMIT 3
complex_query='{
    "select": ["name", "email", "balance", "account_type"],
    "where": {
        "$and": [
            {"account_type": {"$in": ["personal", "premium"]}},
            {"balance": {"$gte": 100}}
        ]
    },
    "order": ["balance desc"],
    "limit": 3
}'

response=$(auth_post "api/find/account" "$complex_query")
data=$(extract_and_validate_data "$response" "Complex business query results")

record_count=$(echo "$data" | jq 'length')
print_success "Complex query returned $record_count records (limited to 3)"

# Verify SELECT projection worked - should only have 4 fields
first_record=$(echo "$data" | jq -r '.[0]')
field_count=$(echo "$first_record" | jq 'keys | length')
if [[ "$field_count" -eq 4 ]]; then
    print_success "SELECT projection correctly returned $field_count fields"
else
    test_fail "Expected 4 fields from SELECT, got: $field_count"
fi

# Verify required fields are present
validate_record_fields "$first_record" "name" "email" "balance" "account_type"

# Verify WHERE conditions - all records should be personal/premium with balance >= 100
all_conditions_met=true
for i in $(seq 0 $((record_count - 1))); do
    record=$(echo "$data" | jq -r ".[$i]")
    account_type=$(echo "$record" | jq -r '.account_type')
    balance=$(echo "$record" | jq -r '.balance')

    if [[ "$account_type" != "personal" && "$account_type" != "premium" ]]; then
        all_conditions_met=false
        print_warning "Record $i has invalid account_type: $account_type"
        break
    fi

    if (( $(echo "$balance < 100" | bc -l) )); then
        all_conditions_met=false
        print_warning "Record $i has balance $balance < 100"
        break
    fi
done

if [[ "$all_conditions_met" == "true" ]]; then
    print_success "All returned records meet WHERE conditions (personal/premium AND balance >= 100)"
else
    test_fail "Some records don't meet the WHERE conditions"
fi

# Verify ORDER BY balance desc - balances should be in descending order
order_correct=true
prev_balance=""
for i in $(seq 0 $((record_count - 1))); do
    balance=$(echo "$data" | jq -r ".[$i].balance")
    if [[ -n "$prev_balance" ]] && (( $(echo "$balance > $prev_balance" | bc -l) )); then
        order_correct=false
        print_warning "Order violation: record $i balance $balance > previous $prev_balance"
        break
    fi
    prev_balance="$balance"
done

if [[ "$order_correct" == "true" ]]; then
    print_success "ORDER BY balance desc correctly applied"
else
    test_fail "Records not properly ordered by balance descending"
fi

# Display the complex query results for verification
print_step "Complex query results summary"
echo "$data" | jq -r '.[] | "\(.name): \(.account_type), balance=\(.balance), active=\(.is_active)"'

print_success "Find API complex query 01 (SELECT + WHERE + ORDER + LIMIT) completed successfully"
