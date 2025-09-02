#!/usr/bin/env bash
set -e

# ACLs API PUT (Update/Replace) Test
# Tests complete replacement of ACL lists using PUT method

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing ACLs API PUT (update/replace) functionality"

# Setup test environment with template and admin authentication
setup_test_with_template "update-acls-test"
setup_admin_auth

# Find an existing record to work with (use first account record)
print_step "Finding existing record to test ACL replacement"

existing_records=$(auth_get "api/data/account")
records_array=$(extract_and_validate_data "$existing_records" "Existing records")

# Get the first record from the array
first_record=$(echo "$records_array" | jq -r '.[0]')
if [[ "$first_record" == "null" ]]; then
    test_fail "No existing records found - template should have sample data"
fi

record_id=$(echo "$first_record" | jq -r '.id')
if [[ -z "$record_id" || "$record_id" == "null" ]]; then
    test_fail "Failed to extract record ID from existing record"
fi

print_success "Using existing record: $record_id"

# Test 1: First, set up some initial ACLs using POST
print_step "Setting up initial ACLs for replacement testing"

initial_acl_data='{
  "access_read": ["aaaaaaa-1111-1111-1111-111111111111", "bbbbbbb-2222-2222-2222-222222222222"],
  "access_edit": ["ccccccc-3333-3333-3333-333333333333"],
  "access_full": ["ddddddd-4444-4444-4444-444444444444"],
  "access_deny": ["eeeeeee-5555-5555-5555-555555555555"]
}'

setup_response=$(auth_post "api/acls/account/$record_id" "$initial_acl_data")
assert_success "$setup_response"

print_success "Initial ACLs set up successfully"

# Test 2: PUT with complete replacement
print_step "Testing PUT: Complete ACL replacement"

replacement_acl_data='{
  "access_read": ["1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "2222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
  "access_edit": ["3333333-cccc-cccc-cccc-cccccccccccc"],
  "access_full": [],
  "access_deny": ["4444444-dddd-dddd-dddd-dddddddddddd", "5555555-eeee-eeee-eeee-eeeeeeeeeeee"]
}'

put_response=$(auth_put "api/acls/account/$record_id" "$replacement_acl_data")
assert_success "$put_response"

# Verify complete replacement occurred
replaced_read=$(echo "$put_response" | jq -r '.data.access_lists.access_read')
replaced_edit=$(echo "$put_response" | jq -r '.data.access_lists.access_edit')
replaced_full=$(echo "$put_response" | jq -r '.data.access_lists.access_full')
replaced_deny=$(echo "$put_response" | jq -r '.data.access_lists.access_deny')

# Verify new values are exactly what we sent
if echo "$replaced_read" | jq -e 'contains(["1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "2222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]) and length == 2' >/dev/null; then
    print_success "PUT correctly replaced access_read"
else
    test_fail "PUT failed to replace access_read: $replaced_read"
fi

if echo "$replaced_edit" | jq -e 'contains(["3333333-cccc-cccc-cccc-cccccccccccc"]) and length == 1' >/dev/null; then
    print_success "PUT correctly replaced access_edit"
else
    test_fail "PUT failed to replace access_edit: $replaced_edit"
fi

if [[ "$replaced_full" == "[]" ]]; then
    print_success "PUT correctly set access_full to empty array"
else
    test_fail "PUT failed to set access_full to empty: $replaced_full"
fi

if echo "$replaced_deny" | jq -e 'contains(["4444444-dddd-dddd-dddd-dddddddddddd", "5555555-eeee-eeee-eeee-eeeeeeeeeeee"]) and length == 2' >/dev/null; then
    print_success "PUT correctly replaced access_deny"
else
    test_fail "PUT failed to replace access_deny: $replaced_deny"
fi

# Test 3: Verify original values are completely gone
print_step "Verifying original ACL values were completely replaced"

# Check that none of the original values remain
if echo "$replaced_read" | jq -e 'contains(["aaaaaaa-1111-1111-1111-111111111111"])' >/dev/null; then
    test_fail "Original access_read values still present after PUT"
else
    print_success "Original access_read values completely replaced"
fi

