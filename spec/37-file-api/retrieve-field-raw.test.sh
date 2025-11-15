#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API retrieve: record and field content"

setup_test_with_template "file-retrieve-field-raw"
setup_full_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Retrieve full record
record_response=$(file_retrieve "/data/account/$ACCOUNT_ID")
assert_has_field "content" "$record_response"

record_id=$(echo "$record_response" | jq -r '.content.id')
[[ "$record_id" == "$ACCOUNT_ID" ]] || test_fail "Record retrieve id mismatch"

record_email=$(echo "$record_response" | jq -r '.content.email')
[[ "$record_email" == "$ACCOUNT_EMAIL" ]] || test_fail "Record retrieve email mismatch"

print_success "Record retrieval content validated"

# Retrieve field as JSON
email_response=$(file_retrieve "/data/account/$ACCOUNT_ID/email")
email_value=$(echo "$email_response" | jq -r '.content')
[[ "$email_value" == "$ACCOUNT_EMAIL" ]] || test_fail "Email field retrieval mismatch"
print_success "Field retrieval returns expected content"

# Retrieve field in raw mode with offset and length
raw_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID/email" '{path:$path,file_options:{format:"raw",start_offset:3,max_bytes:4}}')
raw_partial=$(file_api_post "retrieve" "$raw_request")
partial_content=$(echo "$raw_partial" | jq -r '.content')
expected_partial=${ACCOUNT_EMAIL:3:4}
[[ "$partial_content" == "$expected_partial" ]] || test_fail "Partial content mismatch: expected '$expected_partial' got '$partial_content'"

can_resume=$(echo "$raw_partial" | jq -r '.file_metadata.can_resume')
[[ "$can_resume" == "true" ]] || test_fail "Partial raw retrieve should set can_resume=true"
print_success "Raw retrieval with offsets validated"

# Ensure nonexistent field returns FIELD_NOT_FOUND
test_file_api_error "retrieve" "/data/account/$ACCOUNT_ID/not_a_field" "FIELD_NOT_FOUND" "Nonexistent field retrieval"
