# Test Specification Documentation

## Overview

The Monk API project employs a shell-based integration testing strategy with planned TypeScript unit/integration tests via Vitest. This document provides complete specification for current testing processes and planned future enhancements.

## Current Testing Status

- **✅ Implemented**: Shell-based integration tests (*.test.sh) with comprehensive API coverage
- **🚧 Planned**: TypeScript unit/integration tests (*.test.ts) via Vitest for faster isolated testing
- **⚡ Ready**: Infrastructure (vitest.config.ts, test setup) prepared for future TypeScript tests

## Testing Architecture

### Testing Frameworks

#### **1. Shell Integration Tests** (`spec/*.test.sh` files) - ✅ Implemented
   - End-to-end CLI and API testing
   - Tenant isolation per test
   - Pattern-based test discovery
   - Real database operations

#### **2. TypeScript Tests** (`spec/` directory) - 🚧 Planned
   - Vitest framework for unit and integration tests
   - Direct class testing without HTTP overhead
   - Mock support for isolated unit testing
   - Real database support for integration testing
   - **Status**: Infrastructure ready, implementation planned for future development

## Shell-Based Testing (`spec/*.test.sh` files)

### Architecture

```
Layer 1: Pattern Matching (test-all.sh)
         ↓
Layer 2: Tenant Management (test-one.sh)
         ↓
Layer 3: Individual Tests (*.sh files)
```

### Test Categories

```
tests/
├── 05-infrastructure/     # Server config, connectivity
├── 10-connection/         # Database connectivity, ping
├── 15-authentication/     # Auth flows, JWT, multi-user
├── 20-describe-api/          # Schema management operations
├── 30-data-api/          # CRUD operations, validation
├── 50-integration/       # End-to-end workflows
├── 60-lifecycle/         # Record lifecycle, soft deletes
├── 70-validation/        # Schema validation, constraints
├── 80-filter/           # Filter system testing
└── 85-observer-integration/ # Observer pipeline testing
```

### Running Shell Tests

```bash
# All tests
npm run spec:sh

# Pattern matching
npm run spec:sh 15              # All auth tests
npm run spec:sh 20-30           # Describe and data API tests

# Individual test
npm run spec:sh spec/15-authentication/basic-auth.test.sh

# Verbose output
npm run spec:sh spec/path/test.sh --verbose
```

### Test Lifecycle

1. **spec-sh.sh** finds matching test files
2. **test-one.sh** creates isolated tenant (`test-$(timestamp)`)
3. Test runs with `TEST_TENANT_NAME` environment variable
4. Automatic cleanup after test completion

### Writing Shell Tests

```bash
#!/bin/bash
set -e

# Required setup
source "$(dirname "$0")/../test-env-setup.sh"
source "$(dirname "$0")/../auth-helper.sh"

# Verify tenant available
if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available"
    exit 1
fi

# Authenticate
if ! auth_as_user "root"; then
    exit 1
fi

# Test implementation - using curl for API testing
curl -X POST http://localhost:9001/api/data/account \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @test-data.json
```

## TypeScript Testing (`spec/` directory)

### Test Structure

```
spec/
├── 05-infrastructure/        # Core connectivity tests
├── 10-19-security/          # Security testing series
│   ├── 11-security-sql/     # SQL injection protection
│   ├── 12-security-api/     # API endpoint security
│   ├── 13-security-comprehensive/ # Multi-vector security testing
│   ├── 14-18/               # Reserved for future security categories
│   └── 19-security-integration/ # Security integration testing
├── 15-authentication/        # Auth workflow tests
├── 20-describe-api/              # Schema management tests
├── 30-data-api/              # Data operation tests
├── 40-49-unit/              # Unit testing series
│   ├── 41-database/         # Database connection tests
│   ├── 42-tenant/           # Tenant service tests
│   ├── 43-schema/           # Reserved for schema/describe unit tests
│   ├── 44-filter/           # Filter system tests
│   ├── 45-observers/        # Observer system tests
│   ├── 46-file/             # FS middleware tests
│   └── 47-49/               # Reserved for future unit test categories
├── 50-59-integration/       # Integration testing series
│   ├── 50-integration/      # Core integration tests
│   ├── 51-integration-observers/ # Observer pipeline integration
│   ├── 52-integration-file/ # FS middleware integration
│   └── 53-59/               # Reserved for future integration categories
└── helpers/                 # Test utilities
```

### Test Categories

#### Security Tests (10-19 Series)
- **Purpose**: Security validation and injection protection
- **Coverage**: SQL injection, API security, comprehensive attack testing
- **Series**:
  - **11-security-sql**: SQL injection protection
  - **12-security-api**: API endpoint security
  - **13-security-comprehensive**: Multi-vector security testing

#### Unit Tests (40-49 Series)
- **Purpose**: Test pure logic, utilities, parsing (no database)
- **Count**: 210+ tests
- **Speed**: Fast (no external dependencies)
- **Series**:
  - **41-database**: Database connection and pool management
  - **42-tenant**: Tenant service and multi-tenant routing
  - **44-filter**: Filter operators and query building
  - **45-observers**: Observer system and pipeline logic
  - **46-file**: FS middleware and file operations

#### Integration Tests (50-59 Series)
- **Purpose**: Test database operations, API endpoints, multi-component workflows
- **Count**: 100+ tests
- **Speed**: Slower (database setup/teardown)
- **Series**:
  - **50-integration**: Core integration workflows
  - **51-integration-observers**: Observer pipeline integration
  - **52-integration-file**: FS middleware integration

