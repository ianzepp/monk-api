# Test Suite Guide

> **Comprehensive shell-based integration testing for the Monk API**

This directory contains the complete test suite - organized shell integration tests that validate all API functionality with real database operations and tenant isolation.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Execution](#test-execution)
3. [Test Organization](#test-organization)
4. [Test Selection](#test-selection)
5. [Helper Functions](#helper-functions)
6. [Writing Tests](#writing-tests)
7. [Environment Variables](#environment-variables)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

## Quick Start

```bash
# Run all shell integration tests
npm run test:sh

# Run specific test series
npm run test:sh 31-meta-api
npm run test:sh 32-data-api

# Run individual test
./spec/31-meta-api/create-schema.test.sh

# Run with detailed output
TEST_VERBOSE=1 npm run test:sh 33-find-api

# Clean up test databases
npm run test:cleanup
```

## Test Execution

### Available NPM Scripts

- **`npm run test:sh [pattern]`** - Run shell integration tests
- **`npm run test:cleanup`** - Clean up all test databases without running tests

### Pattern Matching

```bash
# Run specific test category
npm run test:sh 31-meta       # All meta API tests
npm run test:sh 32-data        # Data API tests
npm run test:sh auth           # All tests with "auth" in path

# Run specific test file
npm run test:sh 31-meta-api/select-schema.test.sh

# Wildcard matching
npm run test:sh meta           # Matches any test with "meta" in path
npm run test:sh find           # Matches any test with "find" in path
```

### Range Selection

```bash
# Run tests in numeric range
npm run test:sh 30-39         # All 30-series tests
npm run test:sh 10-15         # Tests 10, 11, 12, 13, 14, 15
npm run test:sh 01-05         # Tests 01, 02, 03, 04, 05
```

### Verbose Mode

Use `TEST_VERBOSE` to show detailed success messages:

```bash
# Verbose mode - shows all output including success messages
TEST_VERBOSE=1 npm run test:sh 31-meta
TEST_VERBOSE=true npm run test:cleanup
```

**Quiet mode (default)** shows:
- Test headers and summary
- Build output and server management
- Error messages only

**Verbose mode** additionally shows:
- Test setup progress (`→ Creating test tenant...`)
- Success messages (`✓ Database created`)
- Warning messages (`⚠ Database has active connections`)
- Cleanup progress messages

## Test Organization

Tests are organized by numbered series for logical categorization:

### Core Infrastructure (00-09)

| Series | Description | Purpose |
|--------|-------------|---------|
| **00-prerequisites** | System requirements | Command availability, environment checks |
| **01-basic** | Basic API functionality | Tenant isolation, API discovery |
| **02-server-config** | Server configuration | Startup, configuration validation |
| **03-template-infrastructure** | Database templates | Template system (see [FIXTURES.md](../fixtures/README.md)) |
| **05-infrastructure** | Core connectivity | Database setup, basic operations |

### Security & Authentication (10-19)

| Series | Description | Purpose |
|--------|-------------|---------|
| **10-auth** | Public auth endpoints | Login, register, refresh token workflows |
| **10-connection** | Connection management | Database connection handling |
| **11-security-sql** | SQL injection protection | SQL injection prevention tests |
| **12-security-api** | API security validation | Input validation, sanitization |
| **13-security-comprehensive** | Integrated security | Complete security workflow testing |
| **15-authentication** | Authentication workflows | End-to-end auth scenarios |

### API Testing (30-42)

| Series | Description | Purpose |
|--------|-------------|---------|
| **30-auth-api** | Auth API (protected) | User management, whoami, sudo |
| **31-meta-api** | Schema management | Describe API, schema CRUD |
| **32-data-api** | Data operations | Record CRUD, relationships |
| **33-find-api** | Search & filtering | Advanced queries, 25+ filter operators |
| **34-aggregate-api** | Aggregation operations | Count, group by, analytics |
| **35-bulk-api** | Bulk operations | Batch operations, transactions |
| **38-acls-api** | Access control lists | ACL management for records |
| **39-stat-api** | Stat API | Record metadata (timestamps, etag, size) |
| **40-docs-api** | Documentation API | Self-documenting API endpoints |
| **41-sudo-api** | Sudo operations | Administrative operations |
| **42-history-api** | History tracking | Change tracking, audit trails |

### Advanced Features (50-90)

| Series | Description | Purpose |
|--------|-------------|---------|
| **50-integration** | Cross-feature integration | Multi-feature workflow tests |
| **51-formatters** | Response formatters | JSON, YAML, TOON format tests |
| **52-database** | Database management | Database operations, migrations |
| **53-tenant** | Multi-tenant functionality | Tenant isolation, cross-tenant tests |
| **60-lifecycle** | Application lifecycle | Startup, shutdown, health checks |
| **70-validation** | Data validation | Schema enforcement, validation rules |
| **85-observer-integration** | Observer system | Observer pipeline integration tests |
| **90-benchmark** | Performance benchmarks | Performance measurement tests |
| **90-examples** | Usage examples | Example patterns and workflows |

## Test Selection

### When to Run Which Tests

**Quick validation** (< 1 minute):
```bash
npm run test:sh 01-basic       # Basic functionality
npm run test:sh 31-meta-api    # Schema operations
```

**Core API validation** (2-3 minutes):
```bash
npm run test:sh 30-42          # All API tests
```

**Security validation** (1-2 minutes):
```bash
npm run test:sh 10-15          # All security tests
```

**Complete suite** (5-10 minutes):
```bash
npm run test:sh                # Everything
```

## Test Database Management

### Isolated Tenant Strategy

Each test gets its own isolated tenant database:

- **Automatic Creation**: Test tenants created from templates or fresh schemas
- **Complete Isolation**: Tests cannot interfere with each other
- **Deferred Cleanup**: All databases cleaned up at end of test suite

### Database Templates

See [../fixtures/README.md](../fixtures/README.md) for complete documentation.

- **Basic Template**: Pre-populated with test data (5 accounts, 5 contacts)
- **Large Template**: 100+ records for performance testing
- **Empty Template**: Fresh schema with no data
- **Fast Cloning**: Template-based tests are 30x faster than fresh setup

### Cleanup Process

```bash
# Manual cleanup (run anytime)
npm run test:cleanup

# Verbose cleanup (see what's being cleaned)
TEST_VERBOSE=1 npm run test:cleanup
```

**Automatic cleanup** runs after test suite completion.

## Helper Functions

### Test Setup Functions

Located in `test-helper.sh`:

```bash
# Create tenant from template (most common, fastest)
setup_test_with_template "test-name" "testing"

# Create fresh tenant database (slower, custom schemas)
setup_test_isolated "test-name"

# No tenant setup needed (for non-data tests)
setup_test_default "test-name"
```

### Authentication Helpers

```bash
# Authenticate as regular user
setup_full_auth

# Authenticate as root/sudo user
setup_sudo_auth

# Get token for specific user
token=$(get_user_token "user@example.com")
```

### HTTP Request Helpers

Located in `curl-helper.sh`:

```bash
# Authenticated requests
response=$(auth_get "/api/describe/account")
response=$(auth_post "/api/data/account" "$json_data")
response=$(auth_put "/api/data/account/123" "$json_data")
response=$(auth_delete "/api/data/account/123")

# Public requests (no auth)
response=$(public_post "/auth/login" "$credentials")
```

### Validation Helpers

```bash
# Check API response success
assert_success "$response"
assert_error "$response"

# Extract data from response
data=$(extract_data "$response")
data=$(extract_and_validate_data "$response" "operation result")

# Validate record fields
validate_record_fields "$data" "id" "name" "email"
```

### Test Pattern Helpers

```bash
# Test endpoint error handling
test_endpoint_error "GET" "/api/nonexistent" "" "NOT_FOUND" "Non-existent endpoint"

# Test non-existent record operations
test_nonexistent_record "account" "get"

# Generate simple schema
generate_simple_schema "Test Schema" '["name", "email"]'
```

## Writing Tests

### Basic Test Structure

```bash
#!/bin/bash
# Source test helpers
source "$(dirname "${BASH_SOURCE[0]}")/../test-helper.sh"

# Setup test environment with template (fast)
setup_test_with_template "test-run" "testing"
setup_full_auth

# Test implementation
print_step "Testing GET /api/describe/account"
response=$(auth_get "/api/describe/account")
assert_success "$response"

# Validate response data
data=$(extract_and_validate_data "$response" "schema details")
validate_record_fields "$data" "schema_name" "columns"

# Cleanup happens automatically at suite end
```

### Complete Test Example

```bash
#!/bin/bash
source "$(dirname "${BASH_SOURCE[0]}")/../test-helper.sh"

# Setup
setup_test_with_template "create-test" "testing"
setup_full_auth

# Create a record
print_step "Creating new account"
json_data='{
  "name": "Test Account",
  "email": "test@example.com"
}'
response=$(auth_post "/api/data/account" "$json_data")
assert_success "$response"

# Extract and validate
data=$(extract_and_validate_data "$response" "created account")
account_id=$(echo "$data" | jq -r '.id')
validate_record_fields "$data" "id" "name" "email" "created_at"

# Verify retrieval
print_step "Retrieving created account"
response=$(auth_get "/api/data/account/$account_id")
assert_success "$response"

print_success "Account creation and retrieval test passed"
```

### Test File Naming

Follow the naming convention:
```
<series>-<category>/<operation>-<subject>.test.sh

Examples:
31-meta-api/create-schema.test.sh
32-data-api/update-record.test.sh
33-find-api/where-basic.test.sh
```

## Environment Variables

### Automatically Configured

These variables are set by test helpers:

| Variable | Description | Example |
|----------|-------------|---------|
| `API_BASE` | Server base URL | `http://localhost:9001` |
| `JWT_TOKEN` | User authentication token | `eyJhbGc...` |
| `ROOT_TOKEN` | Administrative token | `eyJhbGc...` |
| `TEST_TENANT_NAME` | Current test tenant name | `test_abc123` |
| `TEST_DATABASE_NAME` | Current test database name | `tenant_abc123` |

### User-Configurable

| Variable | Description | Default |
|----------|-------------|---------|
| `TEST_VERBOSE` | Show detailed output | `false` |
| `NODE_ENV` | Environment mode | `test` |
| `DATABASE_URL` | PostgreSQL connection | From `.env` |

## Helper Libraries

### Core Helpers

- **`test-helper.sh`** - Main test setup and validation functions
- **`curl-helper.sh`** - HTTP request wrappers with auth
- **`test-tenant-helper.sh`** - Tenant database management
- **`run-series.sh`** - Series test runner

### Usage Pattern

```bash
# Always source test-helper.sh first
source "$(dirname "$0")/../test-helper.sh"

# It automatically loads:
# - curl-helper.sh
# - test-tenant-helper.sh
# - Common utilities
```

## Troubleshooting

### Common Issues

#### Server won't start
```bash
npm run stop                    # Kill any existing server
npm run start:bg                # Start fresh server
```

#### Database connection issues
```bash
# Test main database
psql -d monk -c "SELECT 1;"

# Rebuild templates
npm run fixtures:build testing

# Check PostgreSQL is running
pg_isready
```

#### Test database pollution
```bash
# Clean up all test databases
npm run test:cleanup

# Check for orphaned databases
psql -c "SELECT datname FROM pg_database WHERE datname LIKE 'tenant_test_%';"
```

#### Tests timing out
```bash
# Increase timeout (in test file)
export TEST_TIMEOUT=30  # 30 seconds

# Check server is responsive
curl http://localhost:9001/health
```

### Debug Mode

#### Run single test with full output
```bash
# Direct execution (most verbose)
./spec/31-meta-api/create-schema.test.sh

# Via npm with verbose mode
TEST_VERBOSE=1 npm run test:sh 31-meta-api/create-schema.test.sh
```

#### Check test database state
```bash
# List tables in test database
psql -d tenant_<hash> -c "\dt"

# Check test tenants
psql -d monk -c "SELECT * FROM tenants WHERE name LIKE 'test_%';"

# View recent test data
psql -d tenant_<hash> -c "SELECT * FROM accounts LIMIT 5;"
```

#### Performance debugging
```bash
# Time specific test categories
time npm run test:sh 31-meta-api
time npm run test:sh 32-data-api

# Compare template vs fresh setup
time npm run test:sh 32-data-api  # Uses templates (fast)
time npm run test:sh 15-authentication  # May use fresh setup
```

### CI/CD Integration

#### GitHub Actions Example

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup PostgreSQL
        run: |
          sudo systemctl start postgresql
          sudo -u postgres psql -c "CREATE DATABASE monk;"

      - name: Install dependencies
        run: npm ci

      - name: Build project
        run: npm run build

      - name: Setup templates
        run: npm run fixtures:build testing

      - name: Run tests
        run: npm run test:sh

      - name: Cleanup
        if: always()
        run: npm run test:cleanup
```

## Best Practices

### Test Design

**Isolation**
- Each test creates its own tenant database
- Tests never share databases or data
- Use templates for consistent starting state

**Descriptive Names**
- Clear test file names describing what's tested
- Step-by-step print_step messages
- Meaningful variable names

**Comprehensive Coverage**
- Test success paths (happy path)
- Test error conditions (sad path)
- Test edge cases (boundary conditions)
- Test different authentication levels

### Performance

**Template Usage**
- Use `setup_test_with_template` when possible (30x faster)
- Only use `setup_test_isolated` when custom schemas needed
- Templates: ~0.1s vs Fresh: ~2-3s per test

**Selective Execution**
- Use pattern matching to run relevant tests only
- Run quick tests during development
- Run full suite in CI/CD

**Output Management**
- Use default (quiet) mode in CI/CD for clean output
- Use verbose mode for debugging
- Keep test output focused and actionable

### Error Handling

**Graceful Failures**
- Tests should fail with clear error messages
- Include context in error messages (expected vs actual)
- Use assert functions that explain failures

**Cleanup Resilience**
- Tests must clean up even on failure
- Use deferred cleanup (automatic at suite end)
- Manual cleanup available anytime

**Connection Management**
- Handle database connection issues gracefully
- Retry logic for transient failures
- Clear error messages for connection problems

## Testing Strategy

### Current Implementation

**Shell Integration Tests** (`spec/*.test.sh`) - ✅ Implemented
- End-to-end API testing with real HTTP requests
- Tenant isolation per test
- Real database operations
- Template-based fast setup (30x improvement)
- Pattern-based test discovery
- Comprehensive API coverage

### Test Categories by Purpose

#### When to Use Shell Tests ✅

Shell tests are ideal for:
- ✅ End-to-end API testing
- ✅ Multi-step workflows
- ✅ Authentication flows
- ✅ Database operations through API
- ✅ Production-like scenarios
- ✅ Integration testing across services

#### Performance Characteristics

**Current Performance (Shell Tests)**
- **Setup Speed**: ~0.1s with templates, ~2-3s fresh
- **Isolation**: Excellent (separate database per test)
- **Coverage**: Comprehensive end-to-end
- **Execution**: Sequential (one test at a time)

**Optimization Tips**
- Use templates for 30x faster setup
- Use pattern matching to run relevant tests
- Run full suite in CI, selective tests in development

---

## Quick Reference

### Essential Commands

```bash
# Run all tests
npm run test:sh

# Run specific series
npm run test:sh 31-meta-api
npm run test:sh 32-data-api

# Run with verbose output
TEST_VERBOSE=1 npm run test:sh 33-find-api

# Clean up test databases
npm run test:cleanup

# Run individual test
./spec/31-meta-api/create-schema.test.sh
```

### Common Test Patterns

```bash
# Basic test structure
source "$(dirname "${BASH_SOURCE[0]}")/../test-helper.sh"
setup_test_with_template "test-name" "testing"
setup_full_auth

# Make request and validate
response=$(auth_get "/api/endpoint")
assert_success "$response"
data=$(extract_data "$response")

# Validate fields
validate_record_fields "$data" "id" "name" "email"
```

### Helper Functions Quick Ref

| Function | Purpose | Example |
|----------|---------|---------|
| `setup_test_with_template` | Create tenant from template | `setup_test_with_template "test" "testing"` |
| `setup_full_auth` | Authenticate as user | `setup_full_auth` |
| `auth_get` | Authenticated GET | `auth_get "/api/data/account"` |
| `auth_post` | Authenticated POST | `auth_post "/api/data/account" "$json"` |
| `assert_success` | Check success response | `assert_success "$response"` |
| `extract_data` | Extract data field | `data=$(extract_data "$response")` |
| `validate_record_fields` | Check fields exist | `validate_record_fields "$data" "id" "name"` |

---

**The test suite provides comprehensive validation of all Monk API functionality through shell-based integration testing with real database operations, achieving fast execution through template-based setup and complete isolation through per-test tenant databases.**
