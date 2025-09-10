#!/usr/bin/env bash
set -e

# File API List Basic Test
# Tests the POST /api/file/list endpoint with various directory paths to verify basic functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API list functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "list-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Test 1: Root directory listing
print_step "Testing File list: / (root directory)"
root_list=$(file_list "/")

# Validate response structure
assert_has_field "entries" "$root_list"
assert_has_field "total" "$root_list"
assert_has_field "file_metadata" "$root_list"

entries_count=$(echo "$root_list" | jq '.entries | length')
if [[ "$entries_count" -eq 2 ]]; then
    print_success "Root directory shows 2 entries (/data, /describe)"
else
    test_fail "Root should show 2 entries, got: $entries_count"
fi

# Verify data and describe directories are present
data_entry=$(echo "$root_list" | jq '.entries[] | select(.name == "data")')
meta_entry=$(echo "$root_list" | jq '.entries[] | select(.name == "describe")')

if [[ -n "$data_entry" && "$data_entry" != "null" ]]; then
    print_success "Found /data directory entry"
else
    test_fail "Missing /data directory in root listing"
fi

if [[ -n "$meta_entry" && "$meta_entry" != "null" ]]; then
    print_success "Found /describe directory entry"
else
    test_fail "Missing /describe directory in root listing"
fi

# Test 2: Data namespace listing (shows schemas)
print_step "Testing File list: /data (shows all schemas)"
data_list=$(file_list "/data")

data_entries_count=$(echo "$data_list" | jq '.entries | length')
if [[ "$data_entries_count" -ge 2 ]]; then
    print_success "Data namespace shows $data_entries_count schemas"
else
    test_fail "Data namespace should show at least 2 schemas, got: $data_entries_count"
fi

# Verify account schema is present
account_entry=$(echo "$data_list" | jq '.entries[] | select(.name == "account")')
if [[ -n "$account_entry" && "$account_entry" != "null" ]]; then
    print_success "Found account schema in /data listing"

    # Validate account schema entry structure
    account_file_type=$(echo "$account_entry" | jq -r '.file_type')
    if [[ "$account_file_type" == "d" ]]; then
        print_success "Account schema correctly shown as directory (d)"
    else
        test_fail "Account schema should be directory (d), got: $account_file_type"
    fi

    account_path=$(echo "$account_entry" | jq -r '.path')
    if [[ "$account_path" == "/data/account/" ]]; then
        print_success "Account schema path: $account_path"
    else
        test_fail "Account schema path should be '/data/account/', got: $account_path"
    fi
else
    test_fail "Missing account schema in /data listing"
fi

# Test 3: Schema listing (shows records)
print_step "Testing File list: /data/account (shows all account records)"
account_list=$(file_list "/data/account")

account_entries_count=$(echo "$account_list" | jq '.entries | length')
if [[ "$account_entries_count" -eq 5 ]]; then
    print_success "Account schema shows $account_entries_count records (matches template)"
else
    test_fail "Account schema should show 5 records from template, got: $account_entries_count"
fi

# Verify our test account is present
test_account_entry=$(echo "$account_list" | jq ".entries[] | select(.name == \"$ACCOUNT_ID\")")
if [[ -n "$test_account_entry" && "$test_account_entry" != "null" ]]; then
    print_success "Found test account record in schema listing"

    # Validate record entry structure
    record_file_type=$(echo "$test_account_entry" | jq -r '.file_type')
    if [[ "$record_file_type" == "d" ]]; then
        print_success "Account record correctly shown as directory (d)"
    else
        test_fail "Account record should be directory (d), got: $record_file_type"
    fi

    record_path=$(echo "$test_account_entry" | jq -r '.path')
    expected_path="/data/account/$ACCOUNT_ID/"
    if [[ "$record_path" == "$expected_path" ]]; then
        print_success "Account record path: $record_path"
    else
        test_fail "Account record path should be '$expected_path', got: $record_path"
    fi

    # Validate API context
    api_schema=$(echo "$test_account_entry" | jq -r '.api_context.schema')
    api_record_id=$(echo "$test_account_entry" | jq -r '.api_context.record_id')

    if [[ "$api_schema" == "account" && "$api_record_id" == "$ACCOUNT_ID" ]]; then
        print_success "API context correct: schema=$api_schema, record_id=$api_record_id"
    else
        test_fail "API context mismatch: expected schema=account, record_id=$ACCOUNT_ID"
    fi
else
    test_fail "Missing test account record in schema listing"
fi

# Test 4: Record directory listing (shows fields + JSON file)
print_step "Testing File list: /data/account/$ACCOUNT_ID (shows record contents)"
record_list=$(file_list "/data/account/$ACCOUNT_ID")

record_entries_count=$(echo "$record_list" | jq '.entries | length')
if [[ "$record_entries_count" -gt 3 ]]; then
    print_success "Record directory shows $record_entries_count entries (fields + .json)"
