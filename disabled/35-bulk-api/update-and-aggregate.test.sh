#!/usr/bin/env bash
set -e

# Bulk API Update & Aggregate Validation Test

source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Bulk API update-all, update-any, and aggregate behavior"

setup_test_with_template "update-and-aggregate"
setup_full_auth

# Fetch baseline account data
accounts_response=$(auth_get "api/data/account")
accounts_data=$(extract_and_validate_data "$accounts_response" "Initial accounts")
first_account_id=$(echo "$accounts_data" | jq -r '.[0].id')
second_account_id=$(echo "$accounts_data" | jq -r '.[1].id')

if [[ -z "$first_account_id" || "$first_account_id" == "null" ]]; then
    test_fail "Failed to obtain account id for update-all test"
fi

if [[ -z "$second_account_id" || "$second_account_id" == "null" ]]; then
    test_fail "Failed to obtain second account id for update-all test"
fi

print_step "Validating update-all succeeds with array payload and ids"
update_all_request=$(cat <<EOF
{
  "operations": [
    {
      "operation": "update-all",
      "model": "account",
      "data": [
        {"id": "${first_account_id}", "is_verified": true},
        {"id": "${second_account_id}", "is_verified": false}
      ]
    }
  ]
}
EOF
)

update_all_response=$(auth_post "api/bulk" "$update_all_request")
if echo "$update_all_response" | jq -e '.success == true' >/dev/null; then
    print_success "update-all operation succeeded"
else
    test_fail "update-all operation failed: $update_all_response"
fi

# Verify updates persisted
post_update_response=$(auth_get "api/data/account")
post_update_data=$(extract_and_validate_data "$post_update_response" "Accounts after update-all")
updated_first=$(echo "$post_update_data" | jq --arg id "$first_account_id" '.[] | select(.id == $id)')
updated_second=$(echo "$post_update_data" | jq --arg id "$second_account_id" '.[] | select(.id == $id)')

if [[ $(echo "$updated_first" | jq -r '.is_verified') == "true" && $(echo "$updated_second" | jq -r '.is_verified') == "false" ]]; then
    print_success "update-all changes persisted"
else
    test_fail "update-all changes did not persist as expected"
fi

print_step "Ensuring update-all rejects filter usage"
invalid_filter_request=$(cat <<EOF
{
  "operations": [
    {
      "operation": "update-all",
      "model": "account",
      "filter": {"where": {"id": "${first_account_id}"}},
      "data": [
        {"id": "${first_account_id}", "is_verified": false}
      ]
    }
  ]
}
EOF
)

invalid_filter_response=$(auth_post "api/bulk" "$invalid_filter_request" || true)
invalid_filter_code=$(echo "$invalid_filter_response" | jq -r '.error_code // empty')
if [[ "$invalid_filter_code" == "OPERATION_INVALID_FILTER" ]]; then
    print_success "update-all correctly rejected filter"
else
    test_fail "Expected OPERATION_INVALID_FILTER, got: $invalid_filter_response"
fi

print_step "Ensuring update-any requires filter"
missing_filter_request='{
  "operations": [
    {
      "operation": "update-any",
      "model": "account",
      "data": {"is_active": false}
    }
  ]
}'

missing_filter_response=$(auth_post "api/bulk" "$missing_filter_request" || true)
missing_filter_code=$(echo "$missing_filter_response" | jq -r '.error_code // empty')
if [[ "$missing_filter_code" == "OPERATION_MISSING_FILTER" ]]; then
    print_success "update-any missing filter validation succeeded"
else
    test_fail "Expected OPERATION_MISSING_FILTER, got: $missing_filter_response"
fi

print_step "Validating aggregate helper succeeds"
aggregate_request='{
  "operations": [
    {
      "operation": "aggregate",
      "model": "account",
      "aggregate": {
        "total_accounts": {"$count": "*"},
        "active_accounts": {"$count": "is_active"}
      },
      "groupBy": "account_type"
    }
  ]
}'

aggregate_response=$(auth_post "api/bulk" "$aggregate_request")
if echo "$aggregate_response" | jq -e '.success == true' >/dev/null; then
    print_success "aggregate operation succeeded"
else
    test_fail "aggregate operation failed: $aggregate_response"
fi

aggregate_rows=$(echo "$aggregate_response" | jq '.data[0].result | length')
if [[ "$aggregate_rows" -gt 0 ]]; then
    print_success "aggregate returned $aggregate_rows grouped rows"
else
    test_fail "aggregate returned no rows: $aggregate_response"
fi

print_success "Bulk API update and aggregate validation test completed"
