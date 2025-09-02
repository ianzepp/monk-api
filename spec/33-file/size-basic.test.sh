#!/usr/bin/env bash
set -e

# File API Size Basic Test
# Tests the POST /api/file/size endpoint with various file paths to verify basic functionality

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API size functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "size-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Test 1: Record JSON file size
print_step "Testing File size: /data/account/$ACCOUNT_ID.json (record file)"
record_size=$(file_size "/data/account/$ACCOUNT_ID.json")

# Validate response structure
assert_has_field "size" "$record_size"
assert_has_field "file_metadata" "$record_size"

# Get the size value
json_file_size=$(echo "$record_size" | jq -r '.size')
if [[ "$json_file_size" -gt 0 ]]; then
    print_success "Record JSON file size: $json_file_size bytes"
else
    test_fail "Record JSON file should have size > 0, got: $json_file_size"
fi

# Validate file metadata
size_path=$(echo "$record_size" | jq -r '.file_metadata.path')
if [[ "$size_path" == "/data/account/$ACCOUNT_ID.json" ]]; then
    print_success "Size response path matches request: $size_path"
else
    test_fail "Size response path should match request, got: $size_path"
fi

size_type=$(echo "$record_size" | jq -r '.file_metadata.type')
if [[ "$size_type" == "file" ]]; then
    print_success "Size response type: $size_type"
else
    test_fail "Size response should show type 'file', got: $size_type"
fi

size_content_type=$(echo "$record_size" | jq -r '.file_metadata.content_type')
if [[ "$size_content_type" == "application/json" ]]; then
    print_success "Record JSON content type: $size_content_type"
else
    test_fail "Record JSON should have content type 'application/json', got: $size_content_type"
fi

# Cross-validate size with Data API
print_step "Cross-validating size with Data API record data"
data_api_response=$(auth_get "api/data/account/$ACCOUNT_ID")
data_api_record=$(extract_and_validate_data "$data_api_response" "account record")

