#!/usr/bin/env bash
#
# Clean up temporary Monk test tenants and databases.
#
# This is intentionally a small wrapper around spec/test-tenant-helper.sh so
# package.json exposes the command documented in spec/README.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/../spec/test-tenant-helper.sh"

cleanup_all_test_databases
