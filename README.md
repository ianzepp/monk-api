# Monk CLI

Command-line interface for PaaS backend operations. Provides comprehensive access to data management, schema operations, testing frameworks, and deployment management.

## Installation

```bash
# Install globally
npm install -g .

# Or use directly
./monk --help
```

## Overview

Monk CLI is a multi-module command-line tool for managing modern PaaS backend systems. It includes modules for data operations, authentication, testing, database pool management, and remote server management.

---

## Complete Command Reference

### Main Command

```
Usage: monk <module> <operation> [args...]

Monk CLI - Command-line interface for PaaS Backend API

MODULES:

  auth                    Authentication and token management
    login --domain <name>   Authenticate with database domain
    logout                  Clear stored JWT token
    status                  Show authentication status
    token                   Display current JWT token

  data                    Data operations on dynamic schemas
    list <schema>           List all records for schema
    get <schema> <id>       Get specific record
    create <schema>         Create record from stdin
    update <schema> <id>    Update record from stdin
    delete <schema> <id>    Delete record
    export <schema> <dir>   Export records to JSON files
    import <schema> <dir>   Import JSON files as records

  meta                    Schema and metadata management
    list schema             List all schemas
    get schema <name>       Get specific schema
    create schema           Create schema from stdin (YAML/JSON)
    update schema <name>    Update schema from stdin
    delete schema <name>    Delete schema

  find                    Advanced search with filter DSL
    <schema> [filters]      Search records with JSON filter criteria

  ping                    Server connectivity testing
    [options]               Test API server connectivity
    -v                      Verbose server information
    -j <token>              Include JWT token in request

  hono                    Local development server management
    start [port]            Start Hono server (default port 3000)
    stop                    Stop the server
    restart [port]          Restart the server
    status                  Check server status
    list                    List all Hono processes
    kill [pid]              Force kill processes

  test                    Comprehensive test management
    all [pattern]           Run tests (all or pattern matching)
    git <branch> [commit]   Create/update git-aware test environment
    diff <run1> <run2>      Compare test results between environments
    env [var_name]          Show test environment variables

  pool                    Database pool management
    status                  Show database pool status (X/10)
    list                    List all active test databases
    cleanup [hours]         Clean up old databases (default: 24h+)
    cleanup-all             Clean up all databases

  servers                 Remote server management
    add <name> <endpoint>   Register remote server
    list                    List all servers with health status
    current                 Show currently selected server
    use <name>              Switch to server (sets CLI_BASE_URL)
    delete <name>           Remove server from registry
    ping <name>             Health check specific server

EXAMPLES:

  # Basic workflow
  monk hono start                     # Start local server
  monk auth login --domain my_test_db # Authenticate
  monk meta list schema               # List schemas
  monk data list account              # List account records

  # Test management workflow
  monk test git main                  # Test current main branch
  monk test git feature/API-281       # Test feature branch
  monk test diff main-abc123 feature-def456 # Compare test environments
  monk test all 00-20                 # Run specific test ranges

  # Database pool workflow
  monk pool status                    # Check pool usage (X/10)
  monk pool list                      # List all test databases
  monk pool cleanup                   # Clean up old databases
  monk pool cleanup 48                # Clean up databases older than 48h

  # Remote server workflow
  monk servers add prod api.company.com:443    # Register production server
  monk servers add staging staging-api.company.com:3000  # Register staging
  monk servers list                            # List all with health status
  monk servers use prod                        # Switch to production
  monk auth login --domain my_prod_db         # Authenticate with production
  monk data list account                      # List accounts on production
  monk servers ping-all                       # Health check all servers

  # Development workflow
  monk hono start 3001                # Start server on custom port
  echo '{"name":"test"}' | monk data create user
  monk find user '{"where":{"name":"test"}}'
  monk hono stop                      # Clean shutdown

GLOBAL OPTIONS:
  -h, --help              Show this help message
  
ENVIRONMENT VARIABLES:
  CLI_BASE_URL           Target API server (auto-detected from monk test env)
  CLI_VERBOSE            Enable verbose output for all commands
  JWT_TOKEN              Authentication token (managed by monk auth)

For detailed help on any module, use: monk <module> --help

Documentation: See docs/AUTHENTICATION.md for authentication flow details
```

---

## Detailed Module Documentation

### Test Management (`monk test`)

```
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
```

### Git-based Test Environments (`monk test git`)

```
Usage: monk test git <branch> [commit] [options]

Create or update test environment for git reference.

Arguments:
  <branch>               Git branch name (e.g. main, feature/API-281)
  [commit]               Optional specific commit hash

Options:
  --clean                Force clean rebuild (removes existing build cache)
  --port <port>          Use specific port (default: auto-assign from 3000+)
  --description <text>   Add description to test run

Examples:
  monk test git main                          # Test current main branch HEAD
  monk test git main abc123                   # Test specific commit abc123
  monk test git feature/API-281 --clean      # Force fresh build of feature
  monk test git main --port 3005              # Use specific port
  monk test git main --description "Release candidate"

Related Commands:
  monk test list                              # List all test environments
  monk test current                           # Show active environment  
  monk test use <name>                        # Switch to test environment
  monk test delete <name>                     # Delete test environment

Environment Variables:
  MONK_API_SOURCE_DIR    Override API source directory (default: auto-detect)
  MONK_RUN_HISTORY_DIR   Override run history location (default: auto-detect)

Each test run environment includes:
- Isolated database from pool (max 10 concurrent)
- Dedicated API server on unique port
- Git-specific build cache for faster updates
- Environment variables for CLI targeting

Test runs persist until explicitly deleted and can be switched between
for comparing different git references or testing multiple branches.
```

### Database Pool Management (`monk pool`)

