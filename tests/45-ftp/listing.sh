#!/bin/bash
set -e

# ===================================================================
# FTP File Listing and Download Test
# ===================================================================
# Tests LIST and RETR commands for file operations
# Verifies directory listings and file downloads work correctly

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

echo "=== FTP File Listing and Download Test ==="

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
FTP_PORT=2128
print_step "Starting FTP server on port $FTP_PORT"
npm run ftp:start $FTP_PORT >/dev/null 2>&1 &
FTP_PID=$!
sleep 2

# Helper function to parse PASV response and get data port
parse_pasv_port() {
    local pasv_response="$1"
    local port_info=$(echo "$pasv_response" | grep -o '([0-9,]*)')
    if [ -z "$port_info" ]; then
        return 1
    fi
    
    local p1=$(echo "$port_info" | cut -d',' -f5 | tr -d '()')
    local p2=$(echo "$port_info" | cut -d',' -f6 | tr -d '()')
    echo $((p1 * 256 + p2))
}

# Test 1: LIST command with PASV
print_step "Testing LIST command with directory listing"

# Create a control connection and get data connection details
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
} | nc localhost $FTP_PORT > /tmp/ftp_list_setup.log 2>&1 &

sleep 2

# Extract data port from PASV response
if grep -q "227.*Entering passive mode" /tmp/ftp_list_setup.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_list_setup.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    print_info "Data port for LIST: $DATA_PORT"
else
    print_error "PASV setup failed for LIST test"
    cat /tmp/ftp_list_setup.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Now perform LIST operation
print_step "Executing LIST command and capturing directory data"

# Start control connection with LIST command
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
    echo -e "LIST\r\n"
    sleep 2
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_list_control.log 2>&1 &

# Capture data from data connection
sleep 1.5
timeout 5 nc localhost $DATA_PORT > /tmp/ftp_list_data.log 2>&1 || true

sleep 2

# Verify LIST command responses
if grep -q "150.*Opening data connection" /tmp/ftp_list_control.log; then
    print_success "LIST command initiated data transfer"
else
    print_error "LIST command failed to initiate transfer"
    cat /tmp/ftp_list_control.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

if grep -q "226.*Directory listing completed" /tmp/ftp_list_control.log; then
    print_success "LIST command completed successfully"
else
    print_error "LIST command did not complete properly"
    cat /tmp/ftp_list_control.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Verify directory listing data was received
if [ -s /tmp/ftp_list_data.log ]; then
    print_success "Directory listing data received"
    print_info "Listing content (first 3 lines):"
    head -3 /tmp/ftp_list_data.log | sed 's/^/  /'
    
    # Check for expected directory entries
    if grep -q "documents" /tmp/ftp_list_data.log && 
       grep -q "images" /tmp/ftp_list_data.log; then
        print_success "Expected directories found in listing"
    else
        print_error "Expected directories not found in listing"
        cat /tmp/ftp_list_data.log
        kill $FTP_PID 2>/dev/null || true
        exit 1
    fi
else
    print_error "No directory listing data received"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 2: RETR command (file download)
print_step "Testing RETR command for file download"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
} | nc localhost $FTP_PORT > /tmp/ftp_retr_setup.log 2>&1 &

sleep 2

# Extract data port for RETR
if grep -q "227.*Entering passive mode" /tmp/ftp_retr_setup.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_retr_setup.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    print_info "Data port for RETR: $DATA_PORT"
else
    print_error "PASV setup failed for RETR test"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Execute RETR command
print_step "Downloading file with RETR command"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
    echo -e "RETR readme.txt\r\n"
    sleep 2
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_retr_control.log 2>&1 &

# Capture downloaded file data
sleep 1.5
timeout 5 nc localhost $DATA_PORT > /tmp/ftp_retr_data.log 2>&1 || true

sleep 2

# Verify RETR command responses
if grep -q "150.*Opening data connection.*readme.txt" /tmp/ftp_retr_control.log; then
    print_success "RETR command initiated file transfer"
else
    print_error "RETR command failed to initiate transfer"
    cat /tmp/ftp_retr_control.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

if grep -q "226.*Transfer complete" /tmp/ftp_retr_control.log; then
    print_success "RETR command completed successfully"
else
    print_error "RETR command did not complete properly"
    cat /tmp/ftp_retr_control.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Verify file content was received
if [ -s /tmp/ftp_retr_data.log ]; then
    FILE_SIZE=$(wc -c < /tmp/ftp_retr_data.log)
    print_success "File data received ($FILE_SIZE bytes)"
    print_info "File content preview:"
    head -2 /tmp/ftp_retr_data.log | sed 's/^/  /'
    
    # The minimal server returns exactly 100 bytes for all files
    if [ "$FILE_SIZE" -eq 100 ]; then
        print_success "File size matches expected 100 bytes"
    else
        print_info "File size is $FILE_SIZE bytes (may vary)"
    fi
else
    print_error "No file data received"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 3: LIST without PASV (should fail)
print_step "Testing LIST without PASV (should fail)"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "LIST\r\n"
    sleep 1
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_list_nopasv.log 2>&1 &

sleep 2

if grep -q "425.*Use PASV first" /tmp/ftp_list_nopasv.log; then
    print_success "LIST properly requires PASV first"
else
    print_error "LIST without PASV not properly handled"
    cat /tmp/ftp_list_nopasv.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 4: RETR without PASV (should fail)
print_step "Testing RETR without PASV (should fail)"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "RETR readme.txt\r\n"
    sleep 1
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_retr_nopasv.log 2>&1 &

sleep 2

if grep -q "425.*Use PASV first" /tmp/ftp_retr_nopasv.log; then
    print_success "RETR properly requires PASV first"
else
    print_error "RETR without PASV not properly handled"
    cat /tmp/ftp_retr_nopasv.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 5: LIST and RETR without authentication (should fail)
print_step "Testing LIST/RETR without authentication"

{
    sleep 0.1
    echo -e "LIST\r\n"
    sleep 0.5
    echo -e "RETR readme.txt\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_noauth_files.log 2>&1 &

sleep 1

if grep -q "530.*Not logged in" /tmp/ftp_noauth_files.log; then
    print_success "File operations properly rejected without authentication"
else
    print_error "File operations not properly protected"
    cat /tmp/ftp_noauth_files.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Cleanup
print_step "Cleaning up FTP server"
kill $FTP_PID 2>/dev/null || true
rm -f /tmp/ftp_list*.log /tmp/ftp_retr*.log /tmp/ftp_noauth*.log
logout_user

print_success "🎉 FTP file listing and download test completed successfully!"