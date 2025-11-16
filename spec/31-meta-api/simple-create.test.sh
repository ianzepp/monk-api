#!/usr/bin/env bash
# Note: Not using set -e to see full error output

source "$(dirname "$0")/../test-helper.sh"

print_step "Testing simple schema creation with sudo"

setup_test_with_template "simple-create" "testing"
setup_full_auth
setup_sudo_auth "Testing schema creation"

simple_schema='{
    "columns": [
        {"column_name": "name", "type": "text", "required": true}
    ]
}'

print_step "Creating test schema"
echo "Request body:"
echo "$simple_schema" | jq '.'

echo "SUDO_TOKEN: ${SUDO_TOKEN:0:20}..."
echo "Calling sudo_post..."

response=$(sudo_post "api/describe/test_simple" "$simple_schema")

echo "Raw response:"
echo "$response"

echo "Parsed response:"
echo "$response" | jq '.' 2>&1 || echo "Failed to parse JSON"

if echo "$response" | jq -e '.success == true' >/dev/null; then
    print_success "Schema created successfully"
else
    error=$(echo "$response" | jq -r '.error')
    error_code=$(echo "$response" | jq -r '.error_code')
    print_error "Failed: $error_code - $error"
fi

print_success "Test completed"
