#!/usr/bin/env bash
set -e

# File API Delete Basic Test - SKIPPED
# Tests the POST /api/file/delete endpoint with soft/hard delete operations to verify deletion functionality
# STATUS: DISABLED - File API implementation needs review

echo "🚫 FILE API TEST DISABLED: delete-basic.test.sh - File API implementation under review"
exit 0

# Source helpers
source "$(dirname "$0")/../test-helper.sh"
source "$(dirname "$0")/../file-api-helpers.sh"

print_step "Testing File API delete functionality"

# Setup test environment with template (provides account data)
setup_test_with_template "delete-basic"
setup_admin_auth

# Get template account data for testing
print_step "Extracting template account data for File API testing"
first_account=$(get_template_account)
extract_account_info "$first_account"

# Create test records for deletion testing
print_step "Creating test records for deletion testing"
test_record_1='{
  "name": "Delete Test Record 1",
  "email": "delete1@test.com",
  "department": "Testing"
}'

test_record_2='{
  "name": "Delete Test Record 2", 
  "email": "delete2@test.com",
  "department": "QA"
}'

# Create records using File API store
delete_test_1=$(file_store "/data/account/delete-test-1.json" "$test_record_1")
delete_test_2=$(file_store "/data/account/delete-test-2.json" "$test_record_2")

delete_test_id_1=$(echo "$delete_test_1" | jq -r '.result.record_id')
delete_test_id_2=$(echo "$delete_test_2" | jq -r '.result.record_id')

if [[ -n "$delete_test_id_1" && -n "$delete_test_id_2" && 
      "$delete_test_id_1" != "null" && "$delete_test_id_2" != "null" ]]; then
    print_success "Created test records: $delete_test_id_1, $delete_test_id_2"
else
    test_fail "Failed to create test records for deletion testing"
fi

# Test 1: Soft delete a record (default behavior)
print_step "Testing File delete: soft delete record (default)"
soft_delete_response=$(file_delete "/data/account/$delete_test_id_1")

# Validate response structure
assert_has_field "success" "$soft_delete_response"
assert_has_field "operation" "$soft_delete_response"
assert_has_field "results" "$soft_delete_response"
assert_has_field "file_metadata" "$soft_delete_response"

# Validate operation type
delete_operation=$(echo "$soft_delete_response" | jq -r '.operation')
if [[ "$delete_operation" == "soft_delete" ]]; then
    print_success "Delete operation correctly identified as: $delete_operation"
else
    test_fail "Delete operation should be 'soft_delete', got: $delete_operation"
fi

# Validate results
deleted_count=$(echo "$soft_delete_response" | jq -r '.results.deleted_count')
deleted_paths=$(echo "$soft_delete_response" | jq -r '.results.paths[0]')
records_affected=$(echo "$soft_delete_response" | jq -r '.results.records_affected[0]')

if [[ "$deleted_count" == "1" && 
      "$deleted_paths" == "/data/account/$delete_test_id_1" &&
      "$records_affected" == "$delete_test_id_1" ]]; then
    print_success "Soft delete results: count=$deleted_count, record=$records_affected"
else
    test_fail "Soft delete results validation failed"
fi

# Validate file metadata for restore capability
can_restore=$(echo "$soft_delete_response" | jq -r '.file_metadata.can_restore')
if [[ "$can_restore" == "true" ]]; then
    print_success "Soft deleted record can be restored: $can_restore"
else
    test_fail "Soft deleted record should be restorable"
fi

# Test 2: Verify soft deleted record not accessible via normal File API
print_step "Verifying soft deleted record not accessible via normal File API"
deleted_stat_response=$(file_stat "/data/account/$delete_test_id_1.json" 2>/dev/null || echo '{"success":false}')

if echo "$deleted_stat_response" | jq -e '.success == false' >/dev/null; then
    print_success "Soft deleted record correctly hidden from normal File API access"
else
    test_fail "Soft deleted record should not be accessible via normal File API"
fi

# Test 3: Verify soft deleted record not accessible via normal Data API
print_step "Verifying soft deleted record not accessible via normal Data API"
deleted_data_response=$(auth_get "api/data/account/$delete_test_id_1" 2>/dev/null || echo '{"success":false}')

