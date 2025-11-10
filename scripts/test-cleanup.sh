#!/usr/bin/env bash
#
# Test Database Cleanup Script
# Cleans up all test databases and tenants without running tests
#

# Source test helper for cleanup function
source "$(dirname "${BASH_SOURCE[0]}")/../spec/test-tenant-helper.sh"

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_header "Test Database Cleanup"

# Run the cleanup function
cleanup_all_test_databases

echo -e "${GREEN}✓ Test database cleanup completed!${NC}"