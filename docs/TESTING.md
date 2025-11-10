# Testing Guide

Comprehensive guide for running tests in the Monk API project.

> **📖 For complete technical specifications, architecture details, and implementation patterns, see [SPEC.md](SPEC.md)**

## Quick Start

```bash
# Run all tests (recommended)
npm run test

# Run tests with minimal output
npm run test -- --quiet

# Clean up test databases without running tests
npm run test:cleanup
```

## Available NPM Scripts

### Test Execution
- **`npm run test`** - Main test runner (finds and runs all `.test.sh` files)
- **`npm run test:cleanup`** - Clean up all test databases without running tests

### Legacy Aliases
- **`npm run spec`** - Alias for `npm run test`
- **`npm run spec:sh`** - Alias for `npm run test`
- **`npm run spec:ts`** - TypeScript tests (Vitest - planned feature)

## Test Selection

### Pattern Matching
```bash
# Run specific test category
npm run test 31-meta          # All meta API tests
npm run test 01-basic          # Basic functionality tests
npm run test 32-data           # Data API tests

# Run specific test file
npm run test 31-meta-api/select-schema.test.sh

# Wildcard matching
npm run test meta              # Matches any test with "meta" in path
npm run test auth              # Matches any test with "auth" in path
```

### Range Selection
```bash
# Run tests in numeric range (inclusive)
npm run test 10-15           # Tests 10, 11, 12, 13, 14, 15
npm run test 01-05           # Tests 01, 02, 03, 04, 05
npm run test 30-39           # All 30-series tests
```

## Command Line Options

### --quiet Flag
Suppresses verbose output from test helper functions while preserving essential information:

```bash
# Quiet mode - shows test headers and results only
npm run test -- --quiet 31-meta
npm run test:cleanup -- --quiet
```

**What gets silenced in quiet mode:**
- Test setup progress messages (`→ Creating test tenant...`)
- Success messages (`✓ Database created`)
- Warning messages (`⚠ Database has active connections`)
- Cleanup progress messages

**What still shows:**
- Test headers (`=== Running: spec/31-meta-api/select-schema.test.sh ===`)
- Test summary (pass/fail counts)
- Build output and server management
- True error messages

## Test Organization

Tests are organized by numbered series for logical categorization:

### Core Infrastructure (00-09)
- **00-prerequisites**: System requirements and command availability
- **01-basic**: Basic API functionality and tenant isolation
- **02-server-config**: Server configuration and startup
- **03-template-infrastructure**: Database template system
- **05-infrastructure**: Core connectivity and database setup

### Security & Authentication (10-19)
- **10-auth**: Public authentication endpoints
- **11-security-sql**: SQL injection protection
- **12-security-api**: API security validation
- **13-security-comprehensive**: Integrated security testing
- **15-authentication**: Complete authentication workflows

### API Testing (20-39)
- **30-auth-api**: Authentication API endpoints
- **31-meta-api**: Schema management and describe API
- **32-data-api**: CRUD operations and data management
- **33-find-api**: Search and filtering functionality
- **35-bulk-api**: Bulk operations and transactions
- **37-file-api**: File upload/download operations
- **38-acls-api**: Access control list management
- **39-root-api**: Root-level operations

### Advanced Features (40-49)
- **41-database**: Database management operations
- **42-tenant**: Multi-tenant functionality
- **44-filter**: Advanced filtering and query logic

### Integration & Lifecycle (50-89)
- **50-integration**: Cross-feature integration tests
- **60-lifecycle**: Application lifecycle management
- **70-validation**: Data validation and schema enforcement
- **85-observer-integration**: Observer system integration
- **90-examples**: Example usage patterns

## Test Database Management

### Isolated Tenant Strategy
Each test gets its own isolated tenant database:
- **Automatic Creation**: Test tenants created from templates or fresh schemas
- **Complete Isolation**: Tests cannot interfere with each other
- **Deferred Cleanup**: All databases cleaned up at end of test suite

