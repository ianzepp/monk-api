#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API list: flat recursive listing"

setup_test_with_template "file-list-flat-recursive"
setup_admin_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Test 1: Flat recursive listing on /describe/account
print_step "Testing flat recursive listing on /describe/account"

flat_request=$(jq -n --arg path "/describe/account" \
    '{path:$path,file_options:{recursive:true,flat:true}}')
flat_response=$(file_api_post "list" "$flat_request")

# All entries should be files (file_type: "f"), not directories
dir_count=$(echo "$flat_response" | jq '[.entries[] | select(.file_type == "d")] | length')
[[ "$dir_count" -eq 0 ]] || test_fail "Flat listing should not contain directories, found: $dir_count"
print_success "Flat listing contains only files (no directories)"

file_count=$(echo "$flat_response" | jq '.entries | length')
[[ "$file_count" -gt 0 ]] || test_fail "Flat listing returned no files"
print_success "Flat listing returned $file_count property files"

# Check that we have property-level paths like /describe/account/email/type
type_properties=$(echo "$flat_response" | jq '[.entries[] | select(.path | endswith("/type"))]')
type_count=$(echo "$type_properties" | jq 'length')
[[ "$type_count" -gt 0 ]] || test_fail "Expected to find property files like .../type"
print_success "Found $type_count 'type' property files"

# Verify all paths start with /describe/account/
invalid_paths=$(echo "$flat_response" | jq '[.entries[] | select(.path | startswith("/describe/account/") | not)] | length')
[[ "$invalid_paths" -eq 0 ]] || test_fail "Found $invalid_paths entries with incorrect path prefix"
print_success "All paths correctly prefixed with /describe/account/"

# Test 2: Flat listing with max_depth limit
print_step "Testing flat listing with max_depth=1"

depth_request=$(jq -n --arg path "/describe/account" \
    '{path:$path,file_options:{recursive:true,flat:true,max_depth:1}}')
depth_response=$(file_api_post "list" "$depth_request")

depth_count=$(echo "$depth_response" | jq '.entries | length')
if [[ "$depth_count" -lt "$file_count" ]]; then
    print_success "max_depth option correctly limits results (full: $file_count, depth=1: $depth_count)"
else
    print_warning "max_depth may not be working as expected (full: $file_count, depth=1: $depth_count)"
fi

# Test 3: Flat listing on /data paths
print_step "Testing flat listing on /data/account/$ACCOUNT_ID"

field_request=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{recursive:true,flat:true}}')
field_response=$(file_api_post "list" "$field_request")

field_count=$(echo "$field_response" | jq '.entries | length')
[[ "$field_count" -gt 0 ]] || test_fail "Expected field files in /data/account/$ACCOUNT_ID"
print_success "Flat listing works for /data paths ($field_count fields)"

# Verify email field exists in flat listing
email_field=$(echo "$field_response" | jq ".entries[] | select(.name == \"email\")")
[[ -n "$email_field" && "$email_field" != "null" ]] || test_fail "Email field missing from flat listing"
print_success "Found email field in flat listing"

print_success "Flat recursive listing tests passed"
