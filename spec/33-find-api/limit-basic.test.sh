#!/usr/bin/env bash
set -e

# Find API Limit Test
# Tests limit functionality with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API limit functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "limit-basic"
setup_admin_auth

# Test 1: Basic limit functionality
print_step "Testing limit=2 functionality"

limit_filter='{"limit": 2}'

response=$(auth_post "api/find/account" "$limit_filter")
data=$(extract_and_validate_data "$response" "Limited results")

# Verify limit is respected
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 2 ]]; then
    print_success "Limit=2 correctly returned $record_count records"
    
    # Verify records have proper structure
    first_record=$(echo "$data" | jq -r '.[0]')
    validate_record_fields "$first_record" "id" "name" "email"
    print_success "Limited results have proper structure"
else
    test_fail "Expected 2 records with limit=2, got: $record_count"
fi

# Test 2: Limit larger than dataset
print_step "Testing limit=10 (larger than available data)"

large_limit_filter='{"limit": 10}'

response=$(auth_post "api/find/account" "$large_limit_filter")
data=$(extract_and_validate_data "$response" "Large limit results")

# Should return all available records (5 from template)
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Large limit correctly returned all $record_count available records"
else
    test_fail "Expected 5 records (all available), got: $record_count"
fi

# Test 3: Combine limit with where condition
print_step "Testing limit combined with where condition"

# Get all accounts first to find a common account type
all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Find account type that appears multiple times
account_type=$(echo "$all_data" | jq -r '.[0].account_type')
matching_count=$(echo "$all_data" | jq --arg type "$account_type" '[.[] | select(.account_type == $type)] | length')

print_success "Testing with account_type '$account_type' (appears $matching_count times)"

# Apply limit=1 to account type filter
combined_filter=$(jq -n --arg type "$account_type" '{where: {account_type: $type}, limit: 1}')

response=$(auth_post "api/find/account" "$combined_filter")
data=$(extract_and_validate_data "$response" "Combined filter results")

# Should return exactly 1 record
record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 1 ]]; then
    print_success "Combined where + limit returned exactly 1 record"
    
    # Verify the returned record matches the filter
    found_type=$(echo "$data" | jq -r '.[0].account_type')
    if [[ "$found_type" == "$account_type" ]]; then
        print_success "Combined filter returned correct account_type: $found_type"
    else
        test_fail "Expected account_type '$account_type', got: '$found_type'"
    fi
else
    test_fail "Expected 1 record with combined filter, got: $record_count"
fi

print_success "Find API limit functionality tests completed successfully"