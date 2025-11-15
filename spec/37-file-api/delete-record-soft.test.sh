#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API delete: soft delete of record"

setup_test_with_template "file-delete-record"
setup_full_auth

DELETE_ID=$(uuidgen | tr 'A-Z' 'a-z')
DELETE_EMAIL="file-api-delete+${DELETE_ID}@example.com"
DELETE_USERNAME="fileapi_delete_${DELETE_ID//-/}"
create_payload=$(jq -n --arg id "$DELETE_ID" --arg email "$DELETE_EMAIL" --arg username "$DELETE_USERNAME" --arg account_type "personal" --argjson balance 0 '{id:$id,name:"Delete Candidate",email:$email,username:$username,account_type:$account_type,balance:$balance}')
file_store "/data/account/$DELETE_ID" "$create_payload" >/dev/null
print_success "Created temporary record $DELETE_ID"

delete_response=$(file_delete "/data/account/$DELETE_ID")
operation=$(echo "$delete_response" | jq -r '.operation')
[[ "$operation" == "soft_delete" ]] || test_fail "Expected soft_delete operation, got: $operation"

deleted_count=$(echo "$delete_response" | jq -r '.results.deleted_count')
[[ "$deleted_count" -eq 1 ]] || test_fail "Delete response deleted_count mismatch: $deleted_count"

print_success "Soft delete response validated"

# Record should no longer be retrievable
test_file_api_error "retrieve" "/data/account/$DELETE_ID" "RECORD_NOT_FOUND" "retrieving deleted record"

print_success "Deleted record is no longer accessible"
