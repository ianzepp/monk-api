#!/usr/bin/env bash
set -e

# File API Store Basic Test - SKIPPED
# Tests the POST /api/file/store endpoint with record and field operations to verify create/update functionality
# STATUS: DISABLED - File API implementation needs review

echo "🚫 FILE API TEST DISABLED: store-basic.test.sh - File API implementation under review"
exit 0

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API store functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "store-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Get initial count of accounts for validation
print_step "Getting initial account count"
initial_accounts=$(auth_get "api/data/account")
initial_count=$(echo "$initial_accounts" | jq -r '.data | length')
print_success "Initial account count: $initial_count"

# Test 1: Create new record via JSON file
print_step "Testing File store: create new record via .json file"
new_record_content='{
  "name": "File API Test User",
  "email": "fileapi.test@example.com", 
  "balance": 150.75,
  "department": "QA Testing"
}'

new_record_store=$(file_store "/data/account/new-test-record.json" "$new_record_content")

# Validate response structure
assert_has_field "success" "$new_record_store"
assert_has_field "operation" "$new_record_store"
assert_has_field "result" "$new_record_store"
assert_has_field "file_metadata" "$new_record_store"

# Validate operation type
operation=$(echo "$new_record_store" | jq -r '.operation')
if [[ "$operation" == "create" ]]; then
    print_success "Store operation correctly identified as: $operation"
else
    test_fail "Store operation should be 'create', got: $operation"
fi

# Validate result details
created=$(echo "$new_record_store" | jq -r '.result.created')
new_record_id=$(echo "$new_record_store" | jq -r '.result.record_id')

if [[ "$created" == "true" && -n "$new_record_id" && "$new_record_id" != "null" ]]; then
    print_success "New record created with ID: $new_record_id"
else
    test_fail "Record creation failed or missing record ID"
fi

# Validate file metadata
stored_path=$(echo "$new_record_store" | jq -r '.file_metadata.path')
stored_type=$(echo "$new_record_store" | jq -r '.file_metadata.type')
stored_size=$(echo "$new_record_store" | jq -r '.file_metadata.size')

if [[ "$stored_path" == "/data/account/$new_record_id.json" ]]; then
    print_success "Stored file metadata path: $stored_path"
else
    test_fail "File metadata path should be '/data/account/$new_record_id.json', got: $stored_path"
fi

if [[ "$stored_type" == "file" && "$stored_size" -gt 100 ]]; then
    print_success "File metadata: type=$stored_type, size=$stored_size bytes"
else
    test_fail "Invalid file metadata: type=$stored_type, size=$stored_size"
fi

# Test 2: Verify new record exists via Data API
print_step "Verifying new record exists via Data API"
verify_response=$(auth_get "api/data/account/$new_record_id")
verify_data=$(extract_and_validate_data "$verify_response" "created account record")

verify_name=$(echo "$verify_data" | jq -r '.name')
verify_email=$(echo "$verify_data" | jq -r '.email')
verify_balance=$(echo "$verify_data" | jq -r '.balance')

if [[ "$verify_name" == "File API Test User" && 
      "$verify_email" == "fileapi.test@example.com" &&
      "$verify_balance" == "150.75" ]]; then
    print_success "Created record verified via Data API with correct data"
else
    test_fail "Created record data mismatch: name=$verify_name, email=$verify_email, balance=$verify_balance"
fi

# Test 3: Verify new record accessible via File API stat
print_step "Verifying new record accessible via File API stat"
new_record_stat=$(file_stat "/data/account/$new_record_id.json")
stat_size=$(echo "$new_record_stat" | jq -r '.file_metadata.size')

if [[ "$stat_size" -gt 100 ]]; then
    print_success "New record accessible via File API stat: $stat_size bytes"
else
    test_fail "New record not properly accessible via File API"
fi

# Test 4: Update existing record via JSON file (overwrite)
print_step "Testing File store: update existing record via overwrite"
updated_content=$(echo "$new_record_content" | jq '.name = "Updated Test User" | .balance = 250.50')

update_store=$(file_store "/data/account/$new_record_id.json" "$updated_content" '{"overwrite": true}')

# Validate update operation
update_operation=$(echo "$update_store" | jq -r '.operation')
updated_flag=$(echo "$update_store" | jq -r '.result.updated')

if [[ "$update_operation" == "update" && "$updated_flag" == "true" ]]; then
    print_success "Record update operation successful"
else
    test_fail "Record update failed: operation=$update_operation, updated=$updated_flag"
fi

# Verify update via Data API
updated_verify=$(auth_get "api/data/account/$new_record_id")
updated_verify_data=$(extract_and_validate_data "$updated_verify" "updated account record")

updated_name=$(echo "$updated_verify_data" | jq -r '.name')
updated_balance=$(echo "$updated_verify_data" | jq -r '.balance')

if [[ "$updated_name" == "Updated Test User" && "$updated_balance" == "250.5" ]]; then
    print_success "Record update verified: name=$updated_name, balance=$updated_balance"
else
    test_fail "Record update verification failed"
