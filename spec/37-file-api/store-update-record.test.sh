#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API store: create and update records"

setup_test_with_template "file-store-update-record"
setup_admin_auth

NEW_ID=$(uuidgen | tr 'A-Z' 'a-z')
NEW_EMAIL="file-api+${NEW_ID}@example.com"
NEW_USERNAME="fileapi_${NEW_ID//-/}"

create_payload=$(jq -n --arg id "$NEW_ID" --arg email "$NEW_EMAIL" --arg username "$NEW_USERNAME" --arg account_type "personal" --argjson balance 0 '{id:$id,name:"File API Test",email:$email,username:$username,account_type:$account_type,balance:$balance}')
create_response=$(file_store "/data/account/$NEW_ID.json" "$create_payload")

create_op=$(echo "$create_response" | jq -r '.operation')
[[ "$create_op" == "create" ]] || test_fail "Expected create operation, got: $create_op"

created_flag=$(echo "$create_response" | jq -r '.result.created')
[[ "$created_flag" == "true" ]] || test_fail "Create response should mark created=true"

print_success "Record created via file_store"

retrieved=$(file_retrieve "/data/account/$NEW_ID.json")
retrieved_email=$(echo "$retrieved" | jq -r '.content.email')
[[ "$retrieved_email" == "$NEW_EMAIL" ]] || test_fail "Stored record email mismatch"

# Update name field individually
name_payload=$(jq -n --arg value "Updated File API" '$value')
field_update=$(file_store "/data/account/$NEW_ID/name" "$name_payload")
field_op=$(echo "$field_update" | jq -r '.operation')
[[ "$field_op" == "field_update" ]] || test_fail "Field store should report field_update"

updated_name=$(file_retrieve "/data/account/$NEW_ID/name" | jq -r '.content')
[[ "$updated_name" == "Updated File API" ]] || test_fail "Field update did not persist"

# Update entire record
update_payload=$(jq -n --arg id "$NEW_ID" --arg email "$NEW_EMAIL" --arg username "$NEW_USERNAME" --arg account_type "personal" --argjson balance 0 '{id:$id,name:"Updated Again",email:$email,username:$username,account_type:$account_type,balance:$balance}')
update_response=$(file_store "/data/account/$NEW_ID.json" "$update_payload")
update_op=$(echo "$update_response" | jq -r '.operation')
[[ "$update_op" == "update" ]] || test_fail "Expected update operation, got: $update_op"

final_name=$(file_retrieve "/data/account/$NEW_ID/name" | jq -r '.content')
[[ "$final_name" == "Updated Again" ]] || test_fail "Full record update did not persist"

print_success "Field and record updates persisted"

# Cleanup created record
file_delete "/data/account/$NEW_ID"
print_success "Temporary record cleaned up"
