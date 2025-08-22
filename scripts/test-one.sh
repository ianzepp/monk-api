#!/bin/bash
set -e

# Single test runner script for Monk API project
# Extracted from monk CLI test_one_command for project-local usage
#
# Usage: scripts/test-one.sh <test-file>
# 
# Examples:
#   scripts/test-one.sh tests/05-infrastructure/servers-config-test.sh
#   scripts/test-one.sh tests/20-meta-api/basic-meta-endpoints.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Parse command line arguments
test_file=""
clean_mode=false

while [ $# -gt 0 ]; do
    case $1 in
        --clean)
            clean_mode=true
            shift
            ;;
        --verbose)
            export CLI_VERBOSE=true
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            echo "Usage: $0 <test-file> [--clean] [--verbose]"
            exit 1
            ;;
        *)
            test_file="$1"
            shift
            ;;
    esac
done

if [ -z "$test_file" ]; then
    print_error "Test file required"
    echo "Usage: $0 <test-file> [--clean] [--verbose]"
    echo ""
    echo "Examples:"
    echo "  $0 tests/05-infrastructure/servers-config-test.sh"
    echo "  $0 tests/20-meta-api/basic-meta-endpoints.sh --clean"
    exit 1
fi

# Check if test file exists
if [ ! -f "$test_file" ]; then
    print_error "Test file not found: $test_file"
    exit 1
fi

# Check if test file is executable
if [ ! -x "$test_file" ]; then
    print_error "Test file not executable: $test_file"
    print_info "Run: chmod +x $test_file"
    exit 1
fi

# Get test info
test_name=$(basename "$test_file" .sh)
test_dir=$(dirname "$test_file")

print_info "Running single test: $test_name"
echo

# Handle clean environment setup
if [ "$clean_mode" = true ]; then
    echo "=== Clean Environment Setup ==="
    
    # 1. Get git context for tenant naming
    if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
        git_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
        git_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        # Clean branch name for database naming (replace invalid chars)
        clean_branch=$(echo "$git_branch" | sed 's/[^a-zA-Z0-9._-]/_/g')
        tenant_name="$clean_branch"
        test_suffix="$git_commit"
    else
        # Fallback if not in git repository
        tenant_name="monk_test_clean"
        test_suffix="$(date +%s)"
    fi
    
    print_info "Creating fresh tenant: $tenant_name (test: $test_suffix)"
    
    if command -v monk >/dev/null 2>&1; then
        if monk tenant create "$tenant_name" "$test_suffix" >/dev/null 2>&1; then
            print_success "Tenant created: $tenant_name"
        else
            print_error "Failed to create tenant: $tenant_name"
            exit 1
        fi
        
        # 2. Authenticate with new tenant (use full database name)
        full_tenant_name="${tenant_name}_${test_suffix}"
        print_info "Authenticating with tenant: $full_tenant_name"
        if monk auth login --domain "$full_tenant_name" >/dev/null 2>&1; then
            print_success "Authentication successful"
        else
            print_error "Authentication failed"
            exit 1
        fi
    else
        print_error "monk CLI not available for clean environment setup"
        exit 1
    fi
    
    echo "========================"
    echo
fi

# Show test environment information
if [ -f "scripts/test-info.sh" ] && [ -x "scripts/test-info.sh" ]; then
    echo "=== Test Environment ==="
    ./scripts/test-info.sh
    echo "========================"
    echo
fi

# Run the test
start_time=$(date +%s)

# Change to test directory and run the test
if (cd "$test_dir" && "./$(basename "$test_file")"); then
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo
    print_success "Test passed: $test_name (${duration}s)"
    exit 0
else
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    echo
    print_error "Test failed: $test_name (${duration}s)"
    exit 1
fi