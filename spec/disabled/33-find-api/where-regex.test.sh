#!/usr/bin/env bash
set -e

# Find API Where REGEX Operators Test
# Tests $regex, $nregex regular expression operators with POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API where REGEX operators"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "where-regex"
setup_full_auth

# First get all accounts to see data patterns for regex testing
print_step "Analyzing account data for regex pattern tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Display account emails for regex pattern analysis
print_success "Template emails for regex testing:"
echo "$all_data" | jq -r '.[].email'

# Test 1: $regex operator - simple pattern
print_step "Testing \$regex operator (email starting with 'j')"

# Pattern: emails starting with 'j' (case-sensitive)
regex_filter='{"where": {"email": {"$regex": "^j"}}}'

response=$(auth_post "api/find/account" "$regex_filter")
data=$(extract_and_validate_data "$response" "Regex operator results")

record_count=$(echo "$data" | jq 'length')
print_success "\$regex '^j' returned $record_count records"

# Verify all returned emails start with 'j'
regex_check=true
for i in $(seq 0 $((record_count - 1))); do
    email=$(echo "$data" | jq -r ".[$i].email")
    if [[ ! "$email" =~ ^j ]]; then
        regex_check=false
        break
    fi
done

if [[ "$regex_check" == "true" ]]; then
    print_success "All returned records correctly match '^j' regex pattern"
else
    test_fail "Some returned records don't match '^j' regex pattern"
fi

# Test 2: $nregex operator (NOT regex)
print_step "Testing \$nregex operator (NOT starting with 'j')"

nregex_filter='{"where": {"email": {"$nregex": "^j"}}}'

response=$(auth_post "api/find/account" "$nregex_filter")
data=$(extract_and_validate_data "$response" "Not regex operator results")

record_count=$(echo "$data" | jq 'length')
expected_count=$((5 - $(auth_post "api/find/account" "$regex_filter" | jq '.data | length')))

if [[ "$record_count" -eq "$expected_count" ]]; then
    print_success "\$nregex '^j' correctly returned $record_count records (excluded ^j matches)"
else
    test_fail "Expected $expected_count records for \$nregex, got: $record_count"
fi

# Verify no returned emails start with 'j'
nregex_check=true
for i in $(seq 0 $((record_count - 1))); do
    email=$(echo "$data" | jq -r ".[$i].email")
    if [[ "$email" =~ ^j ]]; then
        nregex_check=false
        break
    fi
done

if [[ "$nregex_check" == "true" ]]; then
    print_success "All returned records correctly excluded '^j' regex pattern"
else
    test_fail "Some returned records incorrectly match '^j' regex pattern"
fi

# Test 3: Complex regex pattern - email domain validation
print_step "Testing complex regex pattern (valid email domains)"

# Pattern: emails with common domain extensions (.com, .org, .io)
domain_regex_filter='{"where": {"email": {"$regex": "\\.(com|org|io)$"}}}'

response=$(auth_post "api/find/account" "$domain_regex_filter")
data=$(extract_and_validate_data "$response" "Domain regex results")

record_count=$(echo "$data" | jq 'length')
print_success "Domain regex '\\.(com|org|io)\$' returned $record_count records"

# Verify all returned emails end with .com, .org, or .io
domain_regex_check=true
for i in $(seq 0 $((record_count - 1))); do
    email=$(echo "$data" | jq -r ".[$i].email")
    if [[ ! "$email" =~ \.(com|org|io)$ ]]; then
        domain_regex_check=false
        break
    fi
done

if [[ "$domain_regex_check" == "true" ]]; then
    print_success "All returned records correctly match domain regex pattern"
else
    test_fail "Some returned records don't match domain regex pattern"
fi

# Test 4: Username pattern validation
print_step "Testing username pattern regex"

# Pattern: usernames containing alphanumeric + underscore only
username_regex_filter='{"where": {"username": {"$regex": "^[a-zA-Z0-9_]+$"}}}'

response=$(auth_post "api/find/account" "$username_regex_filter")
data=$(extract_and_validate_data "$response" "Username regex results")

record_count=$(echo "$data" | jq 'length')
print_success "Username regex '^[a-zA-Z0-9_]+\$' returned $record_count records"

# Verify all returned usernames match pattern
username_regex_check=true
for i in $(seq 0 $((record_count - 1))); do
    username=$(echo "$data" | jq -r ".[$i].username")
    if [[ ! "$username" =~ ^[a-zA-Z0-9_]+$ ]]; then
        username_regex_check=false
        break
    fi
done

if [[ "$username_regex_check" == "true" ]]; then
    print_success "All returned records correctly match username regex pattern"
else
    test_fail "Some returned records don't match username regex pattern"
fi

# Test 5: Case-sensitive vs case-insensitive comparison
print_step "Testing case sensitivity difference"

# Compare $regex (case-sensitive) vs $ilike (case-insensitive) for same pattern
case_sensitive='{"where": {"name": {"$regex": "^J"}}}'
case_insensitive='{"where": {"name": {"$ilike": "j%"}}}'

cs_response=$(auth_post "api/find/account" "$case_sensitive")
cs_data=$(extract_and_validate_data "$cs_response" "Case sensitive results")
cs_count=$(echo "$cs_data" | jq 'length')

ci_response=$(auth_post "api/find/account" "$case_insensitive")
ci_data=$(extract_and_validate_data "$ci_response" "Case insensitive results")
ci_count=$(echo "$ci_data" | jq 'length')

print_success "Case sensitivity comparison: \$regex '^J' = $cs_count records, \$ilike 'j%' = $ci_count records"

if [[ "$cs_count" -le "$ci_count" ]]; then
    print_success "Case-insensitive returned same or more matches than case-sensitive (expected)"
else
    test_fail "Case-sensitive returned more matches than case-insensitive (unexpected)"
fi

print_success "Find API where REGEX operators tests completed successfully"
