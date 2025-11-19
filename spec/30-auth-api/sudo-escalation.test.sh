#!/usr/bin/env bash
set -e

# Sudo Escalation Test
# Tests the /api/auth/sudo endpoint for privilege escalation

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing sudo escalation endpoint"

# Setup test environment
setup_test_with_template "sudo-escalation" "testing"
setup_full_auth

# Test 1: Basic sudo escalation
print_step "Testing POST /api/auth/sudo with full user"

sudo_payload=$(jq -n '{"reason": "Testing sudo escalation"}')
sudo_response=$(auth_post "api/auth/sudo" "$sudo_payload")

echo "Sudo response: $sudo_response"

# Check if escalation succeeded
if echo "$sudo_response" | jq -e '.success == true' >/dev/null; then
    print_success "Sudo escalation succeeded"

    # Extract sudo token
    sudo_token=$(echo "$sudo_response" | jq -r '.data.sudo_token')
    expires_in=$(echo "$sudo_response" | jq -r '.data.expires_in')
    is_sudo=$(echo "$sudo_response" | jq -r '.data.is_sudo')

    print_success "Received sudo_token: ${sudo_token:0:20}..."
    print_success "Expires in: $expires_in seconds"
    print_success "Is sudo: $is_sudo"
else
    error_msg=$(echo "$sudo_response" | jq -r '.error')
    error_code=$(echo "$sudo_response" | jq -r '.error_code')
    test_fail "Sudo escalation failed: $error_code - $error_msg"
fi

print_success "Sudo escalation test completed successfully"
