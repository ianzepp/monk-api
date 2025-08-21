#!/bin/bash
# Note: Not using 'set -e' in interactive shell to allow graceful error handling

# Interactive Shell CLI - API exploration via filesystem metaphor
#
# Usage: monk sh
#
# Description:
#   Provides an interactive shell interface that maps API endpoints to a 
#   familiar filesystem metaphor. Navigate /data for records, /meta for schemas.

# Load common monk functions
source "$(dirname "$0")/common.sh"

# Load shell-specific common functions
source "$(dirname "$0")/sh-common.sh"

# Check dependencies
check_dependencies

# Initialize shell environment
init_shell() {
    print_info "Monk Interactive Shell"
    print_info "Type 'help' for available commands, 'exit' to quit"
    echo
    
    # Check authentication status
    check_monk_auth
    echo
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
            cmd_cd "${args[@]}" || true  # Don't exit on cd errors
            ;;
        "ls"|"cat")
            # Lazy load and execute command modules
            execute_command "$cmd" "${args[@]}" || true  # Don't exit on command errors
            ;;
        "")
            # Empty command, do nothing
            ;;
        *)
            # Try to load as a command module
            if ! execute_command "$cmd" "${args[@]}"; then
                print_error "Unknown command: $cmd"
                print_info "Type 'help' for available commands"
            fi
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
    local new_path
    
    # Resolve the new path
    new_path=$(resolve_path "$target")
    
    # Validate the new path
    if validate_path "$new_path"; then
        CURRENT_DIR="$new_path"
    else
        print_error "Invalid path: $new_path"
        return 1
    fi
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