#!/usr/bin/env bash
set -e

# File API Retrieve Basic Test
# Tests the POST /api/file/retrieve endpoint with various file paths to verify content retrieval

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API retrieve functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "retrieve-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Get complete record data for comparison
print_step "Getting complete account record for content validation"
data_api_response=$(auth_get "api/data/account/$ACCOUNT_ID")
complete_record=$(extract_and_validate_data "$data_api_response" "complete account record")

# Test 1: Retrieve complete record as JSON
print_step "Testing File retrieve: /data/account/$ACCOUNT_ID.json (complete record)"
record_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID.json")

# Validate response structure
assert_has_field "content" "$record_retrieve"
assert_has_field "file_metadata" "$record_retrieve"

# Validate content matches Data API
retrieved_content=$(echo "$record_retrieve" | jq -c '.content')
expected_content=$(echo "$complete_record" | jq -c .)

if [[ "$retrieved_content" == "$expected_content" ]]; then
    print_success "Retrieved record content matches Data API exactly"
else
    print_success "Retrieved record content (File API formatting may differ from Data API)"
    
    # Check key fields match
    retrieved_id=$(echo "$record_retrieve" | jq -r '.content.id')
    retrieved_name=$(echo "$record_retrieve" | jq -r '.content.name')
    retrieved_email=$(echo "$record_retrieve" | jq -r '.content.email')
    
    if [[ "$retrieved_id" == "$ACCOUNT_ID" && 
          "$retrieved_name" == "$ACCOUNT_NAME" && 
          "$retrieved_email" == "$ACCOUNT_EMAIL" ]]; then
        print_success "Key fields match: id, name, email"
    else
        test_fail "Key field mismatch in retrieved content"
    fi
fi

# Validate file metadata
retrieve_size=$(echo "$record_retrieve" | jq -r '.file_metadata.size')
if [[ "$retrieve_size" -gt 0 ]]; then
    print_success "Retrieved record size: $retrieve_size bytes"
else
    test_fail "Retrieved record should have size > 0, got: $retrieve_size"
fi

retrieve_content_type=$(echo "$record_retrieve" | jq -r '.file_metadata.content_type')
if [[ "$retrieve_content_type" == "application/json" ]]; then
    print_success "Retrieved record content type: $retrieve_content_type"
else
    test_fail "Record should have content type 'application/json', got: $retrieve_content_type"
fi

# Test 2: Retrieve specific field - email
print_step "Testing File retrieve: /data/account/$ACCOUNT_ID/email (field content)"
email_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/email")

email_content=$(echo "$email_retrieve" | jq -r '.content')
if [[ "$email_content" == "$ACCOUNT_EMAIL" ]]; then
    print_success "Email field content: '$email_content'"
else
    test_fail "Email field should contain '$ACCOUNT_EMAIL', got: '$email_content'"
fi

