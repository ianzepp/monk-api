#!/usr/bin/env bash
set -e

# File API Modify Time Basic Test
# Tests the POST /api/file/modify-time endpoint with various file paths to verify timestamp functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API modify-time functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "modify-time-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Test 1: Get modification time for record JSON file
print_step "Testing File modify-time: /data/account/$ACCOUNT_ID.json (record file)"
record_modtime=$(file_modify_time "/data/account/$ACCOUNT_ID.json")

# Validate response structure
assert_has_field "success" "$record_modtime"
assert_has_field "modified_time" "$record_modtime"
assert_has_field "file_metadata" "$record_modtime"
assert_has_field "timestamp_info" "$record_modtime"

# Validate modified time format (FTP format: YYYYMMDDHHMMSS)
modified_time=$(echo "$record_modtime" | jq -r '.modified_time')
if [[ "$modified_time" =~ ^[0-9]{14}$ ]]; then
    print_success "Record modification time valid FTP format: $modified_time"
else
    test_fail "Record modification time invalid format: $modified_time"
fi

# Validate file metadata
modtime_path=$(echo "$record_modtime" | jq -r '.file_metadata.path')
modtime_type=$(echo "$record_modtime" | jq -r '.file_metadata.type')
modtime_permissions=$(echo "$record_modtime" | jq -r '.file_metadata.permissions')

if [[ "$modtime_path" == "/data/account/$ACCOUNT_ID.json" && 
      "$modtime_type" == "file" && 
      "$modtime_permissions" =~ ^[r-][w-][x-]$ ]]; then
    print_success "File metadata valid: type=$modtime_type, permissions=$modtime_permissions"
else
    test_fail "File metadata validation failed: type=$modtime_type, permissions=$modtime_permissions"
fi

# Validate timestamp info
timestamp_source=$(echo "$record_modtime" | jq -r '.timestamp_info.source')
iso_timestamp=$(echo "$record_modtime" | jq -r '.timestamp_info.iso_timestamp')
timezone=$(echo "$record_modtime" | jq -r '.timestamp_info.timezone')

if [[ "$timestamp_source" == "updated_at" && 
      "$iso_timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2} &&
      "$timezone" == "UTC" ]]; then
    print_success "Timestamp info valid: source=$timestamp_source, timezone=$timezone"
else
    test_fail "Timestamp info validation failed: source=$timestamp_source, iso=$iso_timestamp, tz=$timezone"
fi

# Test 2: Get modification time for field file
print_step "Testing File modify-time: /data/account/$ACCOUNT_ID/email (field file)"
field_modtime=$(file_modify_time "/data/account/$ACCOUNT_ID/email")

field_modified_time=$(echo "$field_modtime" | jq -r '.modified_time')
field_timestamp_source=$(echo "$field_modtime" | jq -r '.timestamp_info.source')

if [[ "$field_modified_time" =~ ^[0-9]{14}$ ]]; then
    print_success "Field modification time valid FTP format: $field_modified_time"
else
    test_fail "Field modification time invalid format: $field_modified_time"
fi

# Field should have same timestamp as record (since it's part of the same record)
if [[ "$field_modified_time" == "$modified_time" ]]; then
    print_success "Field modification time matches record time (consistent)"
else
    print_warning "Field modification time differs from record time: $field_modified_time vs $modified_time"
fi

# Test 3: Get modification time for another field
print_step "Testing File modify-time: /data/account/$ACCOUNT_ID/name (field file)"
name_modtime=$(file_modify_time "/data/account/$ACCOUNT_ID/name")

name_modified_time=$(echo "$name_modtime" | jq -r '.modified_time')
name_file_type=$(echo "$name_modtime" | jq -r '.file_metadata.type')

if [[ "$name_modified_time" =~ ^[0-9]{14}$ && "$name_file_type" == "file" ]]; then
    print_success "Name field modification time: $name_modified_time, type: $name_file_type"
