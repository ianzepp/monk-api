#!/bin/bash
set -e

# Command Availability Test
# Verifies that all required shell commands are installed and executable
# This test should run first to catch missing dependencies early
#
# NOTE: This is a standalone prerequisites test that does not require:
# - API server to be running
# - Database connections
# - TEST_TENANT_NAME environment variable
# - Authentication setup

echo "=== Command Availability Test ==="
echo "Verifying all required shell commands are available and executable"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Track test results
failed_commands=()
missing_commands=()
passed_commands=()

# Test if a command exists and is executable
test_command() {
    local cmd="$1"
    local description="$2"
    local required="${3:-true}"
    
    print_step "Testing: $cmd ($description)"
    
    if command -v "$cmd" >/dev/null 2>&1; then
        # Command exists, test if it's executable
        if [ -x "$(command -v "$cmd")" ]; then
            print_success "$cmd is available and executable"
            passed_commands+=("$cmd")
        else
            print_error "$cmd is found but not executable"
            failed_commands+=("$cmd")
        fi
    else
        if [ "$required" = "true" ]; then
            print_error "$cmd is not installed or not in PATH"
            missing_commands+=("$cmd")
        else
            print_warning "$cmd is not available (optional)"
        fi
    fi
    
    echo
}

# Test if a command works with a basic invocation
test_command_works() {
    local cmd="$1" 
    local test_args="$2"
    local description="$3"
    
    print_step "Functional test: $cmd $test_args ($description)"
    
    if command -v "$cmd" >/dev/null 2>&1; then
        if eval "$cmd $test_args" >/dev/null 2>&1; then
            print_success "$cmd works correctly"
        else
            print_error "$cmd exists but failed functional test"
            failed_commands+=("$cmd-functional")
        fi
    else
        print_error "$cmd not available for functional test"
    fi
    
    echo
}

echo "🔍 Testing Core System Commands..."
echo

# Core shell and system commands
test_command "bash" "Bash shell (required for all tests)" 
test_command "which" "Command location utility"
test_command "grep" "Pattern searching utility"
test_command "sed" "Stream editor utility"
test_command "awk" "Text processing utility"
test_command "cut" "Text column extraction"
test_command "sort" "Text sorting utility"
test_command "uniq" "Remove duplicate lines"
test_command "wc" "Word/line/character counting"
test_command "tr" "Character translation utility"

echo "🗄️ Testing Database Commands..."
echo

# Database commands
test_command "psql" "PostgreSQL client (required for database tests)"
test_command "createdb" "PostgreSQL database creation utility"
test_command "dropdb" "PostgreSQL database deletion utility"
test_command "pg_dump" "PostgreSQL backup utility" "false"

echo "🌐 Testing Network and API Commands..."
echo

# Network and API commands  
test_command "curl" "HTTP client (required for API tests)"
test_command "wget" "Web content retrieval" "false"
test_command "nc" "Network connectivity testing" "false"

echo "📋 Testing Data Processing Commands..."
echo

# JSON and data processing
test_command "jq" "JSON processor (required for configuration tests)"

echo "🔧 Testing Development Tools..."
echo

# Development and build tools
test_command "node" "Node.js runtime (required for application)"
test_command "npm" "Node.js package manager (required for build)"
test_command "git" "Version control system"
test_command "tsx" "TypeScript execution utility (required for fixtures)" "false"

echo "🏗️ Testing Monk CLI Availability..."
echo

# Monk CLI (external tool, may not be installed)
test_command "monk" "Monk CLI tool (external dependency)" "false"

echo "🧪 Testing Functional Command Operation..."
echo

# Functional tests for critical commands
test_command_works "jq" "--version" "JSON processor version check"
test_command_works "curl" "--version" "HTTP client version check"  
test_command_works "psql" "--version" "PostgreSQL client version check"
test_command_works "node" "--version" "Node.js runtime version check"
test_command_works "npm" "--version" "NPM package manager version check"

# If monk is available, test it
if command -v monk >/dev/null 2>&1; then
    test_command_works "monk" "--version" "Monk CLI version check"
fi

echo "📊 Test Results Summary"
echo "====================="

total_tested=$((${#passed_commands[@]} + ${#failed_commands[@]} + ${#missing_commands[@]}))
echo "Total commands tested: $total_tested"
echo -e "✅ Passed: ${GREEN}${#passed_commands[@]}${NC}"
echo -e "❌ Failed: ${RED}${#failed_commands[@]}${NC}"  
echo -e "🚫 Missing: ${RED}${#missing_commands[@]}${NC}"

# Show details if there are issues
if [ ${#missing_commands[@]} -gt 0 ]; then
    echo
    print_error "Missing required commands:"
    for cmd in "${missing_commands[@]}"; do
        echo "  - $cmd"
    done
fi

if [ ${#failed_commands[@]} -gt 0 ]; then
    echo
    print_error "Failed command tests:"
    for cmd in "${failed_commands[@]}"; do
        echo "  - $cmd"
    done
fi

echo
echo "💡 Installation Notes:"
echo "====================="

# Check for common missing commands and provide installation hints
if [[ " ${missing_commands[*]} " =~ " jq " ]]; then
    echo "📦 To install jq:"
    echo "   Ubuntu/Debian: sudo apt-get install jq"
    echo "   macOS: brew install jq"
    echo "   CentOS/RHEL: sudo yum install jq"
fi

if [[ " ${missing_commands[*]} " =~ " psql " ]]; then
    echo "📦 To install PostgreSQL client:"
    echo "   Ubuntu/Debian: sudo apt-get install postgresql-client"
    echo "   macOS: brew install postgresql"
    echo "   CentOS/RHEL: sudo yum install postgresql"
fi

if [[ " ${missing_commands[*]} " =~ " curl " ]]; then
    echo "📦 To install curl:"
    echo "   Ubuntu/Debian: sudo apt-get install curl"
    echo "   macOS: curl is usually pre-installed"
    echo "   CentOS/RHEL: sudo yum install curl"
fi

if [[ " ${missing_commands[*]} " =~ " monk " ]]; then
    echo "📦 To install Monk CLI:"
    echo "   Clone: git clone https://github.com/ianzepp/monk-cli.git"
    echo "   Install: cd monk-cli && ./install.sh"
fi

echo
echo "🔍 Environment Information:"
echo "=========================="
echo "Shell: $SHELL"
echo "PATH: $PATH"
echo "User: $(whoami)"
echo "Working Directory: $(pwd)"

# Final exit status
if [ ${#missing_commands[@]} -gt 0 ] || [ ${#failed_commands[@]} -gt 0 ]; then
    echo
    print_error "Command availability test FAILED"
    print_info "Some required commands are missing or not functional"
    print_info "Please install missing dependencies before running other tests"
    exit 1
else
    echo
    print_success "All command availability tests PASSED"
    print_info "All required commands are available and functional"
    print_info "Environment is ready for running monk-api tests"
    exit 0
fi