#!/usr/bin/env bash
set -e

# History API Test
# Tests change tracking for columns marked as tracked

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing History API - Change Tracking"

# Setup test environment with template and authentication
setup_test_with_template "history-tracking"
setup_root_auth

# Step 1: Mark specific columns as tracked on the account schema
print_step "Marking account columns as tracked"

# Mark 'email' and 'name' columns as tracked
auth_put "api/describe/account/email" '{"tracked": true}'
print_success "Marked 'email' column as tracked"

auth_put "api/describe/account/name" '{"tracked": true}'
print_success "Marked 'name' column as tracked"

# Step 2: Create a test account (should be tracked)
print_step "Creating test account"

account_data=$(generate_test_account "John Doe" "john@example.com" "johndoe")
response=$(auth_post "api/data/account" "$account_data")
records_array=$(extract_and_validate_data "$response" "Created account")
record=$(echo "$records_array" | jq -r '.[0]')
record_id=$(echo "$record" | jq -r '.id')

if [[ -z "$record_id" || "$record_id" == "null" ]]; then
    test_fail "Failed to create test account"
fi

print_success "Created account with ID: $record_id"

# Step 3: Verify history record was created for 'create' operation
print_step "Verifying create operation was tracked"

sleep 1 # Give the observer time to process

history_response=$(auth_get "api/history/account/$record_id")
history_data=$(extract_and_validate_data "$history_response" "History data")

# Check that we have at least one history entry
history_count=$(echo "$history_data" | jq -r 'length')
if [[ "$history_count" -ge 1 ]]; then
    print_success "Found $history_count history entry(ies)"
else
    test_fail "Expected at least 1 history entry, got: $history_count"
fi

# Get the first (most recent) history entry
first_entry=$(echo "$history_data" | jq -r '.[0]')
operation=$(echo "$first_entry" | jq -r '.operation')
change_id=$(echo "$first_entry" | jq -r '.change_id')

if [[ "$operation" == "create" ]]; then
    print_success "History entry has correct operation: $operation"
else
    test_fail "Expected operation 'create', got: $operation"
fi

# Verify the changes contain tracked fields (name and email)
changes=$(echo "$first_entry" | jq -r '.changes')
name_change=$(echo "$changes" | jq -r '.name')
email_change=$(echo "$changes" | jq -r '.email')

if [[ "$name_change" != "null" ]]; then
    print_success "History entry contains 'name' field change"
else
    test_fail "Expected 'name' field in changes"
fi

if [[ "$email_change" != "null" ]]; then
    print_success "History entry contains 'email' field change"
else
    test_fail "Expected 'email' field in changes"
fi

# Verify old value is null for create
name_old=$(echo "$changes" | jq -r '.name.old')
if [[ "$name_old" == "null" ]]; then
    print_success "Create operation has null old value for name"
else
    test_fail "Expected old value to be null for create, got: $name_old"
fi

# Verify new value matches what we created
name_new=$(echo "$changes" | jq -r '.name.new')
if [[ "$name_new" == "John Doe" ]]; then
    print_success "Create operation has correct new value for name: $name_new"
else
    test_fail "Expected new value 'John Doe', got: $name_new"
fi

# Step 4: Update the account (should be tracked)
print_step "Updating account email"

update_data='{"email": "john.updated@example.com"}'
update_response=$(auth_put "api/data/account/$record_id" "$update_data")
updated_records=$(extract_and_validate_data "$update_response" "Updated account")
updated_record=$(echo "$updated_records" | jq -r '.[0]')
updated_email=$(echo "$updated_record" | jq -r '.email')

if [[ "$updated_email" == "john.updated@example.com" ]]; then
    print_success "Account email updated successfully"
else
    test_fail "Expected updated email 'john.updated@example.com', got: $updated_email"
fi

# Step 5: Verify history record was created for 'update' operation
print_step "Verifying update operation was tracked"

sleep 1 # Give the observer time to process

history_response=$(auth_get "api/history/account/$record_id")
history_data=$(extract_and_validate_data "$history_response" "History data after update")

# Should now have 2 history entries
history_count=$(echo "$history_data" | jq -r 'length')
if [[ "$history_count" -ge 2 ]]; then
    print_success "Found $history_count history entries after update"
else
    test_fail "Expected at least 2 history entries, got: $history_count"
fi

# Get the first (most recent) entry - should be the update
update_entry=$(echo "$history_data" | jq -r '.[0]')
update_operation=$(echo "$update_entry" | jq -r '.operation')

if [[ "$update_operation" == "update" ]]; then
    print_success "Most recent history entry has operation: $update_operation"
else
    test_fail "Expected most recent operation 'update', got: $update_operation"
fi

# Verify the email change was tracked
update_changes=$(echo "$update_entry" | jq -r '.changes')
email_old=$(echo "$update_changes" | jq -r '.email.old')
email_new=$(echo "$update_changes" | jq -r '.email.new')

if [[ "$email_old" == "john@example.com" ]]; then
    print_success "Update tracked old email value: $email_old"
else
    test_fail "Expected old email 'john@example.com', got: $email_old"
fi

if [[ "$email_new" == "john.updated@example.com" ]]; then
    print_success "Update tracked new email value: $email_new"
else
    test_fail "Expected new email 'john.updated@example.com', got: $email_new"
fi

# Step 6: Test getting specific change by change_id
print_step "Testing GET /api/history/:schema/:record/:change_id"

update_change_id=$(echo "$update_entry" | jq -r '.change_id')
change_response=$(auth_get "api/history/account/$record_id/$update_change_id")
change_data=$(extract_and_validate_data "$change_response" "Specific change data")

change_operation=$(echo "$change_data" | jq -r '.operation')
if [[ "$change_operation" == "update" ]]; then
    print_success "Retrieved specific change has correct operation: $change_operation"
else
    test_fail "Expected operation 'update', got: $change_operation"
fi

# Step 7: Delete the account (should be tracked)
print_step "Deleting account"

delete_response=$(auth_delete "api/data/account/$record_id")
print_success "Account deleted"

# Step 8: Verify history record was created for 'delete' operation
print_step "Verifying delete operation was tracked"

sleep 1 # Give the observer time to process

history_response=$(auth_get "api/history/account/$record_id")
history_data=$(extract_and_validate_data "$history_response" "History data after delete")

# Should now have 3 history entries
history_count=$(echo "$history_data" | jq -r 'length')
if [[ "$history_count" -ge 3 ]]; then
    print_success "Found $history_count history entries after delete"
else
    test_fail "Expected at least 3 history entries, got: $history_count"
fi

# Get the first (most recent) entry - should be the delete
delete_entry=$(echo "$history_data" | jq -r '.[0]')
delete_operation=$(echo "$delete_entry" | jq -r '.operation')

if [[ "$delete_operation" == "delete" ]]; then
    print_success "Most recent history entry has operation: $delete_operation"
else
    test_fail "Expected most recent operation 'delete', got: $delete_operation"
fi

# Verify the delete tracked the old values
delete_changes=$(echo "$delete_entry" | jq -r '.changes')
delete_email_old=$(echo "$delete_changes" | jq -r '.email.old')
delete_email_new=$(echo "$delete_changes" | jq -r '.email.new')

if [[ "$delete_email_old" == "john.updated@example.com" ]]; then
    print_success "Delete tracked old email value: $delete_email_old"
else
    test_fail "Expected old email 'john.updated@example.com', got: $delete_email_old"
fi

if [[ "$delete_email_new" == "null" ]]; then
    print_success "Delete has null new value"
else
    test_fail "Expected new value to be null for delete, got: $delete_email_new"
fi

print_success "History API tests completed successfully"