### Writing TypeScript Tests

#### Unit Test Pattern (Planned)

```typescript
// Future: TypeScript unit test structure
import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('Filter Operators', () => {
  test('should handle AND operations', () => {
    const { whereClause, params } = FilterWhere.generate({
      $and: [
        { status: 'active' },
        { age: { $gte: 18 } }
      ]
    });

    expect(whereClause).toContain('AND');
    expect(params).toEqual(['active', 18]);
  });
});
```

#### Integration Test Pattern (Planned)

```typescript
// Future: TypeScript integration test structure
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';

describe('Database Operations', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  beforeAll(async () => {
    // Create isolated tenant
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');

    // Load observers
    await ObserverLoader.preloadObservers();

    // Create schema
    const schemaJson = JSON.parse(await readFile('fixtures/basic/schemas/account.json', 'utf-8'));
    await testContext.describe.createOne('account', schemaJson);
  });

  afterAll(async () => {
    await tenantManager?.cleanup();
  });

  test('should create record', async () => {
    const record = await testContext.database.createOne('account', {
      name: 'Test User',
      email: 'test@example.com'
    });

    expect(record.id).toBeDefined();
  });
});
```

## Test Data Management

Tests create necessary data during setup using manual schema loading and record creation. Each test is responsible for creating its required test data and cleaning up after completion.

Tests should focus on creating minimal, focused test data that exercises the specific functionality being tested. Avoid creating large datasets unless specifically testing performance or scale scenarios.


## Test Data Management

### Schema Files
Tests may use schema files located in appropriate test directories for validation and setup purposes.

### Test Data Generation
Tests create necessary data using helper functions and utilities, focusing on:
- Deterministic data for reproducibility
- Minimal data sets for fast execution
- Edge case coverage where relevant
- Proper cleanup after test completion


## Performance Considerations

### Test Execution Speed

#### **Current Performance (Shell Tests)**
- **Execution Speed**: Slower due to HTTP requests and database operations
- **Isolation**: Excellent tenant isolation prevents test pollution
- **Coverage**: Comprehensive end-to-end testing

#### **Future Performance (TypeScript Tests)**
- **Unit Test Speed**: Fast execution for pure logic validation
- **Integration Test Speed**: Direct class testing without HTTP overhead
- **Parallel Execution**: Vitest will support concurrent test execution for improved CI performance

#### **Optimization Strategy**
- **Current**: Shell tests provide comprehensive coverage with acceptable performance
- **Future**: TypeScript unit tests will provide faster pure logic validation
- **Hybrid Approach**: Combine both for comprehensive yet performant testing

To optimize current test performance:
- **Minimize Database Operations**: Only use integration tests when database interaction is required
- **Clean Setup/Teardown**: Keep test setup and cleanup minimal and focused

### CI/CD Optimization
- Keep test datasets small and focused
- Use appropriate test categorization (unit vs integration)
- Leverage test result caching where possible
- Monitor test execution times and optimize slow tests

### Parallel Testing (Planned)
Vitest will enable safe parallel test execution:
```typescript
// Future: Parallel test execution with Vitest
describe.concurrent('Parallel Suite', () => {
  // Each test gets independent tenant isolation
  // No shared state or pollution
});
```

## Best Practices

### Test Selection

#### **1. Use Shell Tests For:** ✅ Currently Available
   - End-to-end CLI testing
   - Complex multi-step workflows
   - External tool integration
   - Production-like scenarios

#### **2. Use TypeScript Unit Tests For:** 🚧 Planned
   - Pure logic validation
   - Utility functions
   - Parser testing
   - No database required
   - **Benefit**: Faster execution than shell tests

#### **3. Use TypeScript Integration Tests For:** 🚧 Planned
   - Database operations
   - Observer pipeline
   - API endpoints
   - Complex queries
   - **Benefit**: Direct class testing without HTTP overhead


### Writing Effective Tests

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data/tenants
3. **Naming**: Clear, descriptive test names
4. **Coverage**: Test happy path and edge cases
5. **Performance**: Prefer unit tests when possible



## Troubleshooting

### Common Issues

#### Shell Test Failures
```bash
# Check database connectivity
psql -d monk_main -c "SELECT COUNT(*) FROM tenants;"

# Check API server connectivity
curl http://localhost:9001/health

# Test authentication endpoint
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "root", "password": "password"}'
```

#### TypeScript Test Failures
```bash
# Check database connection
npm run spec:ts spec/unit/database-connection-test.test.ts

# Verify observer loading
npm run spec:ts spec/unit/observers/

# Test in isolation
npm run spec:ts failing-test.test.ts --verbose
```


### Debug Commands

```bash
# Shell test debugging
bash -x scripts/test-one.sh spec/failing-test.test.sh

# TypeScript test debugging
npm run spec:ts spec/failing-test.test.ts --verbose

# Test tenant debugging
npm run spec:ts spec/helpers/test-tenant.test.ts
```

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

## Summary

The Monk API testing infrastructure provides:

1. **Shell-based integration testing** for comprehensive end-to-end coverage ✅
2. **Planned TypeScript unit/integration testing** for faster isolated testing 🚧
3. **Comprehensive test isolation** via tenant-based testing
4. **Robust debugging capabilities** with detailed error reporting
5. **Developer-friendly** APIs and helper functions

This testing architecture currently enables thorough validation of API endpoints through shell-based integration testing. Future TypeScript unit/integration testing will provide faster isolated testing for internal logic validation, creating a comprehensive hybrid approach suitable for enterprise-grade applications.
