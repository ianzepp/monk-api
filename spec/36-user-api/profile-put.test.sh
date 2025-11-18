#!/bin/bash
# Test: PUT /api/user/profile - Update own profile
# Expected: 200 OK, can update name and auth without sudo

source "$(dirname "$0")/../helpers/setup.sh"

# Get current profile
current_profile=$(curl -s \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$API_BASE/api/user/profile")

current_name=$(echo "$current_profile" | jq -r '.data.name')
current_auth=$(echo "$current_profile" | jq -r '.data.auth')

# Test 1: Update name
new_name="Updated Name $(date +%s)"
response=$(curl -s -w "\n%{http_code}" \
    -X PUT \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$new_name\"}" \
    "$API_BASE/api/user/profile")

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

assert_equals "$status" "200" "Should return 200 OK"
assert_json_success "$body"
assert_json_value "$body" ".data.name" "$new_name" "Should update name"

echo "✓ Can update name without sudo"

# Test 2: Try to update access level (should fail)
response=$(curl -s -w "\n%{http_code}" \
    -X PUT \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"access\": \"root\"}" \
    "$API_BASE/api/user/profile")

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

assert_equals "$status" "400" "Should return 400 Bad Request"
assert_json_error "$body" "VALIDATION_ERROR" "Should reject access level changes"

echo "✓ Cannot update access level via profile endpoint"

# Test 3: Invalid name length
response=$(curl -s -w "\n%{http_code}" \
    -X PUT \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"a\"}" \
    "$API_BASE/api/user/profile")

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

assert_equals "$status" "400" "Should return 400 Bad Request"
assert_json_error "$body" "VALIDATION_ERROR" "Should validate name length"

echo "✓ Validates name length (min 2 characters)"

echo "✓ PUT /api/user/profile works"
