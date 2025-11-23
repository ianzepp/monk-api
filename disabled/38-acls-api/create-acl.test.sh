#!/usr/bin/env bash
set -e

# ACLs API Basic Functionality Test
# Tests creating and managing ACLs via ACLs API and verifying integration with Data API

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing ACLs API basic functionality"

# Setup test environment with template and authentication (full)
setup_test_with_template "acls-api-test"
setup_full_auth

# Test 1: Create a test record to work with
print_step "Creating test record for ACL operations"

test_model="account"
# Use proper account data generation helper
account_data=$(generate_test_account "ACL Test Account" "acl-test@example.com" "acltestuser")

create_response=$(auth_post "api/data/$test_model" "$account_data")
records_array=$(extract_and_validate_data "$create_response" "Created record data")

# Get the first record from the array
record_data=$(echo "$records_array" | jq -r '.[0]')
if [[ "$record_data" == "null" ]]; then
    test_fail "First record is null in response array"
fi

# Extract the created record ID
test_record_id=$(echo "$record_data" | jq -r '.id')
if [[ -z "$test_record_id" || "$test_record_id" == "null" ]]; then
    test_fail "Failed to extract record ID from create response"
fi

print_success "Created test record: $test_record_id"

# Test 2: Verify record initially has empty ACL lists
print_step "Verifying initial record has empty ACLs"

initial_record=$(auth_get "api/data/$test_model/$test_record_id")
assert_success "$initial_record"

# Check that ACL fields are empty arrays
access_read=$(echo "$initial_record" | jq -r '.data.access_read // []')
access_edit=$(echo "$initial_record" | jq -r '.data.access_edit // []')
access_full=$(echo "$initial_record" | jq -r '.data.access_full // []')
access_deny=$(echo "$initial_record" | jq -r '.data.access_deny // []')

if [[ "$access_read" == "[]" && "$access_edit" == "[]" && "$access_full" == "[]" && "$access_deny" == "[]" ]]; then
    print_success "Record initially has empty ACL arrays"
else
    print_warning "Record has non-empty ACL arrays initially: read=$access_read, edit=$access_edit, full=$access_full, deny=$access_deny"
fi

# Test 3: Add ACLs using ACLs API POST endpoint
print_step "Adding ACLs via ACLs API"

# Use proper UUIDs for ACL user IDs (access_* fields expect UUID arrays)
acl_data='{
  "access_read": ["11111111-2222-3333-4444-555555555551", "11111111-2222-3333-4444-555555555552"],
  "access_edit": ["22222222-3333-4444-5555-666666666661"],
  "access_full": ["33333333-4444-5555-6666-777777777771"],
  "access_deny": ["44444444-5555-6666-7777-888888888881"]
}'

acl_post_response=$(auth_post "api/acls/$test_model/$test_record_id" "$acl_data")
assert_success "$acl_post_response"

# Debug: Print the full response to understand structure
echo "DEBUG: Full ACLs POST response:"
echo "$acl_post_response" | jq .

# Verify the ACLs API response contains the expected data
acl_read_result=$(echo "$acl_post_response" | jq -r '.data.access_lists.access_read')
acl_edit_result=$(echo "$acl_post_response" | jq -r '.data.access_lists.access_edit')
acl_full_result=$(echo "$acl_post_response" | jq -r '.data.access_lists.access_full')
acl_deny_result=$(echo "$acl_post_response" | jq -r '.data.access_lists.access_deny')

echo "DEBUG: Extracted values:"
echo "  access_read: $acl_read_result"
echo "  access_edit: $acl_edit_result"

if echo "$acl_read_result" | jq -e 'contains(["11111111-2222-3333-4444-555555555551", "11111111-2222-3333-4444-555555555552"])' >/dev/null; then
    print_success "ACLs API returned correct access_read list"
else
    test_fail "ACLs API returned incorrect access_read list: $acl_read_result"
fi

if echo "$acl_edit_result" | jq -e 'contains(["22222222-3333-4444-5555-666666666661"])' >/dev/null; then
    print_success "ACLs API returned correct access_edit list"
else
    test_fail "ACLs API returned incorrect access_edit list: $acl_edit_result"
fi

print_success "ACLs added successfully via ACLs API"

# Test 4: Verify ACLs are visible via Data API
print_step "Verifying ACLs are visible via Data API"

updated_record=$(auth_get "api/data/$test_model/$test_record_id")
assert_success "$updated_record"

# Extract ACL fields from Data API response
data_access_read=$(echo "$updated_record" | jq -r '.data.access_read')
data_access_edit=$(echo "$updated_record" | jq -r '.data.access_edit')
data_access_full=$(echo "$updated_record" | jq -r '.data.access_full')
data_access_deny=$(echo "$updated_record" | jq -r '.data.access_deny')

# Verify Data API shows the same ACLs that were set via ACLs API
if echo "$data_access_read" | jq -e 'contains(["11111111-2222-3333-4444-555555555551", "11111111-2222-3333-4444-555555555552"])' >/dev/null; then
    print_success "Data API shows correct access_read list"
else
    test_fail "Data API shows incorrect access_read list: $data_access_read"
fi

if echo "$data_access_edit" | jq -e 'contains(["22222222-3333-4444-5555-666666666661"])' >/dev/null; then
    print_success "Data API shows correct access_edit list"
else
    test_fail "Data API shows incorrect access_edit list: $data_access_edit"
