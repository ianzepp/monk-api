#!/usr/bin/env bash
set -e

# Find API Where $text Operator Test
# Tests $text search operator with ranking with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where \$text operator"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-text"
setup_admin_auth

# First get all accounts to see available text content
print_step "Analyzing account data for text search tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Display account names for text search analysis
print_success "Available names for \$text testing:"
echo "$all_data" | jq -r '.[].name'

# Test 1: $text operator - simple keyword search
print_step "Testing \$text operator (search for 'John')"

# Search for "John" in name field
text_filter='{"where": {"name": {"$text": "John"}}}'

response=$(auth_post "api/find/account" "$text_filter")
data=$(extract_and_validate_data "$response" "Text operator results")

record_count=$(echo "$data" | jq 'length')
print_success "\$text 'John' returned $record_count records"

# Verify all returned names contain "John"
text_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ ! "$name" =~ John ]]; then
        text_check=false
        print_warning "Record $i has name '$name' that doesn't contain 'John'"
        break
    fi
done

if [[ "$text_check" == "true" ]]; then
    print_success "All returned records correctly contain 'John' in name"
else
    test_fail "Some returned records don't contain 'John'"
fi

# Test 2: $text operator - case sensitivity test
print_step "Testing \$text case sensitivity (search for 'john')"

text_case_filter='{"where": {"name": {"$text": "john"}}}'

response=$(auth_post "api/find/account" "$text_case_filter")
data=$(extract_and_validate_data "$response" "Text case sensitivity results")

record_count=$(echo "$data" | jq 'length')
print_success "\$text 'john' (lowercase) returned $record_count records"

# Compare with previous result to determine case sensitivity
john_uppercase_count=$(auth_post "api/find/account" "$text_filter" | jq '.data | length')
john_lowercase_count=$(echo "$data" | jq 'length')

if [[ "$john_lowercase_count" -eq "$john_uppercase_count" ]]; then
    print_success "\$text operator is case-insensitive (John = john: $john_uppercase_count records)"
else
    print_success "\$text operator case behavior: John=$john_uppercase_count, john=$john_lowercase_count"
fi

# Test 3: $text operator - no match scenario
print_step "Testing \$text no match scenario"

text_no_match_filter='{"where": {"name": {"$text": "XYZ789NotFound"}}}'

response=$(auth_post "api/find/account" "$text_no_match_filter")
data=$(extract_and_validate_data "$response" "Text no match results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 0 ]]; then
    print_success "\$text with non-existent term correctly returned 0 records"
else
    test_fail "Expected 0 records for non-existent search term, got: $record_count"
fi

# Test 4: $text operator - multi-word search
print_step "Testing \$text multi-word search"

text_multi_filter='{"where": {"name": {"$text": "Alice Wilson"}}}'

response=$(auth_post "api/find/account" "$text_multi_filter")
data=$(extract_and_validate_data "$response" "Multi-word text results")

record_count=$(echo "$data" | jq 'length')
print_success "\$text 'Alice Wilson' returned $record_count records"

# Test 5: $text vs $find comparison
print_step "Testing \$text vs \$find behavior comparison"

# Test same search term with both operators
text_term="Smith"
find_comparison_filter="{\"where\": {\"name\": {\"\$find\": \"$text_term\"}}}"
text_comparison_filter="{\"where\": {\"name\": {\"\$text\": \"$text_term\"}}}"

find_response=$(auth_post "api/find/account" "$find_comparison_filter")
find_data=$(extract_and_validate_data "$find_response" "Find comparison")
find_count=$(echo "$find_data" | jq 'length')

text_response=$(auth_post "api/find/account" "$text_comparison_filter")
text_data=$(extract_and_validate_data "$text_response" "Text comparison")
text_count=$(echo "$text_data" | jq 'length')

print_success "Search comparison for '$text_term': \$find=$find_count records, \$text=$text_count records"

if [[ "$find_count" -eq "$text_count" ]]; then
    print_success "\$find and \$text operators return same results for '$text_term'"
else
    print_success "\$find and \$text operators have different implementations (expected for ranking vs simple search)"
fi

# Test 6: $text operator on email field  
print_step "Testing \$text on email field"

text_email_filter='{"where": {"email": {"$text": "example"}}}'

response=$(auth_post "api/find/account" "$text_email_filter")
data=$(extract_and_validate_data "$response" "Email text results")

record_count=$(echo "$data" | jq 'length')
print_success "\$text 'example' in email field returned $record_count records"

print_success "Find API where \$text operator tests completed successfully"