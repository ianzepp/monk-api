#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API list: WHERE clause filtering"

setup_test_with_template "file-list-where"
setup_admin_auth

accounts_response=$(auth_get "api/data/account")
accounts_data=$(extract_and_validate_data "$accounts_response" "Account listing")

business_record=$(echo "$accounts_data" | jq 'map(select(.account_type == "business")) | first')
if [[ "$business_record" == "null" ]]; then
    test_fail "Expected to find business account in template"
fi

BUSINESS_ID=$(echo "$business_record" | jq -r '.id')
BUSINESS_NAME=$(echo "$business_record" | jq -r '.name')

print_success "Business account detected: $BUSINESS_NAME ($BUSINESS_ID)"

# Test 1: Schema listing applies WHERE filter
print_step "Listing /data/account with account_type=business filter"

list_business_req=$(jq -n --arg path "/data/account" '{path:$path,file_options:{where:{account_type:"business"}}}')
list_business=$(file_api_post "list" "$list_business_req")

business_count=$(echo "$list_business" | jq '.entries | length')
[[ "$business_count" -eq 1 ]] || test_fail "Expected exactly 1 business record, got $business_count"
print_success "Schema listing returned single business record"

business_entry_name=$(echo "$list_business" | jq -r '.entries[0].name')
[[ "$business_entry_name" == "$BUSINESS_ID" ]] || test_fail "Expected business record directory to match ID"
print_success "Schema listing entry matches business record ID"

business_total=$(echo "$list_business" | jq '.total')
[[ "$business_total" -eq 1 ]] || test_fail "Expected total=1 for business filter, got $business_total"
print_success "Schema listing total reflects filtered results"

# Test 2: Record directory honors matching WHERE clause
print_step "Listing /data/account/$BUSINESS_ID with matching where clause"

record_list_match_req=$(jq -n --arg path "/data/account/$BUSINESS_ID" '{path:$path,file_options:{where:{account_type:"business"}}}')
record_list_match=$(file_api_post "list" "$record_list_match_req")

record_entries_count=$(echo "$record_list_match" | jq '.entries | length')
[[ "$record_entries_count" -gt 0 ]] || test_fail "Record directory should include fields when filter matches"
print_success "Record directory includes entries when filter matches"

# Test 3: Record directory with non-matching WHERE clause returns empty entries but metadata
print_step "Listing /data/account/$BUSINESS_ID with non-matching where clause"

record_list_miss_req=$(jq -n --arg path "/data/account/$BUSINESS_ID" '{path:$path,file_options:{where:{account_type:"personal"}}}')
record_list_miss=$(file_api_post "list" "$record_list_miss_req")

record_miss_count=$(echo "$record_list_miss" | jq '.entries | length')
[[ "$record_miss_count" -eq 0 ]] || test_fail "Record directory should return no entries when filter misses"
print_success "Record directory returns no entries for non-matching filter"

record_meta_path=$(echo "$record_list_miss" | jq -r '.file_metadata.path')
[[ "$record_meta_path" == "/data/account/$BUSINESS_ID" ]] || test_fail "Metadata path should remain consistent for record directory"
print_success "Record directory metadata remains available for non-matching filter"

print_success "File API WHERE clause filtering tests passed"
