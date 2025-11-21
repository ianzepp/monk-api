#!/bin/bash
# Test: POST /api/user/deactivate - Deactivate own account
# Expected: 200 OK, can deactivate without sudo

source "$(dirname "$0")/../helpers/setup.sh"

# Create a test user that we'll deactivate
test_user_name="Test User To Deactivate $(date +%s)"
test_user_auth="test_deactivate_$(date +%s)@example.com"

# Note: This test requires sudo to create a user first
# Get sudo token
sudo_response=$(curl -s \
    -X POST \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"reason\": \"Testing deactivation\"}" \
    "$API_BASE/api/user/sudo")

sudo_token=$(echo "$sudo_response" | jq -r '.data.token')

if [ "$sudo_token" = "null" ] || [ -z "$sudo_token" ]; then
    echo "⚠ Skipping deactivation test - cannot get sudo token"
    exit 0
fi

# Create test user
create_response=$(curl -s \
    -X POST \
    -H "Authorization: Bearer $sudo_token" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$test_user_name\", \"auth\": \"$test_user_auth\", \"access\": \"read\"}" \
    "$API_BASE/api/sudo/users")

test_user_id=$(echo "$create_response" | jq -r '.data.id')

if [ "$test_user_id" = "null" ] || [ -z "$test_user_id" ]; then
    echo "⚠ Skipping deactivation test - cannot create test user"
    exit 0
fi

# Login as test user to get their token
login_response=$(curl -s \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"tenant\": \"$TEST_TENANT\", \"username\": \"$test_user_auth\"}" \
    "$API_BASE/auth/login")

test_user_token=$(echo "$login_response" | jq -r '.data.token')

if [ "$test_user_token" = "null" ] || [ -z "$test_user_token" ]; then
    echo "⚠ Skipping deactivation test - cannot login as test user"
    exit 0
fi

# Test 1: Try to deactivate without confirmation (should fail)
response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $test_user_token" \
    -H "Content-Type: application/json" \
    -d "{}" \
    "$API_BASE/api/user/deactivate")

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

assert_equals "$status" "400" "Should return 400 Bad Request"
assert_json_error "$body" "CONFIRMATION_REQUIRED" "Should require confirmation"

echo "✓ Requires explicit confirmation"

# Test 2: Deactivate with confirmation
response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $test_user_token" \
    -H "Content-Type: application/json" \
    -d "{\"confirm\": true, \"reason\": \"Testing self-service deactivation\"}" \
    "$API_BASE/api/user/deactivate")

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

assert_equals "$status" "200" "Should return 200 OK"
assert_json_success "$body"
assert_json_field "$body" ".data.message" "Should include success message"
assert_json_field "$body" ".data.deactivated_at" "Should include deactivation timestamp"

echo "✓ Can deactivate own account without sudo"

# Test 3: Verify user cannot login after deactivation
login_again=$(curl -s \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"tenant\": \"$TEST_TENANT\", \"username\": \"$test_user_auth\"}" \
    "$API_BASE/auth/login")

error_code=$(echo "$login_again" | jq -r '.error_code')
assert_not_equals "$error_code" "null" "Should fail to login after deactivation"

echo "✓ Deactivated user cannot login"

echo "✓ POST /api/user/deactivate works"
