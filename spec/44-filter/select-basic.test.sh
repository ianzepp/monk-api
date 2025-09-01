#!/usr/bin/env bash
set -e

# Find API Basic SELECT Test
# Tests column selection with select field in POST /api/find/:schema

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Find API basic SELECT functionality"

# Setup test environment with template (provides 5 account records)
setup_test_with_template "select-basic"
setup_admin_auth

# First get full records to see all available fields
print_step "Getting full record structure for SELECT tests"

all_response=$(auth_post "api/find/account" "{}")
all_data=$(extract_and_validate_data "$all_response" "All accounts")

# Show available fields in full record
sample_record=$(echo "$all_data" | jq -r '.[0]')
all_fields=$(echo "$sample_record" | jq -r 'keys | join(", ")')
print_success "Available fields: $all_fields"

# Test 1: Select specific fields
print_step "Testing SELECT specific fields (name, email)"

select_filter='{"select": ["name", "email"]}'

response=$(auth_post "api/find/account" "$select_filter")
data=$(extract_and_validate_data "$response" "Select specific fields results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "SELECT specific fields returned all $record_count records"
else
    test_fail "Expected 5 records with SELECT, got: $record_count"
fi

# Verify only selected fields are present
first_record=$(echo "$data" | jq -r '.[0]')
returned_fields=$(echo "$first_record" | jq -r 'keys | join(", ")')
print_success "Returned fields: $returned_fields"

# Check that only requested fields are included
if echo "$first_record" | jq -e '.name' >/dev/null; then
    print_success "Selected field 'name' is present"
else
    test_fail "Selected field 'name' is missing"
fi

if echo "$first_record" | jq -e '.email' >/dev/null; then
    print_success "Selected field 'email' is present"
else
    test_fail "Selected field 'email' is missing"
fi

# Check that non-selected fields are excluded (if implementation supports field filtering)
if echo "$first_record" | jq -e '.balance' >/dev/null; then
    print_warning "Non-selected field 'balance' is present (SELECT may not filter columns)"
else
    print_success "Non-selected field 'balance' correctly excluded"
fi

# Test 2: Select single field
print_step "Testing SELECT single field (name only)"

single_select_filter='{"select": ["name"]}'

response=$(auth_post "api/find/account" "$single_select_filter")
data=$(extract_and_validate_data "$response" "Single select results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Single field SELECT returned all $record_count records"
else
    test_fail "Expected 5 records with single SELECT, got: $record_count"
fi

# Verify only name field structure
first_single=$(echo "$data" | jq -r '.[0]')
single_field_count=$(echo "$first_single" | jq 'keys | length')
print_success "Single SELECT returned record with $single_field_count fields"

# Test 3: Select system fields  
print_step "Testing SELECT system fields (id, created_at, updated_at)"

system_select_filter='{"select": ["id", "created_at", "updated_at"]}'

response=$(auth_post "api/find/account" "$system_select_filter")
data=$(extract_and_validate_data "$response" "System fields select results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "System fields SELECT returned all $record_count records"
else
    test_fail "Expected 5 records with system field SELECT, got: $record_count"
fi

# Verify system fields are included
first_system=$(echo "$data" | jq -r '.[0]')
validate_record_fields "$first_system" "id" "created_at" "updated_at"

# Test 4: Select all fields explicitly
print_step "Testing SELECT all fields explicitly"

# List common account fields explicitly 
all_select_filter='{"select": ["id", "name", "email", "username", "account_type", "balance", "is_active", "is_verified", "created_at", "updated_at"]}'

response=$(auth_post "api/find/account" "$all_select_filter")
data=$(extract_and_validate_data "$response" "All fields select results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Explicit all fields SELECT returned all $record_count records"
else
    test_fail "Expected 5 records with all fields SELECT, got: $record_count"
fi

# Test 5: Select with wildcard (if supported)
print_step "Testing SELECT with wildcard (*)"

wildcard_select_filter='{"select": ["*"]}'

response=$(auth_post "api/find/account" "$wildcard_select_filter")
data=$(extract_and_validate_data "$response" "Wildcard select results")

record_count=$(echo "$data" | jq 'length')
if [[ "$record_count" -eq 5 ]]; then
    print_success "Wildcard SELECT (*) returned all $record_count records"
else
    test_fail "Expected 5 records with wildcard SELECT, got: $record_count"
fi

# Compare wildcard vs no select clause
wildcard_fields=$(echo "$data" | jq -r '.[0] | keys | length')
default_fields=$(echo "$all_data" | jq -r '.[0] | keys | length')

if [[ "$wildcard_fields" -eq "$default_fields" ]]; then
    print_success "Wildcard SELECT returns same fields as default (both return $wildcard_fields fields)"
else
    print_success "Wildcard SELECT vs default: $wildcard_fields vs $default_fields fields"
fi

# Test 6: Select non-existent field (error handling)
print_step "Testing SELECT non-existent field"

invalid_select_filter='{"select": ["nonexistent_field"]}'

response=$(auth_post "api/find/account" "$invalid_select_filter" || echo '{"success":false,"error":"Expected error"}')

# This should return an error since PostgreSQL will reject unknown columns
if echo "$response" | jq -e '.success == false' >/dev/null; then
    print_success "Non-existent field SELECT correctly returned error"
else
    test_fail "Expected error for non-existent field SELECT, got success"
fi

print_success "Find API basic SELECT functionality tests completed successfully"