else
    test_fail "Name field modification time validation failed"
fi

# Test 4: Cross-validate with stat API timestamps
print_step "Cross-validating modify-time with stat API timestamps"
stat_response=$(file_stat "/data/account/$ACCOUNT_ID.json")
stat_modified_time=$(echo "$stat_response" | jq -r '.file_metadata.modified_time // empty')

if [[ "$stat_modified_time" == "$modified_time" ]]; then
    print_success "Modify-time API matches stat API timestamps: $modified_time"
else
    test_fail "Timestamp mismatch between modify-time and stat APIs: $modified_time vs $stat_modified_time"
fi

# Test 5: Test modification time for directory-like paths
print_step "Testing File modify-time: /data/account/$ACCOUNT_ID/ (record directory)"
dir_modtime=$(file_modify_time "/data/account/$ACCOUNT_ID/")

dir_modified_time=$(echo "$dir_modtime" | jq -r '.modified_time')
dir_file_type=$(echo "$dir_modtime" | jq -r '.file_metadata.type')

if [[ "$dir_modified_time" =~ ^[0-9]{14}$ ]]; then
    print_success "Directory modification time valid: $dir_modified_time"
    
    # Directory time should match record time
    if [[ "$dir_modified_time" == "$modified_time" ]]; then
        print_success "Directory modification time matches record time"
    else
        print_warning "Directory time differs from record time: $dir_modified_time vs $modified_time"
    fi
else
    test_fail "Directory modification time invalid format: $dir_modified_time"
fi

# Test 6: Test schema-level modification time
print_step "Testing File modify-time: /data/account/ (schema directory)"
schema_modtime=$(file_modify_time "/data/account/")

schema_modified_time=$(echo "$schema_modtime" | jq -r '.modified_time')
schema_timestamp_source=$(echo "$schema_modtime" | jq -r '.timestamp_info.source // empty')

if [[ "$schema_modified_time" =~ ^[0-9]{14}$ ]]; then
    print_success "Schema modification time valid: $schema_modified_time"
    
    # Schema timestamp source might be different (most recent record)
    if [[ -n "$schema_timestamp_source" && "$schema_timestamp_source" != "null" ]]; then
        print_success "Schema timestamp source: $schema_timestamp_source"
    else
        print_warning "Schema timestamp source not provided"
    fi
else
    test_fail "Schema modification time invalid format: $schema_modified_time"
fi

# Test 7: Test root-level modification time
print_step "Testing File modify-time: / (root directory)"
root_modtime=$(file_modify_time "/")

root_modified_time=$(echo "$root_modtime" | jq -r '.modified_time')
root_timestamp_source=$(echo "$root_modtime" | jq -r '.timestamp_info.source // empty')

if [[ "$root_modified_time" =~ ^[0-9]{14}$ ]]; then
    print_success "Root modification time valid: $root_modified_time"
    
    # Root might use current_time or most recent activity
    if [[ "$root_timestamp_source" == "current_time" || "$root_timestamp_source" == "updated_at" ]]; then
        print_success "Root timestamp source appropriate: $root_timestamp_source"
    else
        print_warning "Root timestamp source: $root_timestamp_source"
    fi
else
    test_fail "Root modification time invalid format: $root_modified_time"
fi

# Test 8: Verify timestamps are reasonable (not too old, not in future)
print_step "Validating timestamp reasonableness"
current_timestamp=$(date +%Y%m%d%H%M%S)
current_year=$(date +%Y)

# Parse year from modification time
modtime_year=${modified_time:0:4}

if [[ "$modtime_year" -ge "2020" && "$modtime_year" -le "$((current_year + 1))" ]]; then
    print_success "Modification time year reasonable: $modtime_year (current: $current_year)"
else
    test_fail "Modification time year unreasonable: $modtime_year"
fi

# Test 9: Error cases
print_step "Testing File modify-time error cases"

