#!/bin/bash
set -e

# ===================================================================
# FTP USER/PASS Authentication Test
# ===================================================================
# Tests basic FTP authentication flow with USER and PASS commands
# Verifies JWT authentication integration works correctly

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"
source "$(dirname "$0")/../auth-helper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

print_step() { echo -e "${BLUE}→ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

echo "=== FTP USER/PASS Authentication Test ==="

# Check test environment
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"

# Get JWT token for authentication
print_step "Getting JWT token for FTP authentication"
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root via HTTP API"
    exit 1
fi

# Extract JWT token from monk CLI
JWT_TOKEN=$(monk auth info 2>/dev/null | grep "Token:" | cut -d'"' -f2)
if [ -z "$JWT_TOKEN" ]; then
    print_error "Failed to extract JWT token"
    exit 1
fi
print_success "JWT token extracted for FTP testing"

# Start FTP server if not running
FTP_PORT=2125
print_step "Starting FTP server on port $FTP_PORT"
npm run ftp:start $FTP_PORT >/dev/null 2>&1 &
FTP_PID=$!
sleep 2  # Give server time to start

# Helper function to send FTP commands
send_ftp_command() {
    local command="$1"
    local expected_code="$2"
    local timeout="${3:-5}"
    
    print_step "Sending: $command"
    
    # Use nc to send command and capture response
    response=$(echo -e "${command}\r\n" | nc -w $timeout localhost $FTP_PORT | head -1 | tr -d '\r\n')
    
    if [ -z "$response" ]; then
        print_error "No response received for: $command"
        return 1
    fi
    
    response_code=$(echo "$response" | cut -d' ' -f1)
    response_msg=$(echo "$response" | cut -d' ' -f2-)
    
    print_info "Response: $response_code $response_msg"
    
    if [ "$response_code" = "$expected_code" ]; then
        print_success "Command '$command' returned expected code $expected_code"
        return 0
    else
        print_error "Command '$command' returned $response_code, expected $expected_code"
        return 1
    fi
}

# Test FTP connection and welcome message
print_step "Testing FTP connection"
response=$(nc -w 3 localhost $FTP_PORT < /dev/null | head -1 | tr -d '\r\n')
if echo "$response" | grep -q "220"; then
    print_success "FTP server welcome message received: $response"
else
    print_error "Invalid FTP welcome message: $response"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test USER command
print_step "Testing USER command with tenant name"
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_user_test.log 2>&1 &

sleep 1
if grep -q "331.*password" /tmp/ftp_user_test.log; then
    print_success "USER command accepted, password requested"
else
    print_error "USER command failed"
    cat /tmp/ftp_user_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test complete USER/PASS flow
print_step "Testing complete USER/PASS authentication flow"
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PWD\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_auth_test.log 2>&1 &

sleep 2

# Verify authentication success
if grep -q "230.*logged in" /tmp/ftp_auth_test.log; then
    print_success "Authentication successful with JWT token"
else
    print_error "Authentication failed with JWT token"
    cat /tmp/ftp_auth_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Verify PWD works after authentication
if grep -q "257.*current directory" /tmp/ftp_auth_test.log; then
    print_success "PWD command works after authentication"
else
    print_error "PWD command failed after authentication"
    cat /tmp/ftp_auth_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test invalid authentication
print_step "Testing invalid JWT token"
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS invalid_jwt_token\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_invalid_test.log 2>&1 &

sleep 2

if grep -q "530.*Authentication" /tmp/ftp_invalid_test.log; then
    print_success "Invalid JWT token properly rejected"
else
    print_error "Invalid JWT token not properly rejected"
    cat /tmp/ftp_invalid_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test commands without authentication
print_step "Testing commands without authentication"
{
    sleep 0.1
    echo -e "PWD\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_noauth_test.log 2>&1 &

sleep 1

if grep -q "530.*Not logged in" /tmp/ftp_noauth_test.log; then
    print_success "Commands properly rejected without authentication"
else
    print_error "Commands not properly protected"
    cat /tmp/ftp_noauth_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Cleanup
print_step "Cleaning up FTP server"
kill $FTP_PID 2>/dev/null || true
rm -f /tmp/ftp_*_test.log
logout_user

print_success "🎉 FTP USER/PASS authentication test completed successfully!"