#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API list: root and schema coverage"

setup_test_with_template "file-list-root-schema"
setup_full_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Root listing should expose data/describe
root_response=$(file_list "/")
assert_has_field "entries" "$root_response"
assert_has_field "file_metadata" "$root_response"

root_count=$(echo "$root_response" | jq '.entries | length')
if [[ "$root_count" -eq 2 ]]; then
    print_success "Root listing exposes exactly two namespaces"
else
    test_fail "Root listing expected 2 namespaces, got: $root_count"
fi

data_entry=$(echo "$root_response" | jq '.entries[] | select(.name == "data")')
describe_entry=$(echo "$root_response" | jq '.entries[] | select(.name == "describe")')
[[ -n "$data_entry" && "$data_entry" != "null" ]] || test_fail "Missing data namespace entry"
[[ -n "$describe_entry" && "$describe_entry" != "null" ]] || test_fail "Missing describe namespace entry"
print_success "Root namespace entries validated"

# /data should list schemas including account
schemas_response=$(file_list "/data")
account_schema=$(echo "$schemas_response" | jq '.entries[] | select(.name == "account")')
[[ -n "$account_schema" && "$account_schema" != "null" ]] || test_fail "Account schema missing from /data listing"

schema_path=$(echo "$account_schema" | jq -r '.path')
[[ "$schema_path" == "/data/account/" ]] || test_fail "Account schema path mismatch: $schema_path"
print_success "Schema listing includes account schema"

# /data/account should contain template records and our test account directory
records_response=$(file_list "/data/account")
record_entry=$(echo "$records_response" | jq ".entries[] | select(.name == \"$ACCOUNT_ID\")")
[[ -n "$record_entry" && "$record_entry" != "null" ]] || test_fail "Template account not present in /data/account listing"

record_path=$(echo "$record_entry" | jq -r '.path')
[[ "$record_path" == "/data/account/$ACCOUNT_ID/" ]] || test_fail "Account record path mismatch: $record_path"
print_success "Schema listing exposes target record"

# /data/account/<id> should include non-system fields
record_dir_response=$(file_list "/data/account/$ACCOUNT_ID")

email_entry=$(echo "$record_dir_response" | jq '.entries[] | select(.name == "email")')
[[ -n "$email_entry" && "$email_entry" != "null" ]] || test_fail "Record directory missing email field"

email_size=$(echo "$email_entry" | jq -r '.file_size')
[[ "$email_size" -ge ${#ACCOUNT_EMAIL} ]] || test_fail "Email field size smaller than expected"

print_success "Record directory contents validated"
