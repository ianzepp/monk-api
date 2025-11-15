#!/usr/bin/env bash
set -e

# ACLs API POST (Append/Merge) Test
# Tests merging new ACL entries with existing ones using POST method

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing ACLs API POST (append/merge) functionality"

# Setup test environment with template and authentication (full)
setup_test_with_template "append-acls-test"
setup_full_auth

# Find an existing record to work with (use first account record)
print_step "Finding existing record to test ACL appending"

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

# Test 1: Verify record initially has empty ACLs
print_step "Verifying initial ACL state"

initial_acls=$(auth_get "api/acls/account/$record_id")
assert_success "$initial_acls"

initial_read=$(echo "$initial_acls" | jq -r '.data.access_lists.access_read')
initial_edit=$(echo "$initial_acls" | jq -r '.data.access_lists.access_edit')

if [[ "$initial_read" == "[]" && "$initial_edit" == "[]" ]]; then
    print_success "Record initially has empty ACL arrays"
else
    print_warning "Record has existing ACLs: read=$initial_read, edit=$initial_edit"
fi

# Test 2: First POST - Add initial ACL entries
print_step "First POST: Adding initial ACL entries"

first_acl_data='{
  "access_read": ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"],
  "access_edit": ["33333333-3333-3333-3333-333333333333"]
}'

first_response=$(auth_post "api/acls/account/$record_id" "$first_acl_data")
assert_success "$first_response"

# Verify first addition
first_read=$(echo "$first_response" | jq -r '.data.access_lists.access_read')
first_edit=$(echo "$first_response" | jq -r '.data.access_lists.access_edit')

if echo "$first_read" | jq -e 'contains(["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"])' >/dev/null; then
    print_success "First POST added correct access_read entries"
else
    test_fail "First POST failed to add access_read entries: $first_read"
fi

if echo "$first_edit" | jq -e 'contains(["33333333-3333-3333-3333-333333333333"])' >/dev/null; then
    print_success "First POST added correct access_edit entries"
else
    test_fail "First POST failed to add access_edit entries: $first_edit"
fi

# Test 3: Second POST - Append additional entries (merge behavior)
print_step "Second POST: Appending additional ACL entries"

second_acl_data='{
  "access_read": ["44444444-4444-4444-4444-444444444444"],
  "access_edit": ["55555555-5555-5555-5555-555555555555", "33333333-3333-3333-3333-333333333333"]
}'

second_response=$(auth_post "api/acls/account/$record_id" "$second_acl_data")
assert_success "$second_response"

# Verify merging behavior
merged_read=$(echo "$second_response" | jq -r '.data.access_lists.access_read')
merged_edit=$(echo "$second_response" | jq -r '.data.access_lists.access_edit')

# Should have all 3 read entries: original 2 + new 1
if echo "$merged_read" | jq -e 'contains(["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "44444444-4444-4444-4444-444444444444"]) and length == 3' >/dev/null; then
    print_success "POST correctly merged access_read entries (3 total)"
else
    test_fail "POST merge failed for access_read: $merged_read"
fi

# Should have 2 edit entries: original 1 + new 1 (duplicate should not be added)
if echo "$merged_edit" | jq -e 'contains(["33333333-3333-3333-3333-333333333333", "55555555-5555-5555-5555-555555555555"]) and length == 2' >/dev/null; then
    print_success "POST correctly merged access_edit entries (no duplicates)"
else
    test_fail "POST merge failed for access_edit: $merged_edit"
fi

# Test 4: Verify Data API shows merged results
print_step "Verifying merged ACLs via Data API"

data_record=$(auth_get "api/data/account/$record_id")
assert_success "$data_record"

data_read=$(echo "$data_record" | jq -r '.data.access_read')
data_edit=$(echo "$data_record" | jq -r '.data.access_edit')

# Verify Data API shows same merged results
if echo "$data_read" | jq -e 'length == 3' >/dev/null; then
    print_success "Data API shows merged access_read entries (3 total)"
else
    test_fail "Data API doesn't show correct merged access_read: $data_read"
fi

if echo "$data_edit" | jq -e 'length == 2' >/dev/null; then
    print_success "Data API shows merged access_edit entries (2 total, no duplicates)"
else
    test_fail "Data API doesn't show correct merged access_edit: $data_edit"
fi

# Test 5: POST with partial data (only one field)
print_step "Testing POST with partial ACL data"

partial_acl_data='{
  "access_full": ["66666666-6666-6666-6666-666666666666"]
}'

partial_response=$(auth_post "api/acls/account/$record_id" "$partial_acl_data")
assert_success "$partial_response"

# Verify existing fields are preserved and new field is added
final_read=$(echo "$partial_response" | jq -r '.data.access_lists.access_read')
final_edit=$(echo "$partial_response" | jq -r '.data.access_lists.access_edit')
final_full=$(echo "$partial_response" | jq -r '.data.access_lists.access_full')

if echo "$final_read" | jq -e 'length == 3' >/dev/null; then
    print_success "Partial POST preserved existing access_read entries"
else
    test_fail "Partial POST didn't preserve access_read entries: $final_read"
fi

if echo "$final_edit" | jq -e 'length == 2' >/dev/null; then
    print_success "Partial POST preserved existing access_edit entries"
else
    test_fail "Partial POST didn't preserve access_edit entries: $final_edit"
fi

if echo "$final_full" | jq -e 'contains(["66666666-6666-6666-6666-666666666666"])' >/dev/null; then
    print_success "Partial POST added new access_full entry"
else
    test_fail "Partial POST didn't add access_full entry: $final_full"
fi

print_success "ACLs API POST (append/merge) functionality test completed successfully"

# Summary
print_step "Test Summary"
echo "✅ POST merges new entries with existing ACLs"
echo "✅ POST prevents duplicate entries"
echo "✅ POST preserves existing fields when updating partial data"
echo "✅ Data API integration shows merged results"
echo "✅ Multiple POST operations accumulate correctly"
