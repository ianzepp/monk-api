#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API retrieve: show_hidden field filtering"

setup_test_with_template "file-retrieve-show-hidden"
setup_admin_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Test 1: Default behavior (show_hidden=false) - hidden fields should be stripped
print_step "Testing default retrieve (show_hidden=false)"

default_response=$(file_retrieve "/data/account/$ACCOUNT_ID")
assert_has_field "content" "$default_response"

# Verify ID is present (should always be visible)
record_id=$(echo "$default_response" | jq -r '.content.id')
[[ "$record_id" == "$ACCOUNT_ID" ]] || test_fail "Record ID should always be present"
print_success "ID field present in default response"

# Verify user data fields are present
record_email=$(echo "$default_response" | jq -r '.content.email')
[[ "$record_email" == "$ACCOUNT_EMAIL" ]] || test_fail "User fields should be present by default"
print_success "User data fields present in default response"

# Verify ACL fields are hidden (should be null/absent)
access_read=$(echo "$default_response" | jq -r '.content.access_read // "absent"')
access_edit=$(echo "$default_response" | jq -r '.content.access_edit // "absent"')
access_full=$(echo "$default_response" | jq -r '.content.access_full // "absent"')
access_deny=$(echo "$default_response" | jq -r '.content.access_deny // "absent"')

[[ "$access_read" == "absent" ]] || test_fail "access_read should be hidden by default"
[[ "$access_edit" == "absent" ]] || test_fail "access_edit should be hidden by default"
[[ "$access_full" == "absent" ]] || test_fail "access_full should be hidden by default"
[[ "$access_deny" == "absent" ]] || test_fail "access_deny should be hidden by default"
print_success "ACL fields hidden in default response"

# Verify timestamp fields are hidden
created_at=$(echo "$default_response" | jq -r '.content.created_at // "absent"')
updated_at=$(echo "$default_response" | jq -r '.content.updated_at // "absent"')
trashed_at=$(echo "$default_response" | jq -r '.content.trashed_at // "absent"')
deleted_at=$(echo "$default_response" | jq -r '.content.deleted_at // "absent"')

[[ "$created_at" == "absent" ]] || test_fail "created_at should be hidden by default"
[[ "$updated_at" == "absent" ]] || test_fail "updated_at should be hidden by default"
[[ "$trashed_at" == "absent" ]] || test_fail "trashed_at should be hidden by default"
[[ "$deleted_at" == "absent" ]] || test_fail "deleted_at should be hidden by default"
print_success "Timestamp fields hidden in default response"

# Test 2: Explicit show_hidden=false - should behave same as default
print_step "Testing explicit show_hidden=false"

explicit_false_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:false}}')
explicit_false_response=$(file_api_post "retrieve" "$explicit_false_request")

explicit_id=$(echo "$explicit_false_response" | jq -r '.content.id')
[[ "$explicit_id" == "$ACCOUNT_ID" ]] || test_fail "ID should be present with show_hidden=false"

explicit_access_read=$(echo "$explicit_false_response" | jq -r '.content.access_read // "absent"')
[[ "$explicit_access_read" == "absent" ]] || test_fail "ACL fields should be hidden with show_hidden=false"

explicit_created_at=$(echo "$explicit_false_response" | jq -r '.content.created_at // "absent"')
[[ "$explicit_created_at" == "absent" ]] || test_fail "Timestamp fields should be hidden with show_hidden=false"

print_success "Explicit show_hidden=false works correctly"

# Test 3: show_hidden=true - all fields should be visible
print_step "Testing show_hidden=true"

show_hidden_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:true}}')
show_hidden_response=$(file_api_post "retrieve" "$show_hidden_request")

# Verify ID still present
visible_id=$(echo "$show_hidden_response" | jq -r '.content.id')
[[ "$visible_id" == "$ACCOUNT_ID" ]] || test_fail "ID should be present with show_hidden=true"
print_success "ID field present with show_hidden=true"

# Verify user data still present
visible_email=$(echo "$show_hidden_response" | jq -r '.content.email')
[[ "$visible_email" == "$ACCOUNT_EMAIL" ]] || test_fail "User fields should still be present with show_hidden=true"
print_success "User data fields present with show_hidden=true"

# Verify ACL fields are NOW visible
visible_access_read=$(echo "$show_hidden_response" | jq -r '.content.access_read // "absent"')
visible_access_edit=$(echo "$show_hidden_response" | jq -r '.content.access_edit // "absent"')
visible_access_full=$(echo "$show_hidden_response" | jq -r '.content.access_full // "absent"')
visible_access_deny=$(echo "$show_hidden_response" | jq -r '.content.access_deny // "absent"')

# These should NOT be "absent" anymore - they should be null or arrays
[[ "$visible_access_read" != "absent" ]] || test_fail "access_read should be visible with show_hidden=true"
[[ "$visible_access_edit" != "absent" ]] || test_fail "access_edit should be visible with show_hidden=true"
[[ "$visible_access_full" != "absent" ]] || test_fail "access_full should be visible with show_hidden=true"
[[ "$visible_access_deny" != "absent" ]] || test_fail "access_deny should be visible with show_hidden=true"
print_success "ACL fields visible with show_hidden=true"

# Verify timestamp fields are NOW visible
visible_created_at=$(echo "$show_hidden_response" | jq -r '.content.created_at // "absent"')
visible_updated_at=$(echo "$show_hidden_response" | jq -r '.content.updated_at // "absent"')

# These should be valid ISO timestamps, not "absent"
[[ "$visible_created_at" != "absent" && "$visible_created_at" != "null" ]] || \
    test_fail "created_at should be visible with show_hidden=true"
[[ "$visible_updated_at" != "absent" && "$visible_updated_at" != "null" ]] || \
    test_fail "updated_at should be visible with show_hidden=true"
print_success "Timestamp fields visible with show_hidden=true"

# Test 4: Verify field-level retrieval is not affected by show_hidden
print_step "Testing field retrieval (should not be affected by show_hidden)"

email_field_response=$(file_retrieve "/data/account/$ACCOUNT_ID/email")
email_content=$(echo "$email_field_response" | jq -r '.content')
[[ "$email_content" == "$ACCOUNT_EMAIL" ]] || test_fail "Field retrieval should work normally"
print_success "Field-level retrieval unaffected by show_hidden"

# Test 5: Test with raw format
print_step "Testing show_hidden with raw format"

raw_hidden_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{format:"raw",show_hidden:false}}')
raw_hidden_response=$(file_api_post "retrieve" "$raw_hidden_request")

raw_content=$(echo "$raw_hidden_response" | jq -r '.content')
# Parse the raw JSON string to verify fields are filtered
raw_parsed=$(echo "$raw_content" | jq '.')
raw_access_read=$(echo "$raw_parsed" | jq -r '.access_read // "absent"')
[[ "$raw_access_read" == "absent" ]] || test_fail "Raw format should also respect show_hidden"
print_success "Raw format respects show_hidden option"

print_success "All show_hidden field filtering tests passed"