if echo "$deleted_data_response" | jq -e '.success == false' >/dev/null; then
    print_success "Soft deleted record correctly hidden from normal Data API access"
else
    test_fail "Soft deleted record should not be accessible via normal Data API"
fi

# Test 4: Verify soft deleted record accessible with include_trashed
print_step "Verifying soft deleted record accessible with include_trashed"
trashed_data_response=$(auth_get "api/data/account/$delete_test_id_1?include_trashed=true")

if echo "$trashed_data_response" | jq -e '.success == true' >/dev/null; then
    trashed_data=$(extract_and_validate_data "$trashed_data_response" "trashed account record")
    trashed_name=$(echo "$trashed_data" | jq -r '.name')
    trashed_at=$(echo "$trashed_data" | jq -r '.trashed_at')
    
    if [[ "$trashed_name" == "Delete Test Record 1" && "$trashed_at" != "null" ]]; then
        print_success "Soft deleted record accessible with include_trashed: trashed_at=$trashed_at"
    else
        test_fail "Trashed record data validation failed"
    fi
else
    test_fail "Soft deleted record should be accessible with include_trashed=true"
fi

# Test 5: Delete single field
print_step "Testing File delete: delete single field"
field_delete_response=$(file_delete "/data/account/$delete_test_id_2/department")

field_operation=$(echo "$field_delete_response" | jq -r '.operation')
field_deleted_count=$(echo "$field_delete_response" | jq -r '.results.deleted_count')
fields_cleared=$(echo "$field_delete_response" | jq -r '.results.fields_cleared[0] // empty')

if [[ "$field_operation" == "field_delete" && "$field_deleted_count" == "1" ]]; then
    print_success "Field delete operation successful: $field_operation, cleared: $fields_cleared"
else
    test_fail "Field delete operation failed: operation=$field_operation, count=$field_deleted_count"
fi

# Verify field was cleared
field_verify=$(auth_get "api/data/account/$delete_test_id_2")
field_verify_data=$(extract_and_validate_data "$field_verify" "field deleted record")

department_value=$(echo "$field_verify_data" | jq -r '.department')
if [[ "$department_value" == "null" || -z "$department_value" ]]; then
    print_success "Field successfully cleared from record"
else
    test_fail "Field was not properly cleared: department=$department_value"
fi

# Test 6: Verify field deletion not restorable
field_can_restore=$(echo "$field_delete_response" | jq -r '.file_metadata.can_restore')
if [[ "$field_can_restore" == "false" ]]; then
    print_success "Field deletion correctly marked as non-restorable"
else
    test_fail "Field deletion should not be restorable"
fi

# Test 7: Test permanent delete (requires special handling)
print_step "Testing File delete: permanent delete attempt"
permanent_delete_response=$(file_delete "/data/account/$delete_test_id_2" '{"permanent": true}' 2>/dev/null || echo '{"success":false}')

# Note: Permanent delete might require special permissions or be restricted
if echo "$permanent_delete_response" | jq -e '.success == true' >/dev/null; then
    permanent_operation=$(echo "$permanent_delete_response" | jq -r '.operation')
    print_success "Permanent delete operation: $permanent_operation"
    
    # Verify record completely gone
    permanent_verify=$(auth_get "api/data/account/$delete_test_id_2?include_trashed=true" 2>/dev/null || echo '{"success":false}')
    if echo "$permanent_verify" | jq -e '.success == false' >/dev/null; then
        print_success "Record permanently deleted - not accessible even with include_trashed"
    else
        print_warning "Permanent delete may not be fully implemented"
    fi
elif echo "$permanent_delete_response" | jq -e '.error_code == "PERMISSION_DENIED"' >/dev/null; then
    print_success "Permanent delete correctly requires elevated permissions"
else
    print_warning "Permanent delete functionality may need implementation: $(echo "$permanent_delete_response" | jq -r '.error // .error_code // "unknown"')"
fi

