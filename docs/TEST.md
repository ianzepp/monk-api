# Testing Guide

Comprehensive guide for running tests in the Monk API project.

> **📖 For complete technical specifications, architecture details, and implementation patterns, see this document**

## Quick Start

```bash
# Run only shell-based integration tests
npm run test:sh

# Run only TypeScript unit tests
npm run test:ts

# Run specific TypeScript test category
npm run test:ts 05        # Infrastructure tests

# Run tests with detailed output
TEST_VERBOSE=1 npm run test:sh

# Clean up test databases without running tests
npm run test:cleanup
```

## Available NPM Scripts

### Test Execution Scripts
- **`npm run test:sh`** - Shell-based integration tests only
- **`npm run test:ts [pattern]`** - TypeScript unit tests (supports number patterns like `05` or ranges like `05-10`)
- **`npm run test:cleanup`** - Clean up all test databases without running tests

### Test Execution
Tests are run individually using either `npm run test:sh` for shell integration tests or `npm run test:ts` for TypeScript unit tests. Shell tests provide end-to-end API testing with real database operations, while TypeScript tests provide fast unit testing of core infrastructure components.

## Test Selection

### Pattern Matching
```bash
# Run specific test category (Shell only)
npm run test:sh 31-meta       # All meta API shell tests
npm run test:sh 01-basic       # Basic functionality shell tests
npm run test:sh 32-data        # Data API tests

# Run specific test file
npm run test:sh 31-meta-api/select-schema.test.sh

# Wildcard matching
npm run test:sh meta           # Matches any test with "meta" in path
npm run test:sh auth           # Matches any test with "auth" in path
```

### Range Selection
```bash
# Run shell tests in numeric range
npm run test:sh 10-15         # Shell tests 10, 11, 12, 13, 14, 15
npm run test:sh 01-05         # Tests 01, 02, 03, 04, 05
npm run test:sh 30-39         # All 30-series tests
```

## Command Line Options

### TEST_VERBOSE Environment Variable
Shows detailed success messages (✓) from test helper functions. Default mode shows only headers, warnings, and errors:

```bash
# Verbose mode - shows all output including success messages
TEST_VERBOSE=1 npm run test:sh 31-meta
TEST_VERBOSE=true npm run test:sh 31-meta
TEST_VERBOSE=1 npm run test:cleanup
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
- **03-template-infrastructure**: Database template system (see [FIXTURES.md](FIXTURES.md))
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

### Database Templates (see [FIXTURES.md](FIXTURES.md) for complete documentation)
- **Basic Template**: Pre-populated with test data (accounts, contacts, users)
- **Empty Template**: Fresh schema with no data
- **Fast Cloning**: Template-based tests are faster than fresh setup

### Cleanup Process
```bash
# Manual cleanup
npm run test:cleanup

# Verbose cleanup
TEST_VERBOSE=1 npm run test:cleanup
```

## Test Helper Functions

### Setup Functions
- **`setup_test_with_template()`** - Create tenant from template (most common)
- **`setup_test_isolated()`** - Create fresh tenant database
- **`setup_test_basic()`** - No tenant setup needed

### Authentication Helpers
- **`setup_full_auth()`** - Authenticate as full user
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
setup_full_auth

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
- **Default Mode**: Use default output in CI/CD environments (clean output)

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
psql -d monk -c "SELECT 1;"  # Test main database
npm run fixtures:build basic        # Rebuild templates

# Test database pollution
npm run test:cleanup              # Clean up all test databases
```

### Debug Mode
```bash
# Run single test with full output
npm run test:sh 01-basic/tenant-isolation.test.sh

# Check test database state
psql -d tenant_<hash> -c "\dt"  # List tables
psql -d monk -c "SELECT * FROM tenants WHERE name LIKE 'test_%';"
```

### Performance Debugging
```bash
# Time specific test categories
time npm run test:sh 31-meta

# Compare template vs fresh setup
time npm run test:sh 32-data  # Uses templates
time npm run test:sh 15-auth  # Uses fresh setup
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Tests
  run: |
    npm run build
    npm run test:sh -- 31-meta
    npm run test:cleanup
```

### Environment Variables
- **`TEST_VERBOSE`** - Set to "1" or "true" to show detailed success messages (✓)
- **`NODE_ENV`** - Set to "test" for test configuration

## Testing Architecture

### Current Implementation
- **Shell Integration Tests** (`spec/*.test.sh`) - ✅ Implemented
  - End-to-end CLI and API testing
  - Tenant isolation per test
  - Real database operations
  - Pattern-based test discovery

### Future Plans
- **TypeScript Tests** (`spec/*.test.ts`) - 🚧 Planned
  - Vitest framework for unit and integration tests
  - Direct class testing without HTTP overhead
  - Mock support for isolated unit testing
  - Parallel execution capabilities

### Testing Strategy
The project uses both shell and TypeScript tests:
- **Shell Tests**: Comprehensive end-to-end API coverage
- **TypeScript Unit Tests**: Fast logic validation for infrastructure components
- **TypeScript Integration Tests**: Direct class testing (expanding)

## Test Categories by Purpose

### When to Use Shell Tests ✅
- End-to-end CLI testing
- Complex multi-step workflows
- External tool integration
- Production-like scenarios
- API endpoint validation

### When to Use TypeScript Tests 🚧 (Planned)
- Pure logic validation
- Utility functions
- Parser testing
- Database operations (without HTTP overhead)
- Complex queries
- Performance-critical unit testing

## Performance Considerations

### Current Performance (Shell Tests)
- **Execution Speed**: Slower due to HTTP requests and database operations
- **Isolation**: Excellent tenant isolation prevents test pollution
- **Coverage**: Comprehensive end-to-end testing

### Future Performance (TypeScript Tests)
- **Unit Test Speed**: Fast execution for pure logic validation
- **Integration Test Speed**: Direct class testing without HTTP overhead
- **Parallel Execution**: Vitest will support concurrent test execution

### Optimization Strategy
- **Current**: Shell tests provide comprehensive coverage with acceptable performance
- **Future**: TypeScript unit tests will provide faster pure logic validation
- **Hybrid Approach**: Combine both for comprehensive yet performant testing

To optimize current test performance:
- **Template Usage**: Use template-based tests when possible (faster than fresh setup)
- **Specific Selection**: Use pattern matching to run relevant tests only
- **Default Mode**: Use default output in CI/CD environments (clean output)

## Future Enhancements

### Planned Features
1. **Enhanced Test Utilities**: Improved helper functions for common test patterns
2. **Performance Benchmarking**: Track test execution trends and identify bottlenecks
3. **Test Coverage Analytics**: Better insights into test coverage across different areas
4. **Parallel Test Optimization**: Further optimize concurrent test execution
5. **Enhanced Debugging Tools**: Better tooling for troubleshooting test failures

### Long-term Vision
- Comprehensive test pattern library
- Advanced mocking and stubbing capabilities
- Automated test maintenance and optimization
- Integration with additional testing tools
- Enhanced CI/CD pipeline integration

---

**This testing architecture currently enables thorough validation of API endpoints through shell-based integration testing. Future TypeScript unit/integration testing will provide faster isolated testing for internal logic validation, creating a comprehensive hybrid approach suitable for enterprise-grade applications.**
