#!/usr/bin/env bash
set -e

# Find API Where $find Operator Test
# Tests $find full-text search operator with POST /api/find/:model

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where \$find operator"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-find"
setup_full_auth

# First get all accounts to see available text content
print_step "Analyzing account data for full-text search tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Display account names for search term analysis
print_success "Available names for \$find testing:"
echo "$all_data" | jq -r '.[].name'

# Test 1: $find operator - simple search term
print_step "Testing \$find operator (search for 'John')"

# Search for "John" in name field
find_filter='{"where": {"name": {"$find": "John"}}}'

response=$(auth_post "api/find/account" "$find_filter")
data=$(extract_and_validate_data "$response" "Find operator results")

record_count=$(echo "$data" | jq 'length')
print_success "\$find 'John' returned $record_count records"

# Verify all returned names contain "John"
find_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ ! "$name" =~ John ]]; then
        find_check=false
        print_warning "Record $i has name '$name' that doesn't contain 'John'"
        break
    fi
done

if [[ "$find_check" == "true" ]]; then
    print_success "All returned records correctly contain 'John' in name"
else
    test_fail "Some returned records don't contain 'John'"
fi

# Test 2: $find operator - partial word search
print_step "Testing \$find operator (search for 'Smith')"

find_partial_filter='{"where": {"name": {"$find": "Smith"}}}'

response=$(auth_post "api/find/account" "$find_partial_filter")
data=$(extract_and_validate_data "$response" "Partial find results")

record_count=$(echo "$data" | jq 'length')
print_success "\$find 'Smith' returned $record_count records"

# Test 3: $find operator - case sensitivity test
print_step "Testing \$find case sensitivity (search for 'smith')"

find_case_filter='{"where": {"name": {"$find": "smith"}}}'

response=$(auth_post "api/find/account" "$find_case_filter")
data=$(extract_and_validate_data "$response" "Case sensitivity results")

record_count=$(echo "$data" | jq 'length')
print_success "\$find 'smith' (lowercase) returned $record_count records"

# Compare with previous result to determine case sensitivity
smith_uppercase_count=$(auth_post "api/find/account" "$find_partial_filter" | jq '.data | length')
smith_lowercase_count=$(echo "$data" | jq 'length')

if [[ "$smith_lowercase_count" -eq "$smith_uppercase_count" ]]; then
    print_success "\$find operator is case-insensitive (Smith = smith: $smith_uppercase_count records)"
elif [[ "$smith_lowercase_count" -gt "$smith_uppercase_count" ]]; then
    print_success "\$find operator is case-insensitive and broader (smith > Smith)"
else
    print_success "\$find operator appears case-sensitive (smith < Smith)"
fi

# Test 4: $find operator - no match scenario
print_step "Testing \$find no match scenario"

find_no_match_filter='{"where": {"name": {"$find": "XYZ123NotFound"}}}'

response=$(auth_post "api/find/account" "$find_no_match_filter")
data=$(extract_and_validate_data "$response" "No match results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 0 ]]; then
    print_success "\$find with non-existent term correctly returned 0 records"
else
    test_fail "Expected 0 records for non-existent search term, got: $record_count"
fi

# Test 5: $find operator - multi-word search
print_step "Testing \$find multi-word search"

find_multi_filter='{"where": {"name": {"$find": "John Smith"}}}'

response=$(auth_post "api/find/account" "$find_multi_filter")
data=$(extract_and_validate_data "$response" "Multi-word search results")

record_count=$(echo "$data" | jq 'length')
print_success "\$find 'John Smith' returned $record_count records"

# Test 6: $find operator on email field
print_step "Testing \$find on email field"

find_email_filter='{"where": {"email": {"$find": "example"}}}'

response=$(auth_post "api/find/account" "$find_email_filter")
data=$(extract_and_validate_data "$response" "Email find results")

record_count=$(echo "$data" | jq 'length')
print_success "\$find 'example' in email field returned $record_count records"

# Verify all returned emails contain "example"
email_find_check=true
for i in $(seq 0 $((record_count - 1))); do
    email=$(echo "$data" | jq -r ".[$i].email")
    if [[ ! "$email" =~ example ]]; then
        email_find_check=false
        break
    fi
done

if [[ "$email_find_check" == "true" ]]; then
    print_success "All returned records correctly contain 'example' in email"
else
    test_fail "Some returned records don't contain 'example' in email"
fi

print_success "Find API where \$find operator tests completed successfully"
