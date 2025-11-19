#!/usr/bin/env bash
#
# Test Server Cleanup Script
#
# Kills all node servers running on port 9002
#

set -euo pipefail

# Colors for output
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Kill all servers on port 9002
if lsof -ti:9002 >/dev/null 2>&1; then
    lsof -ti:9002 | xargs kill -9 2>/dev/null || true
    print_success "Killed all servers on port 9002"
else
    print_warn "No servers found on port 9002"
fi