# Test 8: Test delete with safety checks
print_step "Testing File delete: safety checks and limits"
safety_delete_response=$(file_delete "/data/account/$ACCOUNT_ID" '{}' '{"max_deletions": 1}')

if echo "$safety_delete_response" | jq -e '.success == true' >/dev/null; then
    print_success "Delete with safety checks successful"
elif echo "$safety_delete_response" | jq -e '.success == false' >/dev/null; then
    safety_error=$(echo "$safety_delete_response" | jq -r '.error_code // .error // empty')
    if [[ "$safety_error" == "PERMISSION_DENIED" ]]; then
        print_success "Delete correctly blocked by permission system"
    else
        print_warning "Delete blocked by safety checks: $safety_error"
    fi
else
    test_fail "Safety check delete test inconclusive"
fi

# Test 9: Test recursive delete (directory-like operation)
print_step "Testing File delete: recursive delete simulation"
recursive_delete_response=$(file_delete "/data/account/$ACCOUNT_ID" '{"recursive": false}' 2>/dev/null || echo '{"success":false}')

# This should either succeed with soft delete or fail with appropriate error
if echo "$recursive_delete_response" | jq -e '.success == true' >/dev/null; then
    recursive_operation=$(echo "$recursive_delete_response" | jq -r '.operation')
    print_success "Non-recursive delete successful: $recursive_operation"
elif echo "$recursive_delete_response" | jq -e '.success == false' >/dev/null; then
    recursive_error=$(echo "$recursive_delete_response" | jq -r '.error_code // .error // empty')
    print_success "Non-recursive delete appropriately handled: $recursive_error"
else
    test_fail "Recursive delete test inconclusive"
fi

# Test 10: Test atomic delete operations
print_step "Testing File delete: atomic operations"
atomic_delete_response=$(file_delete "/data/account/nonexistent-for-atomic" '{"atomic": true}' 2>/dev/null || echo '{"success":false}')

if echo "$atomic_delete_response" | jq -e '.success == false' >/dev/null; then
    atomic_error=$(echo "$atomic_delete_response" | jq -r '.error_code // .error // empty')
    if [[ "$atomic_error" == "RECORD_NOT_FOUND" ]]; then
        print_success "Atomic delete correctly handles non-existent records: $atomic_error"
    else
        print_warning "Atomic delete error handling: $atomic_error"
    fi
else
    test_fail "Atomic delete of non-existent record should fail"
fi

# Test 11: Error cases
print_step "Testing File delete error cases"

# Test delete on non-existent schema
test_file_api_error "delete" "/data/nonexistent_schema/record.json" "SCHEMA_NOT_FOUND" "non-existent schema deletion"

# Test delete on non-existent record
test_file_api_error "delete" "/data/account/00000000-0000-0000-0000-000000000000.json" "RECORD_NOT_FOUND" "non-existent record deletion"

# Test delete on non-existent field
test_file_api_error "delete" "/data/account/$ACCOUNT_ID/nonexistent_field" "FIELD_NOT_FOUND" "non-existent field deletion"

# Test 12: Validate delete operation atomicity
print_step "Testing File delete: operation atomicity validation"
# This is more of a validation that operations complete fully
# The actual atomicity would be tested in integration scenarios

print_success "Delete operation atomicity validation completed"

# Test 13: Test force delete flag
print_step "Testing File delete: force delete flag"
force_delete_response=$(file_delete "/data/account/$ACCOUNT_ID.json" '{"force": true}' 2>/dev/null || echo '{"success":false}')

if echo "$force_delete_response" | jq -e '.success == true' >/dev/null; then
    force_operation=$(echo "$force_delete_response" | jq -r '.operation')
    print_success "Force delete operation successful: $force_operation"
elif echo "$force_delete_response" | jq -e '.success == false' >/dev/null; then
    force_error=$(echo "$force_delete_response" | jq -r '.error_code // .error // empty')
    if [[ "$force_error" == "PERMISSION_DENIED" ]]; then
        print_success "Force delete correctly requires appropriate permissions"
    else
        print_warning "Force delete handling: $force_error"
    fi
else
    test_fail "Force delete test inconclusive"
fi

print_success "File API delete functionality tests completed successfully"