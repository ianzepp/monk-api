#!/bin/bash
set -e

# Interactive Shell CLI - API exploration via filesystem metaphor
#
# Usage: monk sh
#
# Description:
#   Provides an interactive shell interface that maps API endpoints to a 
#   familiar filesystem metaphor. Navigate /data for records, /meta for schemas.

# Load common functions
source "$(dirname "$0")/common.sh"

# Check dependencies
check_dependencies

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_prompt() { echo -ne "${CYAN}monk:${1}${NC}$ "; }

# Global shell state
CURRENT_DIR="/"
SHELL_RUNNING=true

# Initialize shell environment
init_shell() {
    print_info "Monk Interactive Shell"
    print_info "Type 'help' for available commands, 'exit' to quit"
    echo
    
    # Check authentication status
    if ! monk auth status >/dev/null 2>&1; then
        print_warning "Not authenticated. Some features may be limited."
        print_info "Run 'monk auth login' to authenticate"
        echo
    fi
}

# Main REPL loop
run_shell() {
    init_shell
    
    while $SHELL_RUNNING; do
        # Read command with readline support
        print_prompt "$CURRENT_DIR"
        read -e -r input
        
        # Add to history if not empty
        if [[ -n "$input" && "$input" != " "* ]]; then
            history -s "$input"
        fi
        
        # Parse and execute command
        if [[ -n "$input" ]]; then
            parse_and_execute "$input"
        fi
    done
}

# Parse command line and execute
parse_and_execute() {
    local input="$1"
    
    # Tokenize input (basic whitespace splitting for now)
    read -ra tokens <<< "$input"
    local cmd="${tokens[0]}"
    local args=("${tokens[@]:1}")
    
    # Execute command
    case "$cmd" in
        "help")
            show_help
            ;;
        "exit"|"quit")
            exit_shell
            ;;
        "pwd")
            cmd_pwd
            ;;
        "cd")
            cmd_cd "${args[@]}"
            ;;
        "ls")
            cmd_ls "${args[@]}"
            ;;
        "cat")
            cmd_cat "${args[@]}"
            ;;
        "")
            # Empty command, do nothing
            ;;
        *)
            print_error "Unknown command: $cmd"
            print_info "Type 'help' for available commands"
            ;;
    esac
}

# Show help
show_help() {
    echo "Available commands:"
    echo
    echo "  Navigation:"
    echo "    pwd                    Show current directory"
    echo "    cd <path>              Change directory"
    echo "    ls [options]           List directory contents"
    echo "    cat <file>             Display file contents"
    echo
    echo "  Shell:"
    echo "    help                   Show this help"
    echo "    exit, quit             Exit shell"
    echo
    echo "  Directory Structure:"
    echo "    /data/<schema>         Data records (JSON format)"
    echo "    /meta/schema           Schema definitions (YAML format)"
    echo
}

# Exit shell
exit_shell() {
    print_info "Goodbye!"
    SHELL_RUNNING=false
}

# pwd command
cmd_pwd() {
    echo "$CURRENT_DIR"
}

# cd command
cmd_cd() {
    local target="${1:-/}"
    
    # Handle relative and absolute paths
    if [[ "$target" == "." ]]; then
        # Stay in current directory
        return 0
    elif [[ "$target" == ".." ]]; then
        # Go up one directory
        if [[ "$CURRENT_DIR" == "/" ]]; then
            # Already at root
            return 0
        else
            # Remove last component
            CURRENT_DIR=$(dirname "$CURRENT_DIR")
            [[ "$CURRENT_DIR" == "." ]] && CURRENT_DIR="/"
        fi
    elif [[ "$target" == "/"* ]]; then
        # Absolute path
        CURRENT_DIR="$target"
    else
        # Relative path
        if [[ "$CURRENT_DIR" == "/" ]]; then
            CURRENT_DIR="/$target"
        else
            CURRENT_DIR="$CURRENT_DIR/$target"
        fi
    fi
    
    # Normalize path (remove double slashes, etc.)
    CURRENT_DIR=$(echo "$CURRENT_DIR" | sed 's|//*|/|g' | sed 's|/$||')
    [[ -z "$CURRENT_DIR" ]] && CURRENT_DIR="/"
    
    # Basic path validation (more detailed validation will come later)
    if ! validate_path "$CURRENT_DIR"; then
        print_error "Invalid path: $CURRENT_DIR"
        CURRENT_DIR="/"
        return 1
    fi
}

# ls command (stub for now)
cmd_ls() {
    print_info "Listing contents of: $CURRENT_DIR"
    
    case "$CURRENT_DIR" in
        "/")
            echo "data/"
            echo "meta/"
            ;;
        "/data")
            print_info "Available schemas would be listed here"
            echo "users/"
            echo "tasks/"
            ;;
        "/meta")
            echo "schema/"
            ;;
        "/meta/schema")
            print_info "Available schemas would be listed here"
            echo "users"
            echo "tasks"
            ;;
        *)
            print_warning "Directory listing not yet implemented for: $CURRENT_DIR"
            ;;
    esac
}

# cat command (stub for now)
cmd_cat() {
    local file="$1"
    
    if [[ -z "$file" ]]; then
        print_error "cat: missing file argument"
        return 1
    fi
    
    print_info "Would display contents of: $CURRENT_DIR/$file"
    print_warning "File display not yet implemented"
}

# Basic path validation
validate_path() {
    local path="$1"
    
    # Must start with /
    if [[ ! "$path" == "/"* ]]; then
        return 1
    fi
    
    # No .. components for now (basic security)
    if [[ "$path" == *".."* ]]; then
        return 1
    fi
    
    return 0
}

# Handle script arguments
if [[ $# -eq 0 ]]; then
    # No arguments, start interactive shell
    run_shell
else
    print_error "Interactive shell does not accept arguments"
    print_info "Usage: monk sh"
    exit 1
fi