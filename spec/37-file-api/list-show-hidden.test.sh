#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API list: show_hidden affects .json file sizes"

setup_test_with_template "file-list-show-hidden"
setup_admin_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Test 1: List record directory with default (show_hidden=false)
print_step "Testing list with default show_hidden=false"

default_list=$(file_list "/data/account/$ACCOUNT_ID")
json_entry_default=$(echo "$default_list" | jq ".entries[] | select(.name == \"$ACCOUNT_ID.json\")")
[[ -n "$json_entry_default" ]] || test_fail "JSON file should be present in listing"

size_default=$(echo "$json_entry_default" | jq -r '.file_size')
[[ "$size_default" -gt 0 ]] || test_fail "JSON file size should be greater than 0"
print_success "Default listing shows JSON file with size: $size_default bytes"

# Test 2: List with explicit show_hidden=false
print_step "Testing list with explicit show_hidden=false"

false_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:false}}')
false_list=$(file_api_post "list" "$false_request")
json_entry_false=$(echo "$false_list" | jq ".entries[] | select(.name == \"$ACCOUNT_ID.json\")")
size_false=$(echo "$json_entry_false" | jq -r '.file_size')

[[ "$size_false" -eq "$size_default" ]] || \
    test_fail "Explicit show_hidden=false should match default size"
print_success "Explicit show_hidden=false matches default: $size_false bytes"

# Test 3: List with show_hidden=true (should include system fields)
print_step "Testing list with show_hidden=true"

true_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{show_hidden:true}}')
true_list=$(file_api_post "list" "$true_request")
json_entry_true=$(echo "$true_list" | jq ".entries[] | select(.name == \"$ACCOUNT_ID.json\")")
size_true=$(echo "$json_entry_true" | jq -r '.file_size')

[[ "$size_true" -gt "$size_default" ]] || \
    test_fail "show_hidden=true should produce larger file size (includes ACL and timestamps)"

size_difference=$((size_true - size_default))
print_success "show_hidden=true produces larger file: $size_true bytes (delta: +$size_difference bytes)"

# Test 4: Verify actual content sizes match by retrieving
print_step "Verifying file sizes match actual content"

# Retrieve with show_hidden=false
retrieve_false_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID.json" \
    '{path:$path,file_options:{show_hidden:false}}')
retrieve_false=$(file_api_post "retrieve" "$retrieve_false_req")
content_false=$(echo "$retrieve_false" | jq -r '.content')
content_false_str=$(echo "$content_false" | jq -c '.')
content_false_size=${#content_false_str}

# The listed size should roughly match the retrieved content size
# (Allow some variance for JSON formatting differences)
size_diff_false=$((content_false_size - size_default))
size_diff_false=${size_diff_false#-}  # absolute value
if [[ "$size_diff_false" -lt 50 ]]; then
    print_success "Listed size matches retrieved content (show_hidden=false): $size_default ≈ $content_false_size"
else
    test_fail "Size mismatch too large: listed=$size_default vs content=$content_false_size"
fi

# Retrieve with show_hidden=true
retrieve_true_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID.json" \
    '{path:$path,file_options:{show_hidden:true}}')
retrieve_true=$(file_api_post "retrieve" "$retrieve_true_req")
content_true=$(echo "$retrieve_true" | jq -r '.content')
content_true_str=$(echo "$content_true" | jq -c '.')
content_true_size=${#content_true_str}

size_diff_true=$((content_true_size - size_true))
size_diff_true=${size_diff_true#-}  # absolute value
if [[ "$size_diff_true" -lt 50 ]]; then
    print_success "Listed size matches retrieved content (show_hidden=true): $size_true ≈ $content_true_size"
else
    test_fail "Size mismatch too large: listed=$size_true vs content=$content_true_size"
fi

print_success "All list show_hidden tests passed"
