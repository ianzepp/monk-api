#!/usr/bin/env bash
#
# Test Database Cleanup Script
# Cleans up all test databases and tenants without running tests
# Usage: scripts/test-cleanup.sh [--quiet]
#   --quiet: Suppress normal output messages
#

# Parse command line arguments
QUIET=false
for arg in "$@"; do
    if [[ "$arg" == "--quiet" ]]; then
        QUIET=true
    fi
done

# Export quiet flag for test helper functions
export TEST_QUIET="$QUIET"

# Source test helper for cleanup function
source "$(dirname "${BASH_SOURCE[0]}")/../spec/test-tenant-helper.sh"

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

print_header() {
    if [[ "$QUIET" != "true" ]]; then
        echo -e "${BLUE}=== $1 ===${NC}"
    fi
}

print_header "Test Database Cleanup"

# Run cleanup function
if [[ "$QUIET" != "true" ]]; then
    cleanup_all_test_databases
    echo -e "${GREEN}✓ Test database cleanup completed!${NC}"
else
    cleanup_all_test_databases >/dev/null 2>&1
fi