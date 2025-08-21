#!/bin/bash
set -e

# Test Management CLI - Main dispatcher for test operations
#
# Usage: monk test <command> [options]
#
# Commands:
#   all [pattern]           Run tests (all if no pattern, or matching pattern)
#   run <operation>         Manage test run environments
#   pool <operation>        Manage database pool
#   env [var_name]          Show test environment variables
#   diff <run1> <run2>      Compare test results between environments
#
# Test Pattern Examples:
#   monk test all            # Run all tests in numerical order
#   monk test all 00         # Run all tests in 00-* directories
#   monk test all 00-49      # Run tests in ranges 00 through 49
#   monk test all meta-api   # Run all tests matching *meta-api*
#   monk test all connection # Run all tests matching *connection*
#
# Test Run Examples:
#   monk test run main                    # Test current main branch HEAD
#   monk test run main abc123             # Test specific commit abc123
#   monk test run feature/API-281         # Test feature branch HEAD
#   monk test run feature/API-281 --clean # Force fresh build
#   monk test run list                    # List all test environments
#   monk test run delete main-abc123      # Clean up test environment
#
# Comparison Examples:
#   monk test diff main feature/API-281   # Compare two versions
#   monk test diff main-abc123 main-def456  # Compare specific commits

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

print_error() { echo -e "${RED}✗ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Show usage information
show_usage() {
    cat << EOF
Usage: monk test <command> [options]

Test management and execution for Monk API test suite.

Commands:
  all [pattern]           Run tests (all if no pattern, or matching pattern)
  preview [pattern]       Show tests that would be run without executing them
  list                    List all test run environments with status
  git <branch> [commit]   Create/update test environment for git reference
  current                 Show current active test run environment
  use <name>              Switch to test run environment
  delete <name>           Delete test run environment and cleanup resources
  env [var_name]          Show test environment variables
  diff <run1> <run2>      Compare test results between environments

Test Patterns (for 'all' command):
  (no pattern)            Run all tests in numerical order (00-99)
  00                      Run all tests in 00-* directories
  00-49                   Run tests in ranges 00 through 49
  meta-api                Run all tests with 'meta-api' in path/name
  connection              Run all tests with 'connection' in path/name
  lifecycle               Run all tests with 'lifecycle' in path/name

Test Run Operations:
  git <branch> [commit]   Create/update test environment for git reference
  list                    List all test run environments  
  current                 Show current active test run
  use <name>              Switch to test run environment
  delete <name>           Delete test run environment


Environment Variables:
  (no var_name)           Show all test environment variables
  CLI_BASE_URL            Show API server URL
  JWT_TOKEN               Show current JWT token
  DATABASE_URL            Show database connection URL
  TEST_DATABASE           Show current test database name
  GIT_BRANCH              Show git branch for active test run
  GIT_COMMIT              Show git commit for active test run

Examples:
  monk test all                    # Run complete test suite
  monk test all 00                 # Run setup tests only
  monk test all 10-29              # Run connection and meta API tests
  monk test all meta-api           # Run all meta API related tests
  monk test preview                # Show all available tests
  monk test preview 10-20          # Show tests matching pattern 10-20
  monk test preview meta-api       # Show tests matching 'meta-api'
  monk test git main               # Test current main branch HEAD
  monk test git main abc123        # Test specific commit abc123
  monk test git feature/API-281    # Test feature branch HEAD
  monk test list                   # List all test environments
  monk test current                # Show active test environment
  monk test use main-abc123        # Switch to test environment
  monk test delete old-feature     # Delete test environment
  monk test diff main-abc123 feature-def456  # Compare test environments
  monk test env                    # Show current environment variables

Options:
  -v, --verbose           Show detailed test output
  -h, --help              Show this help message

Test Directory Structure:
  00-09: Setup and infrastructure tests
  10-19: Connection and authentication tests  
  20-29: Meta API tests
  30-39: Data API tests
  50-59: Integration tests
  60-69: Lifecycle tests
  70-79: Validation tests
  90-99: Error handling tests
EOF
}

# Main command handling
main() {
    if [ $# -eq 0 ]; then
        show_usage
        return 1
    fi
    
    local command="$1"
    shift
    
    # Handle help for specific commands first
    if [ "$command" = "git" ] && ([ "$1" = "-h" ] || [ "$1" = "--help" ]); then
        exec "$(dirname "$0")/test-run.sh" "$@"
        return 0
    fi
    
    # Parse global options
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                export CLI_VERBOSE=true
                shift
                ;;
            -h|--help)
                show_usage
                return 0
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                return 1
                ;;
            *)
                # Put the argument back for command processing
                set -- "$1" "$@"
                break
                ;;
        esac
    done
    
    # Dispatch to appropriate sub-command script
    case "$command" in
        all)
            exec "$(dirname "$0")/test-all.sh" "$@"
            ;;
        preview)
            exec "$(dirname "$0")/test-preview.sh" "$@"
            ;;
        list)
            exec "$(dirname "$0")/test-run.sh" list "$@"
            ;;
        git)
            # For git command, pass branch directly to create_or_update_test_run
            exec "$(dirname "$0")/test-run.sh" create "$@"
            ;;
        current)
            exec "$(dirname "$0")/test-run.sh" current "$@"
            ;;
        use)
            exec "$(dirname "$0")/test-env.sh" use "$@"
            ;;
        delete)
            exec "$(dirname "$0")/test-run.sh" delete "$@"
            ;;
        env)
            exec "$(dirname "$0")/test-env.sh" "$@"
            ;;
        diff)
            exec "$(dirname "$0")/test-diff.sh" "$@"
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            print_info "Available commands: all, preview, list, git, current, use, delete, env, diff"
            print_info "Use 'monk test --help' for more information"
            return 1
            ;;
    esac
}

main "$@"