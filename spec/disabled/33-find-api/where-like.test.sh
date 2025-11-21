#!/usr/bin/env bash
set -e

# Find API Where LIKE Operators Test
# Tests $like, $ilike, $nlike, $nilike pattern matching operators with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where LIKE operators"

# Setup test environment with template (provides 5 account records with varying names/emails)
setup_test_with_template "where-like"
setup_full_auth

# First get all accounts to see name/email patterns
print_step "Analyzing account data for pattern matching tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Display account names and emails for pattern analysis
print_success "Template accounts for pattern testing:"
echo "$all_data" | jq -r '.[] | "\(.name) - \(.email)"'

# Test 1: $like operator (case-sensitive pattern matching)
print_step "Testing \$like operator (case-sensitive)"

# Test pattern: names starting with "J"
like_filter='{"where": {"name": {"$like": "J%"}}}'

response=$(auth_post "api/find/account" "$like_filter")
data=$(extract_and_validate_data "$response" "Like operator results")

record_count=$(echo "$data" | jq 'length')
print_success "\$like 'J%' returned $record_count records"

# Verify all returned names start with "J"
like_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ ! "$name" =~ ^J ]]; then
        like_check=false
        break
    fi
done

if [[ "$like_check" == "true" ]]; then
    print_success "All returned records correctly match 'J%' pattern"
else
    test_fail "Some returned records don't match 'J%' pattern"
fi

# Test 2: $ilike operator (case-insensitive pattern matching)
print_step "Testing \$ilike operator (case-insensitive)"

# Test pattern: names containing "smith" (any case)
ilike_filter='{"where": {"name": {"$ilike": "%smith%"}}}'

response=$(auth_post "api/find/account" "$ilike_filter")
data=$(extract_and_validate_data "$response" "Ilike operator results")

record_count=$(echo "$data" | jq 'length')
print_success "\$ilike '%smith%' returned $record_count records"

# Verify all returned names contain "smith" (case insensitive)
ilike_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ ! "${name,,}" =~ smith ]]; then
        ilike_check=false
        break
    fi
done

if [[ "$ilike_check" == "true" ]]; then
    print_success "All returned records correctly match '%smith%' pattern (case-insensitive)"
else
    test_fail "Some returned records don't match '%smith%' pattern"
fi

# Test 3: $nlike operator (NOT LIKE, case-sensitive)
print_step "Testing \$nlike operator (NOT LIKE)"

# Test pattern: exclude names starting with "J"
nlike_filter='{"where": {"name": {"$nlike": "J%"}}}'

response=$(auth_post "api/find/account" "$nlike_filter")
data=$(extract_and_validate_data "$response" "Not like operator results")

record_count=$(echo "$data" | jq 'length')
expected_count=$((5 - $(auth_post "api/find/account" "$like_filter" | jq '.data | length')))

if [[ "$record_count" -eq "$expected_count" ]]; then
    print_success "\$nlike 'J%' correctly returned $record_count records (excluded J% matches)"
else
    test_fail "Expected $expected_count records for \$nlike, got: $record_count"
fi

# Verify no returned names start with "J"
nlike_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ "$name" =~ ^J ]]; then
        nlike_check=false
        break
    fi
done

if [[ "$nlike_check" == "true" ]]; then
    print_success "All returned records correctly excluded 'J%' pattern"
else
    test_fail "Some returned records incorrectly match 'J%' pattern"
fi

# Test 4: $nilike operator (NOT ILIKE, case-insensitive)
print_step "Testing \$nilike operator (NOT ILIKE)"

# Test pattern: exclude names containing "smith" (any case)
nilike_filter='{"where": {"name": {"$nilike": "%smith%"}}}'

response=$(auth_post "api/find/account" "$nilike_filter")
data=$(extract_and_validate_data "$response" "Not ilike operator results")

record_count=$(echo "$data" | jq 'length')
print_success "\$nilike '%smith%' returned $record_count records"

# Verify no returned names contain "smith" (case insensitive)
nilike_check=true
for i in $(seq 0 $((record_count - 1))); do
    name=$(echo "$data" | jq -r ".[$i].name")
    if [[ "${name,,}" =~ smith ]]; then
        nilike_check=false
        break
    fi
done

if [[ "$nilike_check" == "true" ]]; then
    print_success "All returned records correctly excluded '%smith%' pattern (case-insensitive)"
else
    test_fail "Some returned records incorrectly match '%smith%' pattern"
fi

# Test 5: Email domain pattern matching
print_step "Testing email domain pattern matching"

# Test pattern: emails ending with specific domains
domain_filter='{"where": {"email": {"$like": "%@example.com"}}}'

response=$(auth_post "api/find/account" "$domain_filter")
data=$(extract_and_validate_data "$response" "Email domain results")

record_count=$(echo "$data" | jq 'length')
print_success "Email domain pattern '%@example.com' returned $record_count records"

# Verify all returned emails end with @example.com
domain_check=true
for i in $(seq 0 $((record_count - 1))); do
    email=$(echo "$data" | jq -r ".[$i].email")
    if [[ ! "$email" =~ @example\.com$ ]]; then
        domain_check=false
        break
    fi
done

if [[ "$domain_check" == "true" ]]; then
    print_success "All returned records correctly have '@example.com' domain"
else
    test_fail "Some returned records don't have '@example.com' domain"
fi

print_success "Find API where LIKE operators tests completed successfully"
