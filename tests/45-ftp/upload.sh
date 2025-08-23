#!/bin/bash
set -e

# ===================================================================
# FTP File Upload Test
# ===================================================================
# Tests STOR command for file upload functionality
# Verifies file uploads work correctly with data connection

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

echo "=== FTP File Upload Test ==="

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
FTP_PORT=2129
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

# Create test files for upload
print_step "Creating test files for upload"
echo "This is a test file for FTP upload." > /tmp/test_upload.txt
echo '{"name": "test", "type": "json", "uploaded": true}' > /tmp/test_upload.json

# Test 1: Basic STOR command setup
print_step "Testing STOR command setup with PASV"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
} | nc localhost $FTP_PORT > /tmp/ftp_stor_setup.log 2>&1 &

sleep 2

# Extract data port from PASV response
if grep -q "227.*Entering passive mode" /tmp/ftp_stor_setup.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_stor_setup.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    print_info "Data port for STOR: $DATA_PORT"
else
    print_error "PASV setup failed for STOR test"
    cat /tmp/ftp_stor_setup.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 2: Upload text file with STOR
print_step "Testing file upload with STOR command"

# Start control connection with STOR command
{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
    echo -e "STOR test_upload.txt\r\n"
    sleep 3  # Give time for data transfer
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_stor_control.log 2>&1 &

# Send file data to data connection
sleep 1.5
cat /tmp/test_upload.txt | nc localhost $DATA_PORT >/dev/null 2>&1 &

sleep 3

# Verify STOR command responses
if grep -q "150.*Opening data connection.*test_upload.txt" /tmp/ftp_stor_control.log; then
    print_success "STOR command initiated file upload"
else
    print_error "STOR command failed to initiate upload"
    cat /tmp/ftp_stor_control.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

if grep -q "226.*Transfer complete" /tmp/ftp_stor_control.log; then
    print_success "STOR command completed successfully"
else
    print_error "STOR command did not complete properly"
    cat /tmp/ftp_stor_control.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 3: Upload JSON file
print_step "Testing JSON file upload"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
} | nc localhost $FTP_PORT > /tmp/ftp_stor_json_setup.log 2>&1 &

sleep 2

if grep -q "227.*Entering passive mode" /tmp/ftp_stor_json_setup.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_stor_json_setup.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    
    # Execute JSON upload
    {
        sleep 0.1
        echo -e "USER $TEST_TENANT_NAME\r\n"
        sleep 0.5
        echo -e "PASS $JWT_TOKEN\r\n"
        sleep 0.5
        echo -e "PASV\r\n"
        sleep 1
        echo -e "STOR test_data.json\r\n"
        sleep 3
        echo -e "QUIT\r\n"
    } | nc localhost $FTP_PORT > /tmp/ftp_stor_json_control.log 2>&1 &
    
    sleep 1.5
    cat /tmp/test_upload.json | nc localhost $DATA_PORT >/dev/null 2>&1 &
    sleep 3
    
    if grep -q "226.*Transfer complete" /tmp/ftp_stor_json_control.log; then
        print_success "JSON file upload completed"
    else
        print_error "JSON file upload failed"
        cat /tmp/ftp_stor_json_control.log
        kill $FTP_PID 2>/dev/null || true
        exit 1
    fi
else
    print_error "PASV setup failed for JSON upload"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 4: Upload larger file (test chunking)
print_step "Testing larger file upload"

# Create a larger test file (1KB)
dd if=/dev/zero bs=1024 count=1 2>/dev/null | tr '\0' 'A' > /tmp/large_upload.dat

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
} | nc localhost $FTP_PORT > /tmp/ftp_stor_large_setup.log 2>&1 &

sleep 2

