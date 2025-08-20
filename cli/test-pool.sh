#!/bin/bash
set -e

# Test Pool Management - Database pool operations

# Load common functions
source "$(dirname "$0")/common.sh"

# Test configuration
DB_POOL_MANAGER="../monk-api-test/scripts/db-pool-manager.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_header() { echo -e "\n${YELLOW}=== $1 ===${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Manage database pool
manage_pool() {
    local operation="$1"
    
    if [ ! -x "$DB_POOL_MANAGER" ]; then
        print_error "Database pool manager not found: $DB_POOL_MANAGER"
        print_info "Make sure monk-api-test is set up correctly"
        return 1
    fi
    
    case "$operation" in
        status)
            print_header "Database Pool Status"
            "$DB_POOL_MANAGER" status
            ;;
        list)
            print_header "Active Test Databases"
            "$DB_POOL_MANAGER" list
            ;;
        cleanup)
            print_header "Database Pool Cleanup"
            "$DB_POOL_MANAGER" cleanup-old
            ;;
        cleanup-all)
            print_header "Database Pool Full Cleanup"
            print_info "This will remove ALL test databases"
            "$DB_POOL_MANAGER" cleanup-all
            ;;
        *)
            print_error "Unknown pool operation: $operation"
            print_info "Available operations: status, list, cleanup, cleanup-all"
            return 1
            ;;
    esac
}

# Main entry point
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    manage_pool "$@"
fi