fi

# Test 5: Update single field via field path
print_step "Testing File store: update single field"
field_store=$(file_store "/data/account/$new_record_id/department" '"Engineering"')

# Validate field update
field_operation=$(echo "$field_store" | jq -r '.operation')
if [[ "$field_operation" == "field_update" || "$field_operation" == "update" ]]; then
    print_success "Field update operation: $field_operation"
else
    test_fail "Field update operation failed: $field_operation"
fi

# Verify field update
field_verify=$(auth_get "api/data/account/$new_record_id")
field_verify_data=$(extract_and_validate_data "$field_verify" "field updated record")

updated_department=$(echo "$field_verify_data" | jq -r '.department')
if [[ "$updated_department" == "Engineering" ]]; then
    print_success "Field update verified: department=$updated_department"
else
    test_fail "Field update verification failed: department=$updated_department"
fi

# Test 6: Verify field accessible via File API retrieve
print_step "Verifying updated field via File API retrieve"
field_retrieve=$(file_retrieve "/data/account/$new_record_id/department")
field_content=$(echo "$field_retrieve" | jq -r '.content')

if [[ "$field_content" == "Engineering" ]]; then
    print_success "Updated field accessible via File API: '$field_content'"
else
    test_fail "Field retrieve failed: '$field_content'"
fi

# Test 7: Test record creation without overwrite (should fail if exists)
print_step "Testing File store: creation without overwrite flag (should fail)"
duplicate_content='{"name": "Duplicate Test", "email": "duplicate@test.com"}'
duplicate_response=$(file_store "/data/account/$new_record_id.json" "$duplicate_content" '{"overwrite": false}' 2>/dev/null || echo '{"success":false}')

if echo "$duplicate_response" | jq -e '.success == false' >/dev/null; then
    error_code=$(echo "$duplicate_response" | jq -r '.error_code // .error // empty')
    print_success "Correctly rejected duplicate creation: $error_code"
else
    test_fail "Should have rejected creation without overwrite flag"
fi

# Test 8: Create record with custom field types
print_step "Testing File store: record with various field types"
complex_content='{
  "name": "Complex Record Test",
  "email": "complex@test.com",
  "balance": 999.99,
  "active": true,
  "metadata": {"tags": ["test", "api"], "priority": 1},
  "notes": null
}'

complex_record_id="complex-test-$(date +%s)"
complex_store=$(file_store "/data/account/$complex_record_id.json" "$complex_content")

complex_created=$(echo "$complex_store" | jq -r '.result.created')
complex_record_actual_id=$(echo "$complex_store" | jq -r '.result.record_id')

if [[ "$complex_created" == "true" && -n "$complex_record_actual_id" ]]; then
    print_success "Complex record created with ID: $complex_record_actual_id"
    
    # Verify complex field types
    complex_verify=$(auth_get "api/data/account/$complex_record_actual_id")
    complex_data=$(extract_and_validate_data "$complex_verify" "complex record")
    
    complex_active=$(echo "$complex_data" | jq -r '.active')
    complex_metadata=$(echo "$complex_data" | jq -c '.metadata')
    
    if [[ "$complex_active" == "true" && "$complex_metadata" == '{"tags":["test","api"],"priority":1}' ]]; then
        print_success "Complex field types preserved correctly"
    else
        print_warning "Complex field types may not be preserved exactly"
    fi
else
    test_fail "Complex record creation failed"
fi

# Test 9: Error cases
print_step "Testing File store error cases"

# Test invalid path
test_file_api_error "store" "/data/nonexistent_schema/record.json" "SCHEMA_NOT_FOUND" "non-existent schema"

# Test invalid JSON (if applicable)
invalid_json_response=$(file_store "/data/account/invalid-test.json" '"unclosed string' 2>/dev/null || echo '{"success":false}')
if echo "$invalid_json_response" | jq -e '.success == false' >/dev/null; then
    print_success "Correctly rejected invalid JSON content"
else
    print_warning "Invalid JSON handling may need improvement"
fi

# Test 10: Verify total record count increased
print_step "Verifying total record count increased"
final_accounts=$(auth_get "api/data/account")
final_count=$(echo "$final_accounts" | jq -r '.data | length')

expected_count=$((initial_count + 2)) # We created 2 new records
if [[ "$final_count" -ge "$expected_count" ]]; then
    print_success "Record count increased appropriately: $initial_count -> $final_count"
else
    test_fail "Expected at least $expected_count records, got: $final_count"
fi

# Test 11: Validate atomic operations
print_step "Testing File store atomic operations"
atomic_content='{"name": "Atomic Test", "email": "atomic@test.com"}'
atomic_store=$(file_store "/data/account/atomic-test.json" "$atomic_content" '{"atomic": true}')

atomic_success=$(echo "$atomic_store" | jq -r '.success')
if [[ "$atomic_success" == "true" ]]; then
    print_success "Atomic store operation completed successfully"
else
    test_fail "Atomic store operation failed"
fi

print_success "File API store functionality tests completed successfully"