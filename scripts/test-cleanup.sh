#!/usr/bin/env bash
#
# Test Database Cleanup Script
# Cleans up all test databases and tenants without running tests
# Usage: scripts/test-cleanup.sh
# Environment Variables:
#   TEST_VERBOSE: Set to "1" or "true" for detailed cleanup output messages
#

# Check TEST_VERBOSE environment variable
TEST_VERBOSE="${TEST_VERBOSE:-false}"

# Source test helper for cleanup function
source "$(dirname "${BASH_SOURCE[0]}")/../spec/test-tenant-helper.sh"

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

print_header() {
    # Always show test headers, even in non-verbose mode
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_header "Test Database Cleanup"

# Run cleanup function
if [[ "$TEST_VERBOSE" == "true" ]] || [[ "$TEST_VERBOSE" == "1" ]]; then
    cleanup_all_test_databases
    echo -e "${GREEN}✓ Test database cleanup completed!${NC}"
else
    cleanup_all_test_databases >/dev/null 2>&1
fi