# Calculate expected size from Data API record
data_api_json=$(echo "$data_api_record" | jq -c .)
expected_size=${#data_api_json}

# File API size should be close to calculated size (JSON formatting may differ slightly)
size_difference=$((json_file_size - expected_size))
if [[ $size_difference -ge -10 && $size_difference -le 10 ]]; then
    print_success "File API size ($json_file_size) matches Data API size (~$expected_size bytes)"
else
    test_fail "File API size ($json_file_size) differs too much from Data API size ($expected_size)"
fi

# Test 2: Field file size - email
print_step "Testing File size: /data/account/$ACCOUNT_ID/email (field file)"
email_size=$(file_size "/data/account/$ACCOUNT_ID/email")

email_file_size=$(echo "$email_size" | jq -r '.size')
email_length=${#ACCOUNT_EMAIL}

if [[ "$email_file_size" -ge "$email_length" ]]; then
    print_success "Email field size: $email_file_size bytes (email: '$ACCOUNT_EMAIL')"
else
    test_fail "Email field size should be >= $email_length, got: $email_file_size"
fi

# Validate email content type
email_content_type=$(echo "$email_size" | jq -r '.file_metadata.content_type')
if [[ "$email_content_type" == "text/plain" ]]; then
    print_success "Email field content type: $email_content_type"
else
    print_warning "Email field content type: $email_content_type (expected text/plain)"
fi

# Test 3: Field file size - name
print_step "Testing File size: /data/account/$ACCOUNT_ID/name (field file)"
name_size=$(file_size "/data/account/$ACCOUNT_ID/name")

name_file_size=$(echo "$name_size" | jq -r '.size')
name_length=${#ACCOUNT_NAME}

if [[ "$name_file_size" -ge "$name_length" ]]; then
    print_success "Name field size: $name_file_size bytes (name: '$ACCOUNT_NAME')"
else
    test_fail "Name field size should be >= $name_length, got: $name_file_size"
fi

# Test 4: Cross-validate field sizes with retrieve API
print_step "Cross-validating field sizes with retrieve API"

# Get email content via retrieve
email_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/email" '{"format": "raw"}')
email_content=$(echo "$email_retrieve" | jq -r '.content')
email_retrieve_size=$(echo "$email_retrieve" | jq -r '.file_metadata.size')

if [[ "$email_content" == "$ACCOUNT_EMAIL" ]]; then
    print_success "Email content matches via retrieve: '$email_content'"
else
    test_fail "Email content should be '$ACCOUNT_EMAIL', got: '$email_content'"
fi

if [[ "$email_retrieve_size" -eq "$email_file_size" ]]; then
    print_success "Email size consistent between size and retrieve APIs: $email_file_size bytes"
else
    test_fail "Email size mismatch: size API=$email_file_size, retrieve API=$email_retrieve_size"
fi

# Test 5: Error cases - SIZE command only works on files
test_file_api_error "size" "/" "NOT_A_FILE" "root directory (not a file)"
test_file_api_error "size" "/data" "NOT_A_FILE" "data namespace (not a file)"
test_file_api_error "size" "/data/account" "NOT_A_FILE" "schema directory (not a file)"
test_file_api_error "size" "/data/account/$ACCOUNT_ID" "NOT_A_FILE" "record directory (not a file)"

# Test 6: Error cases - non-existent files
test_file_api_error "size" "/data/account/00000000-0000-0000-0000-000000000000.json" "RECORD_NOT_FOUND" "non-existent record file"
test_file_api_error "size" "/data/account/$ACCOUNT_ID/nonexistent_field" "FIELD_NOT_FOUND" "non-existent field file"
test_file_api_error "size" "/data/nonexistent_schema/record.json" "SCHEMA_NOT_FOUND" "non-existent schema"

# Test 7: Validate FTP SIZE command compliance
print_step "Validating FTP SIZE command compliance"

# SIZE should return just the byte count as primary data
if [[ "$json_file_size" =~ ^[0-9]+$ ]]; then
    print_success "SIZE returns valid numeric byte count: $json_file_size"
else
    test_fail "SIZE should return numeric byte count, got: $json_file_size"
fi

# Test with different field types if available
print_step "Testing SIZE with different field types"

# Check if account has numeric field (balance)
account_balance=$(echo "$first_account" | jq -r '.balance // empty')
if [[ -n "$account_balance" && "$account_balance" != "null" ]]; then
    balance_size=$(file_size "/data/account/$ACCOUNT_ID/balance")
    balance_file_size=$(echo "$balance_size" | jq -r '.size')
    
    # Balance should be small (just the number)
    if [[ "$balance_file_size" -gt 0 && "$balance_file_size" -lt 20 ]]; then
        print_success "Balance field size: $balance_file_size bytes (reasonable for number)"
    else
        print_warning "Balance field size: $balance_file_size bytes (seems unusual for number)"
    fi
else
    print_warning "No balance field available for numeric field testing"
fi

# Test 8: Performance validation - SIZE should be fast
print_step "Testing SIZE command performance characteristics"

# SIZE should work on all field types consistently
fields_to_test=("name" "email")
for field in "${fields_to_test[@]}"; do
    field_size_response=$(file_size "/data/account/$ACCOUNT_ID/$field")
    field_size_value=$(echo "$field_size_response" | jq -r '.size')
    
    if [[ "$field_size_value" -gt 0 ]]; then
        print_success "SIZE works on $field field: $field_size_value bytes"
    else
        test_fail "SIZE failed on $field field"
    fi
done

# Test 9: Validate SIZE response consistency
print_step "Validating SIZE response consistency"

# All SIZE responses should have same metadata structure
size_responses=("$record_size" "$email_size" "$name_size")
for response in "${size_responses[@]}"; do
    # Check required fields
    if echo "$response" | jq -e '.success == true' >/dev/null && \
       echo "$response" | jq -e '.size != null' >/dev/null && \
       echo "$response" | jq -e '.file_metadata != null' >/dev/null; then
        continue # Good response
    else
        test_fail "Inconsistent SIZE response structure: $response"
    fi
done

print_success "All SIZE responses have consistent structure"

print_success "File API size functionality tests completed successfully"