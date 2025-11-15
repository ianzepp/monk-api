#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API list: show_hidden affects field visibility"

setup_test_with_template "file-list-show-hidden"
setup_full_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Test 1: List record directory with default (show_hidden=false)
print_step "Testing list with default show_hidden=false"

default_list=$(file_list "/data/account/$ACCOUNT_ID")
entry_count_default=$(echo "$default_list" | jq '.entries | length')
[[ "$entry_count_default" -gt 0 ]] || test_fail "Record directory should have field entries"
print_success "Default listing shows $entry_count_default field entries"

# Verify system fields are not listed by default
access_read_entry=$(echo "$default_list" | jq '.entries[] | select(.name == "access_read")')
[[ -z "$access_read_entry" || "$access_read_entry" == "null" ]] || test_fail "access_read should be hidden by default"
print_success "System fields hidden in default listing"

# Test 2: List with explicit show_hidden=false
print_step "Testing list with explicit show_hidden=false"

false_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:false}}')
false_list=$(file_api_post "list" "$false_request")
entry_count_false=$(echo "$false_list" | jq '.entries | length')

[[ "$entry_count_false" -eq "$entry_count_default" ]] || \
    test_fail "Explicit show_hidden=false should match default count"
print_success "Explicit show_hidden=false matches default: $entry_count_false entries"

# Test 3: List with show_hidden=true (should include system fields)
print_step "Testing list with show_hidden=true"

true_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:true}}')
true_list=$(file_api_post "list" "$true_request")
entry_count_true=$(echo "$true_list" | jq '.entries | length')

[[ "$entry_count_true" -gt "$entry_count_default" ]] || \
    test_fail "show_hidden=true should produce more entries (includes system fields)"

entry_difference=$((entry_count_true - entry_count_default))
print_success "show_hidden=true produces more entries: $entry_count_true total (delta: +$entry_difference system fields)"

# Verify system fields are now visible
access_read_visible=$(echo "$true_list" | jq '.entries[] | select(.name == "access_read")')
[[ -n "$access_read_visible" && "$access_read_visible" != "null" ]] || test_fail "access_read should be visible with show_hidden=true"
print_success "System fields visible with show_hidden=true"

# Test 4: Verify retrieve respects show_hidden
print_step "Verifying retrieve respects show_hidden"

# Retrieve with show_hidden=false
retrieve_false_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:false}}')
retrieve_false=$(file_api_post "retrieve" "$retrieve_false_req")
content_false=$(echo "$retrieve_false" | jq -r '.content')

# Verify system fields are absent
access_read_false=$(echo "$content_false" | jq -r '.access_read // "absent"')
[[ "$access_read_false" == "absent" ]] || test_fail "access_read should be absent with show_hidden=false"
print_success "Retrieve with show_hidden=false excludes system fields"

# Retrieve with show_hidden=true
retrieve_true_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:true}}')
retrieve_true=$(file_api_post "retrieve" "$retrieve_true_req")
content_true=$(echo "$retrieve_true" | jq -r '.content')

# Verify system fields are present
access_read_true=$(echo "$content_true" | jq -r '.access_read // "absent"')
[[ "$access_read_true" != "absent" ]] || test_fail "access_read should be present with show_hidden=true"
print_success "Retrieve with show_hidden=true includes system fields"

print_success "All list show_hidden tests passed"
