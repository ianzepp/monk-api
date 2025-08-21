#!/bin/bash

# Simple argument parsing helper using built-in getopts
# Source this file: source cli/args-helper.sh

# Parse common flags with short options only
parse_common_flags() {
    local OPTIND
    while getopts "f:l:u:vh" opt; do
        case $opt in
            f) export CLI_FORMAT="$OPTARG" ;;
            l) export CLI_LIMIT="$OPTARG" ;;
            u) export CLI_BASE_URL="$OPTARG" ;;
            v) export CLI_VERBOSE=true ;;
            h) return 1 ;; # Signal caller to show help
            *) 
                echo "Invalid option: -$OPTARG" >&2
                return 2
                ;;
        esac
    done
    
    shift $((OPTIND-1))
    printf '%s\n' "$@"
    return 0
}

# Enhanced argument parser with subcommands
parse_args() {
    local cmd_name="$1"
    shift
    
    # Parse global flags and get remaining arguments
    local remaining_args
    remaining_args=$(parse_common_flags "$@")
    local parse_status=$?
    
    if [ $parse_status -eq 1 ]; then
        show_help "$cmd_name"
        exit 0
    elif [ $parse_status -ne 0 ]; then
        exit 1
    fi
    
    # Return remaining arguments
    echo "$remaining_args"
}

# Show simple help
show_help() {
    local cmd_name="$1"
    cat << EOF
$cmd_name - Simple CLI with short options

Common Flags:
  -f FORMAT    Output format: pretty, raw (default: pretty)
  -l LIMIT     Query limit for list operations (default: 50) 
  -u URL       Base URL for API (default: http://localhost:3001)
  -v           Verbose output
  -h           Show this help

Environment Variables:
  CLI_FORMAT     Same as -f flag
  CLI_LIMIT      Same as -l flag  
  CLI_BASE_URL   Same as -u flag
  CLI_VERBOSE    Same as -v flag

Examples:
  $cmd_name -f raw data list account
  $cmd_name -l 10 data list account
  $cmd_name -u http://localhost:3000 data get account 123
  $cmd_name -v data create account < data.json
EOF
}

# Verbose logging helper
log_verbose() {
    if [ "$CLI_VERBOSE" = "true" ]; then
        echo "🔍 $*" >&2
    fi
}