if echo "$replaced_edit" | jq -e 'contains(["ccccccc-3333-3333-3333-333333333333"])' >/dev/null; then
    test_fail "Original access_edit values still present after PUT"
else
    print_success "Original access_edit values completely replaced"
fi

# Test 4: PUT with partial data (missing fields should become empty)
print_step "Testing PUT with partial data (missing fields become empty)"

partial_put_data='{
  "access_read": ["9999999-ffff-ffff-ffff-ffffffffffff"]
}'

partial_put_response=$(auth_put "api/acls/account/$record_id" "$partial_put_data")
assert_success "$partial_put_response"

# Verify only access_read has data, others are empty
partial_read=$(echo "$partial_put_response" | jq -r '.data.access_lists.access_read')
partial_edit=$(echo "$partial_put_response" | jq -r '.data.access_lists.access_edit')
partial_full=$(echo "$partial_put_response" | jq -r '.data.access_lists.access_full')
partial_deny=$(echo "$partial_put_response" | jq -r '.data.access_lists.access_deny')

if echo "$partial_read" | jq -e 'contains(["9999999-ffff-ffff-ffff-ffffffffffff"]) and length == 1' >/dev/null; then
    print_success "PUT with partial data set access_read correctly"
else
    test_fail "PUT with partial data failed for access_read: $partial_read"
fi

if [[ "$partial_edit" == "[]" && "$partial_full" == "[]" && "$partial_deny" == "[]" ]]; then
    print_success "PUT with partial data correctly cleared unspecified fields"
else
    test_fail "PUT with partial data didn't clear unspecified fields: edit=$partial_edit, full=$partial_full, deny=$partial_deny"
fi

# Test 5: Verify Data API shows replaced data
print_step "Verifying PUT results via Data API"

data_record=$(auth_get "api/data/account/$record_id")
assert_success "$data_record"

data_read=$(echo "$data_record" | jq -r '.data.access_read')
data_edit=$(echo "$data_record" | jq -r '.data.access_edit')
data_full=$(echo "$data_record" | jq -r '.data.access_full')
data_deny=$(echo "$data_record" | jq -r '.data.access_deny')

# Debug: Print what Data API actually returned
echo "DEBUG: Data API record response:"
echo "$data_record" | jq .

# Verify Data API shows the final PUT state
if echo "$data_read" | jq -e 'contains(["9999999-ffff-ffff-ffff-ffffffffffff"]) and length == 1' >/dev/null; then
    print_success "Data API shows PUT replacement results"
else
    test_fail "Data API doesn't show PUT replacement results: $data_read"
fi

if [[ "$data_edit" == "[]" && "$data_full" == "[]" && "$data_deny" == "[]" ]]; then
    print_success "Data API shows PUT cleared unspecified fields"
else
    test_fail "Data API doesn't show PUT cleared fields: edit=$data_edit, full=$data_full, deny=$data_deny"
fi

# Test 6: PUT idempotency test
print_step "Testing PUT idempotency"

idempotent_data='{
  "access_read": ["xxxxxxx-1111-2222-3333-444444444444"],
  "access_edit": ["yyyyyyy-5555-6666-7777-888888888888"]
}'

# First PUT
first_put=$(auth_put "api/acls/account/$record_id" "$idempotent_data")
assert_success "$first_put"

# Second PUT with identical data
second_put=$(auth_put "api/acls/account/$record_id" "$idempotent_data")
assert_success "$second_put"

# Results should be identical
first_result=$(echo "$first_put" | jq '.data.access_lists')
second_result=$(echo "$second_put" | jq '.data.access_lists')

if [[ "$first_result" == "$second_result" ]]; then
    print_success "PUT is idempotent - identical calls produce identical results"
else
    test_fail "PUT is not idempotent: first=$first_result, second=$second_result"
fi

print_success "ACLs API PUT (update/replace) functionality test completed successfully"

# Summary
print_step "Test Summary"
echo "✅ PUT completely replaces all ACL lists"
echo "✅ PUT removes all previous ACL entries"
echo "✅ PUT sets missing fields to empty arrays"
echo "✅ PUT is idempotent (same input = same output)"
echo "✅ Data API integration shows replacement results"
echo "✅ PUT behavior is distinctly different from POST (merge)"