```
Usage: monk pool <operation> [options]

Database pool management for isolated testing environments.

Operations:
  status                  Show database pool status (X/10 databases in use)
  list                    List all active test databases with allocation info
  cleanup [hours]         Clean up databases older than specified hours (default: 24)
  cleanup-all             Clean up ALL databases in pool (use with caution)

Examples:
  monk pool status                    # Check current pool usage
  monk pool list                      # List all active databases
  monk pool cleanup                   # Clean up databases older than 24 hours
  monk pool cleanup 48                # Clean up databases older than 48 hours
  monk pool cleanup-all               # Remove ALL databases (dangerous!)

Internal Operations (used by test framework):
  allocate <name>         Allocate database for test run
  deallocate <name>       Deallocate specific database

Pool Configuration:
  Maximum databases: 10 concurrent
  Database prefix: monk_api_test_*
  Pool directory: ~/.monk-db-pool/
  Auto-cleanup: Available via cleanup operations

Each allocated database includes:
- Isolated PostgreSQL database
- Initialized schema tables
- Allocation tracking metadata
- Automatic cleanup eligibility after 24+ hours

Use 'monk test git <branch>' to create test environments that automatically
allocate databases from this pool.
```

### Remote Server Management (`monk servers`)

```
Usage: monk servers <command> [options]

Remote server registry and management for deployed monk API servers.

Commands:
  add <name> <endpoint>    Add server to registry
  list                     List all servers with status check
  current                  Show currently selected server
  use <name>               Switch to server (sets CLI_BASE_URL)
  delete <name>            Remove server from registry
  ping <name>              Health check specific server
  ping-all                 Health check all registered servers

Server Addition:
  monk servers add <name> <hostname:port> [--description "text"]
  
  Examples:
    monk servers add prod api.company.com:443
    monk servers add staging staging-api.company.com:3000 --description "Staging Environment"
    monk servers add local localhost:3000

Endpoint Formats:
  hostname:port            Auto-detect protocol (443=https, others=http)
  http://hostname:port     Explicit HTTP
  https://hostname:port    Explicit HTTPS

Examples:
  monk servers add prod api.company.com:443           # Uses HTTPS
  monk servers add dev localhost:3000                 # Uses HTTP
  monk servers list                                   # Show all with status
  monk servers ping prod                              # Test production server
  monk servers use prod                               # Switch to production
  monk servers current                                # Show active server

Integration:
  - Switching servers updates CLI_BASE_URL for all monk commands
  - Server status is cached and updated during ping operations
  - Configurations stored in ~/.monk-servers.json
  - Works seamlessly with 'monk auth', 'monk data', etc.

Related Commands:
  monk hono start                     # Local development server
  monk test git <branch>              # Git-based test environments
  monk env                            # Show current environment variables

Use 'monk servers <command>' to manage your remote monk API deployments.
```

---

## Common Usage Patterns

### Basic Data Operations

```bash
# Data operations
monk data list account
monk data get account <id>
echo '{"name":"Test"}' | monk data create account
echo '{"name":"Updated"}' | monk data update account <id>
monk data delete account <id>

# Schema operations  
monk meta list schema
monk meta get schema account
cat schema.yaml | monk meta create schema
cat updated-schema.yaml | monk meta update schema account
monk meta delete schema account

# Advanced search operations
echo '{"where": {"status": "active"}}' | monk find user
echo '{"select": ["name"], "where": {"age": {"$gte": 18}}}' | monk find user
```

### Development Workflow

```bash
# Start local development
monk hono start
monk auth login --domain my_dev_db
monk meta list schema

# Create test environment for feature branch
monk test git feature/new-api --description "Testing new API endpoints"
monk test list
monk test current

# Run specific tests
monk test all 20-30      # Meta and Data API tests
monk test all meta-api   # All meta API tests

# Compare implementations
monk test git main
monk test diff main feature/new-api
```

### Production Deployment

```bash
# Set up remote servers
monk servers add prod api.company.com:443 --description "Production API"
monk servers add staging staging.company.com:3000 --description "Staging Environment"

# Switch to production and work
monk servers use prod
monk auth login --domain production_db
monk data list user

# Health monitoring
monk servers ping-all
monk servers list
```

### Database Management

```bash
# Monitor database pool
monk pool status          # Check usage: X/10
monk pool list           # List all active databases

# Cleanup old test databases
monk pool cleanup        # Remove 24h+ old databases
monk pool cleanup 48     # Remove 48h+ old databases
```

## Configuration

### Environment Variables

```bash
export CLI_BASE_URL=https://api.example.com     # Target API server
export CLI_VERBOSE=true                         # Enable verbose output
export MONK_API_SOURCE_DIR=/path/to/api         # API source directory
export MONK_RUN_HISTORY_DIR=/path/to/history    # Test run history location
```

### Programmatic Mode

All commands output raw JSON for programmatic use:

```bash
# Exit codes: 0 = success, 1 = error
monk data create account -x

# Extract specific fields
monk data get account <id> -f name

# Count records
monk data list account -c
```

## Features

- **Multi-Module Architecture**: Organized command structure for different operations
- **Git-Aware Testing**: Create isolated test environments from git references
- **Database Pool Management**: Automatic allocation and cleanup of test databases
- **Remote Server Registry**: Manage and switch between deployed environments
- **Enterprise-Ready**: Authentication, health monitoring, and comprehensive testing
- **Pure Shell Scripts**: No Node.js runtime dependencies for core operations
- **JSON Output**: Perfect for automation and scripting
- **Exit Codes**: Proper success/failure handling for CI/CD integration

## Related Projects

- [monk-api-hono](https://github.com/ianzepp/monk-api-hono) - High-performance Hono-based PaaS backend API
- [monk-api-test](https://github.com/ianzepp/monk-api-test) - Comprehensive test suite with structured organization