else
    test_fail "Record directory should show multiple entries (fields + .json), got: $record_entries_count"
fi

# Verify JSON file entry is present
json_entry=$(echo "$record_list" | jq ".entries[] | select(.name == \"$ACCOUNT_ID.json\")")
if [[ -n "$json_entry" && "$json_entry" != "null" ]]; then
    print_success "Found .json file entry in record listing"

    json_file_type=$(echo "$json_entry" | jq -r '.file_type')
    if [[ "$json_file_type" == "f" ]]; then
        print_success "JSON file correctly shown as file (f)"
    else
        test_fail "JSON file should be file (f), got: $json_file_type"
    fi

    json_size=$(echo "$json_entry" | jq -r '.file_size')
    if [[ "$json_size" -gt 0 ]]; then
        print_success "JSON file has realistic size: $json_size bytes"
    else
        test_fail "JSON file should have size > 0, got: $json_size"
    fi
else
    test_fail "Missing .json file in record listing"
fi

# Verify email field entry is present
email_entry=$(echo "$record_list" | jq '.entries[] | select(.name == "email")')
if [[ -n "$email_entry" && "$email_entry" != "null" ]]; then
    print_success "Found email field entry in record listing"

    email_file_type=$(echo "$email_entry" | jq -r '.file_type')
    if [[ "$email_file_type" == "f" ]]; then
        print_success "Email field correctly shown as file (f)"
    else
        test_fail "Email field should be file (f), got: $email_file_type"
    fi

    # Validate field size matches expected email length
    email_size=$(echo "$email_entry" | jq -r '.file_size')
    email_length=${#ACCOUNT_EMAIL}
    if [[ "$email_size" -ge "$email_length" ]]; then
        print_success "Email field size: $email_size bytes (email: '$ACCOUNT_EMAIL')"
    else
        test_fail "Email field size should be >= $email_length, got: $email_size"
    fi

    # Validate field API context
    field_api_context=$(echo "$email_entry" | jq -r '.api_context.field_name')
    if [[ "$field_api_context" == "email" ]]; then
        print_success "Email field API context correct"
    else
        test_fail "Email field API context should be 'email', got: $field_api_context"
    fi
else
    test_fail "Missing email field in record listing"
fi

# Test 5: Verify name field is also present
name_entry=$(echo "$record_list" | jq '.entries[] | select(.name == "name")')
if [[ -n "$name_entry" && "$name_entry" != "null" ]]; then
    print_success "Found name field entry in record listing"

    name_size=$(echo "$name_entry" | jq -r '.file_size')
    name_length=${#ACCOUNT_NAME}
    if [[ "$name_size" -ge "$name_length" ]]; then
        print_success "Name field size: $name_size bytes (name: '$ACCOUNT_NAME')"
    else
        test_fail "Name field size should be >= $name_length, got: $name_size"
    fi
else
    test_fail "Missing name field in record listing"
fi

# Test 6: Verify system fields are excluded from listing
system_fields=("id" "created_at" "updated_at" "trashed_at" "deleted_at")
for field in "${system_fields[@]}"; do
    system_field_entry=$(echo "$record_list" | jq ".entries[] | select(.name == \"$field\")")
    if [[ -z "$system_field_entry" || "$system_field_entry" == "null" ]]; then
        print_success "System field '$field' correctly excluded from listing"
    else
        test_fail "System field '$field' should be excluded from record listing"
    fi
done

# Test 7: Error cases
test_file_api_error "list" "/data/nonexistent_schema/" "SCHEMA_NOT_FOUND" "non-existent schema listing"
test_file_api_error "list" "/data/account/00000000-0000-0000-0000-000000000000/" "RECORD_NOT_FOUND" "non-existent record listing"

# Test 8: Validate all entries have required FTP metadata
print_step "Validating FTP metadata consistency across all entries"
echo "$record_list" | jq '.entries[]' | while read -r entry; do
    entry_name=$(echo "$entry" | jq -r '.name')
    entry_permissions=$(echo "$entry" | jq -r '.file_permissions')
    entry_modified=$(echo "$entry" | jq -r '.file_modified')

    # Validate permissions format
    if [[ "$entry_permissions" =~ ^[r-][w-][x-]$ ]]; then
        print_success "Entry '$entry_name' has valid permissions: $entry_permissions"
    else
        test_fail "Entry '$entry_name' has invalid permissions: $entry_permissions"
    fi

    # Validate timestamp format
    if [[ "$entry_modified" =~ ^[0-9]{14}$ ]]; then
        print_success "Entry '$entry_name' has valid timestamp: $entry_modified"
    else
        test_fail "Entry '$entry_name' has invalid timestamp: $entry_modified"
    fi
done

print_success "File API list functionality tests completed successfully"
