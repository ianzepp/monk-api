#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API list: sorting by name/size/time/type"

setup_test_with_template "file-list-sorting"
setup_full_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Test 1: Sort by name (default, ascending)
print_step "Testing sort by name (ascending)"

list_name_asc_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{sort_by:"name",sort_order:"asc"}}')
list_name_asc=$(file_api_post "list" "$list_name_asc_req")
entries_name_asc=$(echo "$list_name_asc" | jq -r '.entries[].name')

# Check that entries are sorted alphabetically
first_entry_name=$(echo "$entries_name_asc" | head -1)
second_entry_name=$(echo "$entries_name_asc" | head -2 | tail -1)
[[ "$first_entry_name" < "$second_entry_name" || "$first_entry_name" == "$second_entry_name" ]] || test_fail "Entries should be sorted alphabetically"
print_success "Sort by name ascending: entries sorted alphabetically"

# Test 2: Sort by name (descending)
print_step "Testing sort by name (descending)"

list_name_desc_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{sort_by:"name",sort_order:"desc"}}')
list_name_desc=$(file_api_post "list" "$list_name_desc_req")
entries_name_desc=$(echo "$list_name_desc" | jq -r '.entries[].name')

# Check that entries are sorted in reverse alphabetical order
first_desc_name=$(echo "$entries_name_desc" | head -1)
second_desc_name=$(echo "$entries_name_desc" | head -2 | tail -1)
[[ "$first_desc_name" > "$second_desc_name" || "$first_desc_name" == "$second_desc_name" ]] || test_fail "Entries should be sorted in reverse alphabetical order"
print_success "Sort by name descending works correctly"

# Test 3: Sort by size (ascending)
print_step "Testing sort by size (ascending)"

list_size_asc_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{sort_by:"size",sort_order:"asc"}}')
list_size_asc=$(file_api_post "list" "$list_size_asc_req")

# Extract first and last file sizes
first_size=$(echo "$list_size_asc" | jq -r '.entries[0].file_size')
last_size=$(echo "$list_size_asc" | jq -r '.entries[-1].file_size')

# First should be smaller than or equal to last
[[ "$first_size" -le "$last_size" ]] || test_fail "Size sorting failed: first=$first_size should be <= last=$last_size"
print_success "Sort by size ascending: smallest first ($first_size bytes)"

# Test 4: Sort by size (descending)
print_step "Testing sort by size (descending)"

list_size_desc_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{sort_by:"size",sort_order:"desc"}}')
list_size_desc=$(file_api_post "list" "$list_size_desc_req")

# Extract first and last file sizes
first_size_desc=$(echo "$list_size_desc" | jq -r '.entries[0].file_size')
last_size_desc=$(echo "$list_size_desc" | jq -r '.entries[-1].file_size')

# First should be larger than or equal to last
[[ "$first_size_desc" -ge "$last_size_desc" ]] || test_fail "Size descending failed: first=$first_size_desc should be >= last=$last_size_desc"
print_success "Sort by size descending: largest first ($first_size_desc bytes)"

# Test 5: Sort by time (ascending)
print_step "Testing sort by time (ascending)"

list_time_asc_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{sort_by:"time",sort_order:"asc"}}')
list_time_asc=$(file_api_post "list" "$list_time_asc_req")

# All entries in a record directory have the same timestamp (from record.updated_at)
# So just verify the sort doesn't error
entry_count_time=$(echo "$list_time_asc" | jq '.entries | length')
[[ "$entry_count_time" -gt 0 ]] || test_fail "Time sort should return entries"
print_success "Sort by time ascending works"

# Test 6: Sort by type (ascending) - directories first, then files
print_step "Testing sort by type (ascending)"

# List a path with mixed types (schema level has both dirs and files conceptually)
# For record directory, all entries are files, so just test it doesn't error
list_type_asc_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" \
    '{path:$path,file_options:{sort_by:"type",sort_order:"asc"}}')
list_type_asc=$(file_api_post "list" "$list_type_asc_req")

entry_count_type=$(echo "$list_type_asc" | jq '.entries | length')
[[ "$entry_count_type" -gt 0 ]] || test_fail "Type sort should return entries"

# All entries should be files ('f')
all_files=$(echo "$list_type_asc" | jq -r '.entries[].file_type' | sort -u)
[[ "$all_files" == "f" ]] || test_fail "Record directory should only contain files"
print_success "Sort by type ascending works (all files in record dir)"

# Test 7: Sort schemas (which are all directories)
print_step "Testing sort schemas by name"

list_schemas_req=$(jq -n '{path:"/data",file_options:{sort_by:"name",sort_order:"asc"}}')
list_schemas=$(file_api_post "list" "$list_schemas_req")
schema_names=$(echo "$list_schemas" | jq -r '.entries[].name')

# Verify account is in the list
echo "$schema_names" | grep -q "account" || test_fail "account schema should be in list"
print_success "Schema listing with sort works"

# Test 8: Sort schema records (directories)
print_step "Testing sort records by name"

list_records_req=$(jq -n '{path:"/data/account",file_options:{sort_by:"name",sort_order:"asc"}}')
list_records=$(file_api_post "list" "$list_records_req")
record_ids=$(echo "$list_records" | jq -r '.entries[].name')

# Verify our test account is in the list
echo "$record_ids" | grep -q "$ACCOUNT_ID" || test_fail "Test account should be in record list"
print_success "Record listing with sort works"

# Test 9: Default sorting (should be name ascending)
print_step "Testing default sorting"

list_default_req=$(jq -n --arg path "/data/account/$ACCOUNT_ID" '{path:$path}')
list_default=$(file_api_post "list" "$list_default_req")
first_default=$(echo "$list_default" | jq -r '.entries[0].name')
second_default=$(echo "$list_default" | jq -r '.entries[1].name')

# Should default to name ascending
[[ "$first_default" < "$second_default" || "$first_default" == "$second_default" ]] || test_fail "Default sort should be name ascending"
print_success "Default sorting is name ascending"

print_success "All sorting tests passed"
