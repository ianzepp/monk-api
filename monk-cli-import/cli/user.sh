#!/bin/bash
set -e

# User Management CLI - User operations and access control
#
# Usage: monk user <command> [options]
#
# Commands:
#   list                    List all users
#   get <id>               Get specific user
#   create                 Create user from stdin
#   update <id>            Update user from stdin
#   delete <id>            Delete user
#   permissions <id>       Manage user permissions
#   roles <id>             Manage user roles

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Show usage information
show_usage() {
    cat << EOF
Usage: monk user <command> [options]

User management and access control for Monk API.

Commands:
  list                    List all users
  get <id>               Get specific user by ID
  update <id>            Update user from stdin (JSON)
  delete <id>            Delete user
  permissions <id>       Show/manage user permissions
  roles <id>             Show/manage user roles

Examples:
  monk user list
  monk user get 123e4567-e89b-12d3-a456-426614174000
  echo '{"username":"john","email":"john@example.com","role":"user"}' | monk user create
  monk user delete 123e4567-e89b-12d3-a456-426614174000
  monk user permissions 123e4567-e89b-12d3-a456-426614174000

Options:
  -v, --verbose           Show detailed information
  -h, --help              Show this help message

User Management:
  Users are managed through the Monk API user system with role-based
  access control and schema-level permissions.

Global Options (from monk test env):
  CLI_BASE_URL        API server URL
  JWT_TOKEN           Authentication token (admin required for user management)

Note: User management operations require admin-level authentication.
EOF
}

# Placeholder implementations - to be developed
cmd_list() {
    print_info "User listing functionality - to be implemented"
    # Will use: GET /api/users
}

cmd_get() {
    local user_id="$1"
    if [ -z "$user_id" ]; then
        print_error "User ID required"
        return 1
    fi
    print_info "User retrieval functionality - to be implemented"
    # Will use: GET /api/users/$user_id
}


cmd_update() {
    local user_id="$1"
    if [ -z "$user_id" ]; then
        print_error "User ID required"
        return 1
    fi
    print_info "User update functionality - to be implemented"
    # Will use: PUT /api/users/$user_id with JSON from stdin
}

cmd_delete() {
    local user_id="$1"
    if [ -z "$user_id" ]; then
        print_error "User ID required"
        return 1
    fi
    print_info "User deletion functionality - to be implemented"
    # Will use: DELETE /api/users/$user_id
}

cmd_permissions() {
    local user_id="$1"
    if [ -z "$user_id" ]; then
        print_error "User ID required"
        return 1
    fi
    print_info "User permissions management - to be implemented"
    # Will use: GET/PUT /api/users/$user_id/permissions
}

cmd_roles() {
    local user_id="$1"
    if [ -z "$user_id" ]; then
        print_error "User ID required"
        return 1
    fi
    print_info "User roles management - to be implemented"
    # Will use: GET/PUT /api/users/$user_id/roles
}

# Main command handling
main() {
    if [ $# -eq 0 ]; then
        show_usage
        return 1
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        list)
            cmd_list "$@"
            ;;
        get)
            cmd_get "$@"
            ;;
        update)
            cmd_update "$@"
            ;;
        delete)
            cmd_delete "$@"
            ;;
        permissions)
            cmd_permissions "$@"
            ;;
        roles)
            cmd_roles "$@"
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            print_info "Available commands: list, get, update, delete, permissions, roles"
            print_info "Use 'monk user --help' for more information"
            return 1
            ;;
    esac
}

main "$@"