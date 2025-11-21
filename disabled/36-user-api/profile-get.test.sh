#!/bin/bash
# Test: GET /api/user/profile - View own profile
# Expected: 200 OK with user profile data

source "$(dirname "$0")/../helpers/setup.sh"

# Test viewing own profile
response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$API_BASE/api/user/profile")

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

assert_equals "$status" "200" "Should return 200 OK"
assert_json_success "$body"
assert_json_field "$body" ".data.id" "Should include user ID"
assert_json_field "$body" ".data.name" "Should include user name"
assert_json_field "$body" ".data.auth" "Should include auth identifier"
assert_json_field "$body" ".data.access" "Should include access level"

echo "✓ GET /api/user/profile works"
