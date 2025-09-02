#!/usr/bin/env bash
set -e

# File API Stat Basic Test
# Tests the POST /api/file/stat endpoint with various path types to verify basic functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API stat functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "stat-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Test 1: Root directory stat
print_step "Testing File stat: / (root directory)"
root_stat=$(file_stat "/")
validate_file_metadata "$root_stat" "directory" "Root directory"

root_children=$(echo "$root_stat" | jq -r '.children_count')
if [[ "$root_children" -eq 2 ]]; then
    print_success "Root directory has 2 children (/data, /meta)"
else
    test_fail "Root should have 2 children, got: $root_children"
fi

# Test 2: Data namespace stat
print_step "Testing File stat: /data (API namespace)"
data_stat=$(file_stat "/data")
validate_file_metadata "$data_stat" "directory" "Data namespace"

data_children=$(echo "$data_stat" | jq -r '.children_count')
if [[ "$data_children" -ge 2 ]]; then
    print_success "Data namespace has $data_children schemas"
else
    test_fail "Data namespace should have at least 2 schemas, got: $data_children"
fi

# Test 3: Schema directory stat
print_step "Testing File stat: /data/account (schema directory)"
schema_stat=$(file_stat "/data/account")
validate_file_metadata "$schema_stat" "directory" "Schema directory"
validate_record_info "$schema_stat" "account" "" "Schema directory"

schema_children=$(echo "$schema_stat" | jq -r '.children_count')
if [[ "$schema_children" -eq 5 ]]; then
    print_success "Schema directory has $schema_children records (matches template)"
else
    test_fail "Schema should have 5 records from template, got: $schema_children"
fi

# Verify schema info is included
schema_info_description=$(echo "$schema_stat" | jq -r '.schema_info.description // empty')
if [[ -n "$schema_info_description" && "$schema_info_description" != "null" ]]; then
    print_success "Schema info includes description: $schema_info_description"
else
    print_warning "Schema info description not available"
fi

# Test 4-6: Complete record hierarchy testing
test_record_hierarchy "account" "$ACCOUNT_ID" "$ACCOUNT_NAME"

# Test 7: Field access testing
test_field_access "account" "$ACCOUNT_ID" "email" "$ACCOUNT_EMAIL"
test_field_access "account" "$ACCOUNT_ID" "name" "$ACCOUNT_NAME"

# Test 8: Error case - non-existent record
test_file_api_error "stat" "/data/account/00000000-0000-0000-0000-000000000000.json" "RECORD_NOT_FOUND" "non-existent record"

# Test 9: Error case - non-existent field
test_file_api_error "stat" "/data/account/$ACCOUNT_ID/nonexistent_field" "FIELD_NOT_FOUND" "non-existent field"

# Test 10: Error case - non-existent schema
test_file_api_error "stat" "/data/nonexistent_schema/" "SCHEMA_NOT_FOUND" "non-existent schema"

print_success "File API stat functionality tests completed successfully"