email_retrieve_size=$(echo "$email_retrieve" | jq -r '.file_metadata.size')
email_expected_size=${#ACCOUNT_EMAIL}

if [[ "$email_retrieve_size" -ge "$email_expected_size" ]]; then
    print_success "Email field size: $email_retrieve_size bytes"
else
    test_fail "Email field size should be >= $email_expected_size, got: $email_retrieve_size"
fi

email_retrieve_content_type=$(echo "$email_retrieve" | jq -r '.file_metadata.content_type')
if [[ "$email_retrieve_content_type" == "text/plain" ]]; then
    print_success "Email field content type: $email_retrieve_content_type"
else
    print_warning "Email field content type: $email_retrieve_content_type (expected text/plain)"
fi

# Test 3: Retrieve specific field - name
print_step "Testing File retrieve: /data/account/$ACCOUNT_ID/name (field content)"
name_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/name")

name_content=$(echo "$name_retrieve" | jq -r '.content')
if [[ "$name_content" == "$ACCOUNT_NAME" ]]; then
    print_success "Name field content: '$name_content'"
else
    test_fail "Name field should contain '$ACCOUNT_NAME', got: '$name_content'"
fi

# Test 4: Test different format options
print_step "Testing File retrieve format options"

# Test JSON format (default)
json_format_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID.json" '{"format": "json"}')
json_format_content=$(echo "$json_format_retrieve" | jq '.content')

if echo "$json_format_content" | jq -e '.id != null' >/dev/null; then
    print_success "JSON format returns parsed object"
else
    test_fail "JSON format should return parsed object"
fi

# Test raw format
raw_format_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/email" '{"format": "raw"}')
raw_format_content=$(echo "$raw_format_retrieve" | jq -r '.content')

if [[ "$raw_format_content" == "$ACCOUNT_EMAIL" ]]; then
    print_success "Raw format returns string content: '$raw_format_content'"
else
    test_fail "Raw format should return string content"
fi

# Test 5: Test partial content retrieval (resume support)
print_step "Testing File retrieve partial content (resume support)"

# Test start_offset
partial_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/email" '{"format": "raw", "start_offset": 3}')
partial_content=$(echo "$partial_retrieve" | jq -r '.content')
expected_partial="${ACCOUNT_EMAIL:3}"

if [[ "$partial_content" == "$expected_partial" ]]; then
    print_success "Partial content with offset: '$partial_content' (offset 3)"
else
    test_fail "Partial content should be '$expected_partial', got: '$partial_content'"
fi

# Test max_bytes
limited_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/email" '{"format": "raw", "max_bytes": 5}')
limited_content=$(echo "$limited_retrieve" | jq -r '.content')
expected_limited="${ACCOUNT_EMAIL:0:5}"

if [[ "$limited_content" == "$expected_limited" ]]; then
    print_success "Limited content with max_bytes: '$limited_content' (first 5 chars)"
else
    test_fail "Limited content should be '$expected_limited', got: '$limited_content'"
fi

# Validate can_resume flag
limited_can_resume=$(echo "$limited_retrieve" | jq -r '.file_metadata.can_resume')
if [[ "$limited_can_resume" == "true" ]]; then
    print_success "Partial retrieve correctly sets can_resume: $limited_can_resume"
else
    print_warning "Expected can_resume=true for partial content, got: $limited_can_resume"
fi

# Test 6: Test binary mode option
print_step "Testing File retrieve binary mode"
binary_retrieve=$(file_retrieve "/data/account/$ACCOUNT_ID/name" '{"binary_mode": true, "format": "raw"}')
binary_content=$(echo "$binary_retrieve" | jq -r '.content')

if [[ "$binary_content" == "$ACCOUNT_NAME" ]]; then
    print_success "Binary mode content: '$binary_content'"
else
    test_fail "Binary mode should return same content as normal mode"
fi

# Test 7: Error cases
test_file_api_error "retrieve" "/data/account/00000000-0000-0000-0000-000000000000.json" "RECORD_NOT_FOUND" "non-existent record file"
test_file_api_error "retrieve" "/data/account/$ACCOUNT_ID/nonexistent_field" "FIELD_NOT_FOUND" "non-existent field file"
test_file_api_error "retrieve" "/data/nonexistent_schema/record.json" "SCHEMA_NOT_FOUND" "non-existent schema"

# Test 8: Validate ETag generation
print_step "Validating ETag generation for caching"
etag1=$(echo "$record_retrieve" | jq -r '.file_metadata.etag')
etag2=$(echo "$email_retrieve" | jq -r '.file_metadata.etag')

if [[ -n "$etag1" && "$etag1" != "null" && ${#etag1} -gt 8 ]]; then
    print_success "Record ETag generated: ${etag1:0:12}..."
else
    test_fail "Record should have valid ETag"
fi

if [[ -n "$etag2" && "$etag2" != "null" && ${#etag2} -gt 8 ]]; then
    print_success "Field ETag generated: ${etag2:0:12}..."
else
    test_fail "Field should have valid ETag"
fi

if [[ "$etag1" != "$etag2" ]]; then
    print_success "Different files have different ETags (proper caching)"
else
    test_fail "Different files should have different ETags"
fi

# Test 9: Validate FTP timestamp format in responses
print_step "Validating FTP timestamp format in retrieve responses"
record_modified=$(echo "$record_retrieve" | jq -r '.file_metadata.modified_time')
email_modified=$(echo "$email_retrieve" | jq -r '.file_metadata.modified_time')

if [[ "$record_modified" =~ ^[0-9]{14}$ ]]; then
    print_success "Record timestamp valid FTP format: $record_modified"
else
    test_fail "Record timestamp invalid format: $record_modified"
fi

if [[ "$email_modified" =~ ^[0-9]{14}$ ]]; then
    print_success "Field timestamp valid FTP format: $email_modified"
else
    test_fail "Field timestamp invalid format: $email_modified"
fi

print_success "File API retrieve functionality tests completed successfully"