if grep -q "227.*Entering passive mode" /tmp/ftp_stor_large_setup.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_stor_large_setup.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    
    {
        sleep 0.1
        echo -e "USER $TEST_TENANT_NAME\r\n"
        sleep 0.5
        echo -e "PASS $JWT_TOKEN\r\n"
        sleep 0.5
        echo -e "PASV\r\n"
        sleep 1
        echo -e "STOR large_file.dat\r\n"
        sleep 4
        echo -e "QUIT\r\n"
    } | nc localhost $FTP_PORT > /tmp/ftp_stor_large_control.log 2>&1 &
    
    sleep 1.5
    cat /tmp/large_upload.dat | nc localhost $DATA_PORT >/dev/null 2>&1 &
    sleep 4
    
    if grep -q "226.*Transfer complete" /tmp/ftp_stor_large_control.log; then
        print_success "Large file upload completed"
    else
        print_error "Large file upload failed"
        cat /tmp/ftp_stor_large_control.log
        kill $FTP_PID 2>/dev/null || true
        exit 1
    fi
else
    print_error "PASV setup failed for large file upload"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 5: STOR without PASV (should fail)
print_step "Testing STOR without PASV (should fail)"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "STOR should_fail.txt\r\n"
    sleep 1
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_stor_nopasv.log 2>&1 &

sleep 2

if grep -q "425.*Use PASV first" /tmp/ftp_stor_nopasv.log; then
    print_success "STOR properly requires PASV first"
else
    print_error "STOR without PASV not properly handled"
    cat /tmp/ftp_stor_nopasv.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 6: STOR without authentication (should fail)
print_step "Testing STOR without authentication"

{
    sleep 0.1
    echo -e "STOR unauthorized.txt\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_stor_noauth.log 2>&1 &

sleep 1

if grep -q "530.*Not logged in" /tmp/ftp_stor_noauth.log; then
    print_success "STOR properly rejected without authentication"
else
    print_error "STOR not properly protected"
    cat /tmp/ftp_stor_noauth.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 7: Test upload with immediate data connection close
print_step "Testing upload with quick data connection handling"

{
    sleep 0.1
    echo -e "USER $TEST_TENANT_NAME\r\n"
    sleep 0.5
    echo -e "PASS $JWT_TOKEN\r\n"
    sleep 0.5
    echo -e "PASV\r\n"
    sleep 1
} | nc localhost $FTP_PORT > /tmp/ftp_stor_quick_setup.log 2>&1 &

sleep 2

if grep -q "227.*Entering passive mode" /tmp/ftp_stor_quick_setup.log; then
    PASV_RESPONSE=$(grep "227.*Entering passive mode" /tmp/ftp_stor_quick_setup.log)
    DATA_PORT=$(parse_pasv_port "$PASV_RESPONSE")
    
    {
        sleep 0.1
        echo -e "USER $TEST_TENANT_NAME\r\n"
        sleep 0.5
        echo -e "PASS $JWT_TOKEN\r\n"
        sleep 0.5
        echo -e "PASV\r\n"
        sleep 1
        echo -e "STOR quick_test.txt\r\n"
        sleep 2
        echo -e "QUIT\r\n"
    } | nc localhost $FTP_PORT > /tmp/ftp_stor_quick_control.log 2>&1 &
    
    # Send short data and close quickly
    sleep 1.5
    echo "Quick test data" | nc localhost $DATA_PORT >/dev/null 2>&1 &
    sleep 2
    
    if grep -q "150.*Opening data connection" /tmp/ftp_stor_quick_control.log; then
        print_success "Quick upload data connection established"
    else
        print_error "Quick upload failed to establish connection"
        cat /tmp/ftp_stor_quick_control.log
        kill $FTP_PID 2>/dev/null || true
        exit 1
    fi
else
    print_error "PASV setup failed for quick upload test"
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Cleanup
print_step "Cleaning up FTP server and test files"
kill $FTP_PID 2>/dev/null || true
rm -f /tmp/test_upload.txt /tmp/test_upload.json /tmp/large_upload.dat
rm -f /tmp/ftp_stor*.log
logout_user

print_success "🎉 FTP file upload test completed successfully!"