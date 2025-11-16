#!/usr/bin/env bash
set -e

# Format API Morse Code Test
# Tests Morse code format encoding/decoding with POST /auth/login

# Source helpers
source "$(dirname "$0")/../test-helper.sh"

print_step "Testing Morse code format functionality"

# Setup test environment
setup_test_without_template "format-morse"

print_step "Testing Morse code request and response"

# Generate morse code for login request
# {"tenant":"toon-test","username":"root","format":"morse"}
morse_request='--... -... ..--- ..--- --... ....- -.... ..... -.... . -.... .---- -.... . --... ....- ..--- ..--- ...-- .- ..--- ..--- --... ....- -.... ..-. -.... ..-. -.... . ..--- -.. --... ....- -.... ..... --... ...-- --... ....- ..--- ..--- ..--- -.-. ..--- ..--- --... ..... --... ...-- -.... ..... --... ..--- -.... . -.... .---- -.... -.. -.... ..... ..--- ..--- ...-- .- ..--- ..--- --... ..--- -.... ..-. -.... ..-. --... ....- ..--- ..--- ..--- -.-. ..--- ..--- -.... -.... -.... ..-. --... ..--- -.... -.. -.... .---- --... ....- ..--- ..--- ...-- .- ..--- ..--- -.... -.. -.... ..-. --... ..--- --... ...-- -.... ..... ..--- ..--- --... -...'

# Make request with Morse Content-Type and Accept headers
response=$(curl -s -X POST "http://localhost:${PORT}/auth/login" \
    -H "Content-Type: application/morse" \
    -H "Accept: application/morse" \
    -d "$morse_request")

# Verify response is in Morse format (dots and dashes)
if echo "$response" | grep -qE '^[.\- ]+$'; then
    print_success "Response is in Morse code format"
else
    test_fail "Expected Morse code format response, got: $(echo "$response" | head -c 100)"
fi

# Verify response contains morse characters
if echo "$response" | grep -q '\.'; then
    print_success "Morse response contains dots"
else
    test_fail "Morse response missing dots"
fi

if echo "$response" | grep -q '\-'; then
    print_success "Morse response contains dashes"
else
    test_fail "Morse response missing dashes"
fi

print_success "Morse code format functionality tests completed successfully"