### Database Templates
- **Basic Template**: Pre-populated with test data (accounts, contacts, users)
- **Empty Template**: Fresh schema with no data
- **Fast Cloning**: Template-based tests are faster than fresh setup

### Cleanup Process
```bash
# Automatic cleanup (runs after all tests complete)
npm run test 31-meta

# Manual cleanup
npm run test:cleanup

# Quiet cleanup
npm run test:cleanup -- --quiet
```

## Test Helper Functions

### Setup Functions
- **`setup_test_with_template()`** - Create tenant from template (most common)
- **`setup_test_isolated()`** - Create fresh tenant database
- **`setup_test_basic()`** - No tenant setup needed

### Authentication Helpers
- **`setup_admin_auth()`** - Authenticate as admin user
- **`setup_root_auth()`** - Authenticate as root user
- **`get_user_token()`** - Get JWT token for specific user

### Validation Helpers
- **`assert_success()`** - Check API response success
- **`assert_error()`** - Check API response error
- **`extract_data()`** - Extract data field from response
- **`validate_record_fields()`** - Check expected fields exist

## Writing Tests

### Test File Structure
```bash
#!/bin/bash
source "$(dirname "${BASH_SOURCE[0]}")/../test-helper.sh"

# Setup test environment
setup_test_with_template "$(basename "$0" .test.sh)" "basic"
setup_admin_auth

# Test implementation
print_step "Testing GET /api/describe/account"
response=$(auth_get "/api/describe/account")
assert_success "$response"

# Cleanup happens automatically
```

### Test Patterns
```bash
# Test endpoint error handling
test_endpoint_error "GET" "/api/nonexistent" "" "NOT_FOUND" "Non-existent endpoint"

# Test non-existent record operations
test_nonexistent_record "account" "get"

# Test schema operations
generate_simple_schema "Test Schema" '["name", "email"]'
```

## Best Practices

### Test Design
- **Isolated State**: Each test creates its own tenant database
- **Descriptive Names**: Clear test file and function names
- **Comprehensive Coverage**: Test success, error, and edge cases
- **Authentication Testing**: Test with different user access levels

### Performance Considerations
- **Template Usage**: Use template-based tests when possible (faster)
- **Specific Selection**: Use pattern matching to run relevant tests only
- **Quiet Mode**: Use `--quiet` in CI/CD environments

### Error Handling
- **Graceful Failures**: Tests should fail with clear error messages
- **Cleanup Resilience**: Tests must clean up even on failure
- **Connection Management**: Handle database connection issues gracefully

## Troubleshooting

### Common Issues

```bash
# Server won't start
npm run stop                    # Kill any existing server
npm run start:bg                 # Start fresh server

# Database connection issues
psql -d monk_main -c "SELECT 1;"  # Test main database
npm run fixtures:build basic        # Rebuild templates

# Test database pollution
npm run test:cleanup              # Clean up all test databases
```

### Debug Mode
```bash
# Run single test with full output
npm run test 01-basic/tenant-isolation.test.sh

# Check test database state
psql -d tenant_<hash> -c "\dt"  # List tables
psql -d monk_main -c "SELECT * FROM tenants WHERE name LIKE 'test_%';"
```

### Performance Debugging
```bash
# Time specific test categories
time npm run test 31-meta

# Compare template vs fresh setup
time npm run test 32-data  # Uses templates
time npm run test 15-auth  # Uses fresh setup
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Tests
  run: |
    npm run build
    npm run test -- --quiet 31-meta
    npm run test:cleanup -- --quiet
```

### Environment Variables
- **`TEST_QUIET`** - Set to "true" to suppress verbose output
- **`NODE_ENV`** - Set to "test" for test configuration

---

**For complete documentation including:**
- Detailed test architecture and implementation patterns
- Advanced testing strategies and security considerations
- Performance optimization and debugging techniques
- Future enhancement plans

**See [SPEC.md](SPEC.md) - Complete Test Specification**