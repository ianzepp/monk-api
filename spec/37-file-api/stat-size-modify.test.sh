#!/usr/bin/env bash
set -e

source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "File API stat/size/modify-time checks"

setup_test_with_template "file-stat-size-modify"
setup_admin_auth

account_json=$(get_template_account)
extract_account_info "$account_json"

# Record JSON stat
record_stat=$(file_stat "/data/account/$ACCOUNT_ID.json")
validate_file_metadata "$record_stat" "file" "Account JSON file"
validate_record_info "$record_stat" "account" "$ACCOUNT_ID" "Account JSON file"

record_size=$(echo "$record_stat" | jq -r '.file_metadata.size')
[[ "$record_size" -gt 0 ]] || test_fail "Record stat size should be > 0"

# Field stat
email_stat=$(file_stat "/data/account/$ACCOUNT_ID/email")
validate_file_metadata "$email_stat" "file" "Email field"
validate_record_info "$email_stat" "account" "$ACCOUNT_ID" "Email field"
validate_field_info "$email_stat" "email" "Email field"

# Size endpoint should match stat size for record
size_response=$(file_size "/data/account/$ACCOUNT_ID.json")
size_value=$(echo "$size_response" | jq -r '.size')
[[ "$size_value" -eq "$record_size" ]] || test_fail "Size endpoint mismatch: $size_value vs stat $record_size"
print_success "Size endpoint matches stat size"

# Field size should be at least email length
field_size_response=$(file_size "/data/account/$ACCOUNT_ID/email")
field_size=$(echo "$field_size_response" | jq -r '.size')
[[ "$field_size" -ge ${#ACCOUNT_EMAIL} ]] || test_fail "Field size smaller than email length"

# Modify time should align with stat timestamp format
modify_response=$(file_modify_time "/data/account/$ACCOUNT_ID.json")
modify_time=$(echo "$modify_response" | jq -r '.modified_time')
[[ "$modify_time" =~ ^[0-9]{14}$ ]] || test_fail "Modify time format invalid: $modify_time"

stat_modified=$(echo "$record_stat" | jq -r '.file_metadata.modified_time')
[[ "$modify_time" == "$stat_modified" ]] || print_warning "Modify time ($modify_time) differs from stat ($stat_modified)"

print_success "Stat, size, and modify-time verified"
