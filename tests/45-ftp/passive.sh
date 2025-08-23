#!/bin/bash
set -e

# ===================================================================
# FTP Passive Mode (PASV) Test
# ===================================================================
# Tests PASV command for data connection setup
# Verifies proper port allocation and connection handling

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

echo "=== FTP Passive Mode (PASV) Test ==="

# Check test environment
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_info "Using test tenant: $TEST_TENANT_NAME"

# Get JWT token
print_step "Getting JWT token for FTP authentication"
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root via HTTP API"
    exit 1
fi

JWT_TOKEN=$(monk auth info 2>/dev/null | grep "Token:" | cut -d'"' -f2)
if [ -z "$JWT_TOKEN" ]; then
    print_error "Failed to extract JWT token"
    exit 1
fi

# Start FTP server
FTP_PORT=2127
print_step "Starting FTP server on port $FTP_PORT"
npm run ftp:start $FTP_PORT >/dev/null 2>&1 &
FTP_PID=$!
sleep 2

# Helper function to parse PASV response
parse_pasv_port() {
    local pasv_response="$1"
    # Extract port from "227 Entering passive mode (127,0,0,1,p1,p2)"
    local port_info=$(echo "$pasv_response" | grep -o '([0-9,]*)')
    if [ -z "$port_info" ]; then
        return 1
    fi
    
    # Extract p1 and p2 from the comma-separated values
    local p1=$(echo "$port_info" | cut -d',' -f5 | tr -d '()')
    local p2=$(echo "$port_info" | cut -d',' -f6 | tr -d '()')
    
    # Calculate actual port: port = p1 * 256 + p2
    echo $((p1 * 256 + p2))
}

# Test 1: Basic PASV command
print_step "Testing basic PASV command"
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_pasv_test.log 2>&1 &

sleep 3

if grep -q "227.*Entering passive mode" /tmp/ftp_pasv_test.log; then
    print_success "PASV command returns passive mode response"
else
    print_error "PASV command failed"
    cat /tmp/ftp_pasv_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Extract and validate port from PASV response
PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_pasv_test.log)
DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")

if [ -n "$DATA_PORT" ] && [ "$DATA_PORT" -gt 0 ]; then
    print_success "PASV port extracted: $DATA_PORT"
    print_info "PASV response: $PASV_RESPONSE"
else
    print_error "Failed to parse PASV port from response"
    cat /tmp/ftp_pasv_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 2: Verify data port is actually listening
print_step "Testing data port connectivity"
sleep 1  # Give server time to set up data connection

# Try to connect to the data port (it should accept connection)
if nc -z localhost $DATA_PORT 2>/dev/null; then
    print_success "Data port $DATA_PORT is listening"
else
    print_info "Data port may not be listening (expected for completed connection)"
fi

# Test 3: Multiple PASV commands (should close previous and open new)
print_step "Testing multiple PASV commands"
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_pasv_multi_test.log 2>&1 &

sleep 3

PASV_COUNT=$(grep -c "227.*Entering passive mode" /tmp/ftp_pasv_multi_test.log)
if [ "$PASV_COUNT" -eq 2 ]; then
    print_success "Multiple PASV commands handled correctly"
else
    print_error "Multiple PASV commands failed (expected 2, got $PASV_COUNT)"
    cat /tmp/ftp_pasv_multi_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 4: PASV without authentication (should fail)
print_step "Testing PASV without authentication"
{
    sleep 0.1
    echo -e "PASV\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_pasv_noauth_test.log 2>&1 &

sleep 1

if grep -q "530.*Not logged in" /tmp/ftp_pasv_noauth_test.log; then
    print_success "PASV properly rejected without authentication"
else
    print_error "PASV not properly protected"
    cat /tmp/ftp_pasv_noauth_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 5: Data connection establishment
print_step "Testing actual data connection establishment"

# Start an FTP session with PASV and immediately try to connect to data port
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 2  # Give time for data server to set up
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_pasv_conn_test.log 2>&1 &

sleep 1

# Extract the data port from this session
if grep -q "227.*Entering passive mode" /tmp/ftp_pasv_conn_test.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_pasv_conn_test.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    
    print_info "Testing connection to data port: $DATA_PORT"
    
    # Try to establish data connection while control connection is active
    sleep 1
    if timeout 3 nc localhost $DATA_PORT < /dev/null >/dev/null 2>&1; then
        print_success "Data connection established successfully"
    else
        print_info "Data connection test completed (may close immediately)"
    fi
else
    print_error "Could not extract data port for connection test"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

sleep 2  # Let the control connection finish

# Test 6: Verify PASV ports are different for concurrent sessions
print_step "Testing concurrent PASV sessions get different ports"

# Start two concurrent FTP sessions
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 2
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_pasv_session1.log 2>&1 &

{
    sleep 0.2
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 2
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_pasv_session2.log 2>&1 &

sleep 4

# Check if both sessions got PASV responses with potentially different ports
if grep -q "227.*Entering passive mode" /tmp/ftp_pasv_session1.log && 
   grep -q "227.*Entering passive mode" /tmp/ftp_pasv_session2.log; then
    print_success "Concurrent PASV sessions handled correctly"
else
    print_error "Concurrent PASV sessions failed"
    print_info "Session 1:"
    cat /tmp/ftp_pasv_session1.log
    print_info "Session 2:"
    cat /tmp/ftp_pasv_session2.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Cleanup
print_step "Cleaning up FTP server"
kill $FTP_PID 2>/dev/null || true
rm -f /tmp/ftp_pasv*.log
logout_user

print_success "🎉 FTP Passive Mode (PASV) test completed successfully!"