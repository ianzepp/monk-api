#!/bin/bash
set -e

# Data CLI - Main dispatcher for data operations
#
# Usage: monk data <operation> <schema> [args...]
#
# Operations:
#   list <schema>           List all records for schema
#   get <schema> <id>       Get specific record
#   create <schema>         Create new record from stdin
#   update <schema> <id>    Update record from stdin
#   delete <schema> <id>    Delete record
#   export <schema> <dir>   Export all records to directory as JSON files
#   import <schema> <dir>   Import JSON files from directory

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions and argument helpers
source "$SCRIPT_DIR/common.sh"
source "$SCRIPT_DIR/args-helper.sh"

# Check dependencies
check_dependencies

# Usage information
show_usage() {
    cat << EOF
Usage: monk data <operation> <schema> [args...]

Data operations for dynamic schemas in the Monk API.

Operations:
  list <schema>           List all records for schema (GET /api/data/<schema>)
  get <schema> <id>       Get specific record (GET /api/data/<schema>/<id>)
  create <schema>         Create new record from stdin (POST /api/data/<schema>)
  update <schema> <id>    Update record from stdin (PUT /api/data/<schema>/<id>)
  delete <schema> <id>    Delete record (DELETE /api/data/<schema>/<id>)
  export <schema> <directory>  Export all records to directory as individual JSON files
  import <schema> <directory>  Import JSON files from directory to create new records

Schemas:
  Dynamic - any schema created via 'monk meta create schema'

Examples:
  monk data list account
  monk data get account 123e4567-e89b-12d3-a456-426614174000
  echo '{"name":"John","email":"john@example.com"}' | monk data create account
  monk data delete account 123e4567-e89b-12d3-a456-426614174000
  monk data export account ./exports/
  monk data import account ./imports/
  
  # All data operations read from stdin by default:
  cat data.json | monk data create account
  echo '{"name":"Jane Doe"}' | monk data update account <id>

Flags (can be positioned anywhere):
  -l LIMIT     Query limit for list operations (default: 50) 
  -u URL       Base URL for API (default: from monk test env)
  -v           Verbose output with human-friendly messages
  -x           Exit code only mode (no JSON output, just exit status)
  -f FIELD     Extract field value from response (e.g., -f id, -f name)
  -c           Count mode - return number of results for list operations
  -e FIELD     Extract field values from list results
  --format FMT Output format: json, yaml, raw, pretty (default: raw)

Output Modes:
  Default      Raw JSON response from API
  -v           Human-friendly verbose output with colored messages
  -x           Exit code only (0 = success, 1 = failure)
  -f FIELD     Extract and return just the specified field value
  -c           Return count of results (for list operations)

Global Options (from monk test env):
  CLI_BASE_URL        API server URL (auto-detected from active test run)
  CLI_VERBOSE         Enable verbose output
  CLI_FORMAT          Default output format
  CLI_LIMIT           Default query limit
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
    
    # Dispatch to appropriate sub-command script
    case "$operation" in
        list|get|create|update|delete)
            exec "$SCRIPT_DIR/data-crud.sh" "$@"
            ;;
        export|import)
            exec "$SCRIPT_DIR/data-import-export.sh" "$@"
            ;;
        *)
            print_error "Unknown operation: $operation"
            print_info "Available operations: list, get, create, update, delete, export, import"
            print_info "Use 'monk data --help' for more information"
            exit 1
            ;;
    esac
}

main "$@"