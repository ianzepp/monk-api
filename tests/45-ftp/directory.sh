#!/bin/bash
set -e

# ===================================================================
# FTP Directory Navigation Test
# ===================================================================
# Tests PWD, CWD, and CDUP commands for directory navigation

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

echo "=== FTP Directory Navigation Test ==="

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
FTP_PORT=2126
print_step "Starting FTP server on port $FTP_PORT"
npm run ftp:start $FTP_PORT >/dev/null 2>&1 &
FTP_PID=$!
sleep 2

# Helper function for authenticated FTP session
ftp_session() {
    local commands="$1"
    local output_file="$2"
    
    {
        sleep 0.1
        echo -e "USER $TEST_TENANT_NAME\r\n"
        sleep 0.5
        echo -e "PASS $JWT_TOKEN\r\n"
        sleep 0.5
        echo "$commands"
        sleep 0.5
        echo -e "QUIT\r\n"
    } | nc localhost $FTP_PORT > "$output_file" 2>&1 &
    
    sleep 2
}

# Test 1: PWD command (Print Working Directory)
print_step "Testing PWD command"
ftp_session "PWD\r\n" "/tmp/ftp_pwd_test.log"

if grep -q "257.*\"/\".*current directory" /tmp/ftp_pwd_test.log; then
    print_success "PWD shows root directory '/'"
else
    print_error "PWD command failed"
    cat /tmp/ftp_pwd_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 2: CWD to subdirectory
print_step "Testing CWD to subdirectory"
ftp_session "CWD documents\r\nPWD\r\n" "/tmp/ftp_cwd_test.log"

if grep -q "250.*Directory changed" /tmp/ftp_cwd_test.log; then
    print_success "CWD to 'documents' successful"
else
    print_error "CWD to subdirectory failed"
    cat /tmp/ftp_cwd_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

if grep -q "257.*\"/documents\"" /tmp/ftp_cwd_test.log; then
    print_success "PWD shows current directory as '/documents'"
else
    print_error "PWD after CWD shows incorrect directory"
    cat /tmp/ftp_cwd_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 3: CWD with absolute path
print_step "Testing CWD with absolute path"
ftp_session "CWD /images\r\nPWD\r\n" "/tmp/ftp_cwd_abs_test.log"

if grep -q "250.*Directory changed" /tmp/ftp_cwd_abs_test.log; then
    print_success "CWD with absolute path successful"
else
    print_error "CWD with absolute path failed"
    cat /tmp/ftp_cwd_abs_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

if grep -q "257.*\"/images\"" /tmp/ftp_cwd_abs_test.log; then
    print_success "PWD shows absolute path directory '/images'"
else
    print_error "PWD after absolute CWD incorrect"
    cat /tmp/ftp_cwd_abs_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 4: CDUP command (Change to parent directory)
print_step "Testing CDUP command"
ftp_session "CWD /documents/subfolder\r\nCDUP\r\nPWD\r\n" "/tmp/ftp_cdup_test.log"

if grep -q "250.*Directory changed.*documents" /tmp/ftp_cdup_test.log; then
    print_success "CDUP to parent directory successful"
else
    print_error "CDUP command failed"
    cat /tmp/ftp_cdup_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 5: CDUP from root (should stay at root)
print_step "Testing CDUP from root directory"
ftp_session "CWD /\r\nCDUP\r\nPWD\r\n" "/tmp/ftp_cdup_root_test.log"

if grep -q "257.*\"/\"" /tmp/ftp_cdup_root_test.log; then
    print_success "CDUP from root stays at root"
else
    print_error "CDUP from root failed"
    cat /tmp/ftp_cdup_root_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 6: CWD with relative paths
print_step "Testing CWD with relative paths"
ftp_session "CWD documents\r\nCWD ../images\r\nPWD\r\n" "/tmp/ftp_cwd_rel_test.log"

if grep -q "257.*\"/images\"" /tmp/ftp_cwd_rel_test.log; then
    print_success "Relative path navigation works correctly"
else
    print_error "Relative path navigation failed"
    cat /tmp/ftp_cwd_rel_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 7: CWD with dots (current and parent directory)
print_step "Testing CWD with dot notation"
ftp_session "CWD documents\r\nCWD .\r\nPWD\r\nCWD ..\r\nPWD\r\n" "/tmp/ftp_cwd_dots_test.log"

# Should stay in documents after "CWD .", then go to root after "CWD .."
if grep -q "257.*\"/documents\"" /tmp/ftp_cwd_dots_test.log && grep -q "257.*\"/\"" /tmp/ftp_cwd_dots_test.log; then
    print_success "Dot notation navigation works correctly"
else
    print_error "Dot notation navigation failed"
    cat /tmp/ftp_cwd_dots_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Test 8: Test without authentication (should fail)
print_step "Testing directory commands without authentication"
{
    sleep 0.1
    echo -e "PWD\r\n"
    sleep 0.5
    echo -e "CWD documents\r\n"
    sleep 0.5
    echo -e "CDUP\r\n"
    sleep 0.5
    echo -e "QUIT\r\n"
} | nc localhost $FTP_PORT > /tmp/ftp_noauth_dir_test.log 2>&1 &

sleep 2

if grep -q "530.*Not logged in" /tmp/ftp_noauth_dir_test.log; then
    print_success "Directory commands properly rejected without authentication"
else
    print_error "Directory commands not properly protected"
    cat /tmp/ftp_noauth_dir_test.log
    kill $FTP_PID 2>/dev/null || true
    exit 1
fi

# Cleanup
print_step "Cleaning up FTP server"
kill $FTP_PID 2>/dev/null || true
rm -f /tmp/ftp_*_test.log
logout_user

print_success "🎉 FTP directory navigation test completed successfully!"