# Test non-existent record
test_file_api_error "modify-time" "/data/account/00000000-0000-0000-0000-000000000000.json" "RECORD_NOT_FOUND" "non-existent record"

# Test non-existent field
test_file_api_error "modify-time" "/data/account/$ACCOUNT_ID/nonexistent_field" "FIELD_NOT_FOUND" "non-existent field"

# Test non-existent schema
test_file_api_error "modify-time" "/data/nonexistent_schema/" "SCHEMA_NOT_FOUND" "non-existent schema"

# Test 10: Validate FTP timestamp format conversion
print_step "Validating FTP timestamp format conversion accuracy"

# Get ISO timestamp and convert it manually for comparison
iso_time=$(echo "$record_modtime" | jq -r '.timestamp_info.iso_timestamp')
if [[ "$iso_time" != "null" && -n "$iso_time" ]]; then
    # Extract date components from ISO timestamp
    iso_year=$(echo "$iso_time" | cut -c1-4)
    iso_month=$(echo "$iso_time" | cut -c6-7)
    iso_day=$(echo "$iso_time" | cut -c9-10)
    iso_hour=$(echo "$iso_time" | cut -c12-13)
    iso_minute=$(echo "$iso_time" | cut -c15-16)
    iso_second=$(echo "$iso_time" | cut -c18-19)
    
    expected_ftp_time="${iso_year}${iso_month}${iso_day}${iso_hour}${iso_minute}${iso_second}"
    
    if [[ "$modified_time" == "$expected_ftp_time" ]]; then
        print_success "FTP timestamp conversion accurate: $iso_time -> $modified_time"
    else
        print_warning "FTP timestamp conversion differs: expected $expected_ftp_time, got $modified_time"
    fi
else
    print_warning "ISO timestamp not available for conversion validation"
fi

# Test 11: Test with recently created record
print_step "Testing modify-time with recently created record"

# Create a new record to test with fresh timestamp
new_record_content='{"name": "ModTime Test", "email": "modtime@test.com"}'
new_record=$(file_store "/data/account/modtime-test.json" "$new_record_content")
new_record_id=$(echo "$new_record" | jq -r '.result.record_id')

if [[ -n "$new_record_id" && "$new_record_id" != "null" ]]; then
    # Get modification time for new record
    new_modtime=$(file_modify_time "/data/account/$new_record_id.json")
    new_modified_time=$(echo "$new_modtime" | jq -r '.modified_time')
    new_timestamp_source=$(echo "$new_modtime" | jq -r '.timestamp_info.source')
    
    if [[ "$new_modified_time" =~ ^[0-9]{14}$ ]]; then
        print_success "New record modification time: $new_modified_time (source: $new_timestamp_source)"
        
        # New record timestamp should be recent (within last few minutes)
        new_time_numeric=${new_modified_time}
        current_time_numeric=${current_timestamp}
        
        # Simple comparison - new time should be close to current time
        if [[ "$new_time_numeric" -le "$current_time_numeric" ]]; then
            print_success "New record timestamp is reasonable (not in future)"
        else
            print_warning "New record timestamp seems to be in future"
        fi
    else
        test_fail "New record modification time invalid: $new_modified_time"
    fi
else
    print_warning "Could not create test record for fresh timestamp testing"
fi

# Test 12: Test consistency across multiple calls
print_step "Testing modify-time consistency across multiple calls"
first_call=$(file_modify_time "/data/account/$ACCOUNT_ID.json")
second_call=$(file_modify_time "/data/account/$ACCOUNT_ID.json")

first_time=$(echo "$first_call" | jq -r '.modified_time')
second_time=$(echo "$second_call" | jq -r '.modified_time')

if [[ "$first_time" == "$second_time" ]]; then
    print_success "Modify-time consistent across multiple calls: $first_time"
else
    test_fail "Modify-time inconsistent: $first_time vs $second_time"
fi

print_success "File API modify-time functionality tests completed successfully"