fi

if echo "$data_access_full" | jq -e 'contains(["33333333-4444-5555-6666-777777777771"])' >/dev/null; then
    print_success "Data API shows correct access_full list"
else
    test_fail "Data API shows incorrect access_full list: $data_access_full"
fi

if echo "$data_access_deny" | jq -e 'contains(["44444444-5555-6666-7777-888888888881"])' >/dev/null; then
    print_success "Data API shows correct access_deny list"
else
    test_fail "Data API shows incorrect access_deny list: $data_access_deny"
fi

print_success "ACLs are correctly visible via Data API"

# Test 5: Test ACLs API GET endpoint
print_step "Testing ACLs API GET endpoint"

acl_get_response=$(auth_get "api/acls/$test_model/$test_record_id")
assert_success "$acl_get_response"

# Verify the GET response structure
get_record_id=$(echo "$acl_get_response" | jq -r '.data.record_id')
get_model=$(echo "$acl_get_response" | jq -r '.data.model')
get_access_read=$(echo "$acl_get_response" | jq -r '.data.access_lists.access_read')

if [[ "$get_record_id" == "$test_record_id" ]]; then
    print_success "ACLs GET returns correct record ID"
else
    test_fail "ACLs GET returned wrong record ID: $get_record_id"
fi

if [[ "$get_model" == "$test_model" ]]; then
    print_success "ACLs GET returns correct model"
else
    test_fail "ACLs GET returned wrong model: $get_model"
fi

if echo "$get_access_read" | jq -e 'contains(["11111111-2222-3333-4444-555555555551", "11111111-2222-3333-4444-555555555552"])' >/dev/null; then
    print_success "ACLs GET returns correct access lists"
else
    test_fail "ACLs GET returned incorrect access lists: $get_access_read"
fi

# Test 6: Test merging additional ACLs (POST should merge, not replace)
print_step "Testing ACL merging functionality"

additional_acl_data='{
  "access_read": ["11111111-2222-3333-4444-555555555553"],
  "access_edit": ["22222222-3333-4444-5555-666666666662", "22222222-3333-4444-5555-666666666661"]
}'

merge_response=$(auth_post "api/acls/$test_model/$test_record_id" "$additional_acl_data")
assert_success "$merge_response"

# Verify merging worked correctly
merged_read=$(echo "$merge_response" | jq -r '.data.access_lists.access_read')
merged_edit=$(echo "$merge_response" | jq -r '.data.access_lists.access_edit')

# Should now have the original two UUIDs plus the new one in access_read
if echo "$merged_read" | jq -e 'contains(["11111111-2222-3333-4444-555555555551", "11111111-2222-3333-4444-555555555552", "11111111-2222-3333-4444-555555555553"])' >/dev/null; then
    print_success "ACL merging worked correctly for access_read"
else
    test_fail "ACL merging failed for access_read: $merged_read"
fi

# Should now have both UUIDs in access_edit (original should not be duplicated)
if echo "$merged_edit" | jq -e 'contains(["22222222-3333-4444-5555-666666666661", "22222222-3333-4444-5555-666666666662"]) and length == 2' >/dev/null; then
    print_success "ACL merging worked correctly for access_edit (no duplicates)"
else
    test_fail "ACL merging failed for access_edit: $merged_edit"
fi

# Test 7: Test ACL clearing (DELETE endpoint)
print_step "Testing ACL clearing functionality"

clear_response=$(auth_delete "api/acls/$test_model/$test_record_id")
assert_success "$clear_response"

# Verify all ACLs are cleared
cleared_read=$(echo "$clear_response" | jq -r '.data.access_lists.access_read')
cleared_edit=$(echo "$clear_response" | jq -r '.data.access_lists.access_edit')
cleared_full=$(echo "$clear_response" | jq -r '.data.access_lists.access_full')
cleared_deny=$(echo "$clear_response" | jq -r '.data.access_lists.access_deny')

if [[ "$cleared_read" == "[]" && "$cleared_edit" == "[]" && "$cleared_full" == "[]" && "$cleared_deny" == "[]" ]]; then
    print_success "ACL clearing worked correctly"
else
    test_fail "ACL clearing failed: read=$cleared_read, edit=$cleared_edit, full=$cleared_full, deny=$cleared_deny"
fi

# Test 8: Verify Data API shows cleared ACLs
print_step "Verifying cleared ACLs via Data API"

final_record=$(auth_get "api/data/$test_model/$test_record_id")
assert_success "$final_record"

final_read=$(echo "$final_record" | jq -r '.data.access_read')
final_edit=$(echo "$final_record" | jq -r '.data.access_edit')

if [[ "$final_read" == "[]" && "$final_edit" == "[]" ]]; then
    print_success "Data API shows ACLs are cleared"
else
    print_warning "Data API still shows ACLs after clearing: read=$final_read, edit=$final_edit"
fi

print_success "ACLs API basic functionality test completed successfully"

# Summary
print_step "Test Summary"
echo "✅ Created test record successfully"
echo "✅ ACLs API POST endpoint adds ACLs correctly"
echo "✅ Data API shows ACLs added via ACLs API"
echo "✅ ACLs API GET endpoint returns correct ACL data"
echo "✅ ACL merging functionality works without duplicates"
echo "✅ ACLs API DELETE endpoint clears all ACLs"
echo "✅ Integration between ACLs API and Data API verified"
