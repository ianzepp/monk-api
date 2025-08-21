#!/bin/bash
set -e

# Meta CLI - Main dispatcher for metadata operations
#
# Usage: monk meta <operation> <type> [args...]
#
# Operations:
#   list <type>             List metadata objects
#   get <type> <name>       Get specific metadata object
#   create <type>           Create new metadata object from stdin
#   update <type> <name>    Update existing metadata object from stdin
#   delete <type> <name>    Delete metadata object

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions and argument helpers
source "$SCRIPT_DIR/common.sh"
source "$SCRIPT_DIR/args-helper.sh"

# Check dependencies
check_dependencies

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Usage information
show_usage() {
    cat << EOF
Usage: monk meta <operation> <type> [args...]

Metadata and schema management for the Monk API.

Operations:
  list <type>             List metadata objects
  get <type> <name>       Get specific metadata object
  create <type>           Create new metadata object from stdin (YAML/JSON)
  update <type> <name>    Update existing metadata object from stdin (YAML/JSON)
  delete <type> <name>    Delete metadata object

Types:
  schema                  Schema definitions for dynamic data models

Examples:
  monk meta list schema
  monk meta list schema -e name       # Extract just schema names
  monk meta list schema -e id         # Extract just schema IDs
  monk meta get schema task
  cat task-schema.yaml | monk meta create schema
  cat updated-schema.yaml | monk meta update schema task
  monk meta delete schema task

Flags (can be positioned anywhere):
  -e FIELD     Extract field values from results (e.g., -e name, -e id)
  -u URL       Base URL for API (default: from monk test env)
  -v           Verbose output with human-friendly messages
  -c           Count mode - return number of results for list operations
  -f FIELD     Extract field value from response (e.g., -f id, -f name)
  -x           Exit code only mode (no JSON output, just exit status)
  --format FMT Output format: json, yaml, raw, pretty (default: raw)

Output Modes:
  Default      Raw JSON response from API
  -v           Human-friendly verbose output with colored messages
  -e FIELD     Extract and return field values from list results
  -f FIELD     Extract and return just the specified field value
  -c           Return count of results (for list operations)
  -x           Exit code only (0 = success, 1 = failure)

Global Options (from monk test env):
  CLI_BASE_URL        API server URL (auto-detected from active test run)
  CLI_VERBOSE         Enable verbose output
  CLI_FORMAT          Default output format

Schema Management:
  Schemas define the structure and validation rules for dynamic data models.
  They are created in YAML format and stored in the API for runtime use.
  
  Use 'monk data' commands to work with records that conform to these schemas.
EOF
}

# Main command handling
main() {
    if [ $# -eq 0 ]; then
        show_usage
        exit 1
    fi
    
    local operation="$1"
    
    # Handle help
    case "$operation" in
        -h|--help|help)
            show_usage
            exit 0
            ;;
    esac
    
    # Currently all meta operations are schema operations
    # Dispatch to schema module
    case "$operation" in
        list|get|create|update|delete)
            exec "$SCRIPT_DIR/meta-schema.sh" "$@"
            ;;
        *)
            print_error "Unknown operation: $operation"
            print_info "Available operations: list, get, create, update, delete"
            print_info "Use 'monk meta --help' for more information"
            exit 1
            ;;
    esac
}

main "$@"