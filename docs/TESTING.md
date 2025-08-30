# Testing Documentation

## Table of Contents
1. [Testing Architecture](#testing-architecture)
2. [Running Tests](#running-tests)
3. [TypeScript Testing (Vitest)](#typescript-testing-vitest)
4. [Shell Testing](#shell-testing)
5. [Template-Based Testing](#template-based-testing)
6. [Writing Tests](#writing-tests)
7. [Test Categories](#test-categories)
8. [Best Practices](#best-practices)

## Testing Architecture

Monk API employs a comprehensive three-tier testing strategy:

### Three Testing Frameworks

1. **Shell Integration Tests** (`spec/*.test.sh` files)
   - End-to-end CLI and API testing
   - Tenant isolation per test
   - Pattern-based test discovery
   - Real database operations

2. **TypeScript Tests** (`spec/` directory)
   - Vitest framework for unit and integration tests
   - Direct class testing without HTTP overhead
   - Mock support for isolated unit testing
   - Real database support for integration testing

3. **Template Database System** (Epic #140)
   - Pre-built test databases with realistic fixtures
   - PostgreSQL template cloning for fast setup
   - 25-130x performance improvement
   - Smart regeneration on schema changes

### Test Organization Pattern

```
spec/
├── 05-infrastructure/     # Core connectivity and configuration
├── 15-authentication/     # Authentication workflow
├── 20-meta-api/          # Schema management (JSON)
├── 30-data-api/          # Data operations (JSON)
├── unit/                 # Unit tests (no database dependencies)
│   ├── filter/           # Enhanced Filter system tests
│   ├── ftp/              # FTP middleware unit tests
│   └── observers/        # Observer system unit tests
├── integration/          # Integration tests (require database)
│   ├── observer-pipeline.test.ts
│   └── ftp/              # FTP middleware integration tests
├── fixtures/             # Schema definitions and test data
└── helpers/              # Shared test utilities
```

## Running Tests

### Unified Test Commands

**Primary Commands:**
```bash
npm run spec [pattern]              # Complete coverage (TypeScript → Shell)
npm run spec:ts [pattern]           # TypeScript tests only  
npm run spec:sh [pattern]           # Shell tests only
```

**Smart Pattern Resolution:**
```bash
# Run everything
npm run spec                        # All tests (both TypeScript and Shell)

# Run by category
npm run spec 15                     # All auth tests (both .test.ts and .test.sh)
npm run spec:ts 15                  # Only TypeScript auth tests
npm run spec:sh 15                  # Only Shell auth tests

# Run specific tests
npm run spec:ts spec/unit/filter/logical-operators.test.ts
npm run spec:sh spec/15-authentication/basic-auth.test.sh

# Run by pattern
npm run spec auth                   # All tests matching "auth"
npm run spec unit/filter            # All tests in unit/filter/
```

### Test Execution Flow

```bash
# Layer 1: Pattern matching and orchestration
npm run test:all [pattern]        # scripts/test-all.sh

# Layer 2: Tenant lifecycle management  
npm run test:one <test-file>      # scripts/test-one.sh

# Layer 3: Individual test files
spec/15-authentication/basic-auth.test.sh
```

## TypeScript Testing (Vitest)

### Running Spec Tests
```bash
# All spec tests
npm run spec:all

# Pattern matching (sorted execution order)
npm run spec:all 05              # Infrastructure tests (05-infrastructure)
npm run spec:all 15              # Authentication tests (15-authentication)
npm run spec:all 05-20           # Infrastructure through meta-api tests
npm run spec:all unit            # All unit tests (no database required)
npm run spec:all integration     # All integration tests (requires database)

# Category-specific testing
npm run spec:all unit/filter     # Filter operator tests
npm run spec:all unit/ftp        # FTP middleware unit tests
npm run spec:all unit/observers  # Observer system unit tests

# Individual test files
npm run spec:one spec/15-authentication/basic-auth.test.ts
npm run spec:one spec/unit/filter/logical-operators.test.ts

# Verbose output
npm run spec:all unit --verbose
npm run spec:one spec/path/test.test.ts --verbose
```

### Test Categories and Coverage

#### **Unit Tests (No Database Required) - 210+ Tests**
- **Filter Operators (162 tests)**: Comprehensive coverage of 25+ operators
  - **Logical operators**: Deep nesting, complex combinations, parameter management
  - **PostgreSQL arrays**: ACL filtering, array operations, size constraints
  - **Search operations**: Full-text search, content discovery patterns
  - **Range/existence**: Date ranges, field validation, null handling
  - **Complex scenarios**: Real-world ACL, FTP wildcards, enterprise patterns

- **FTP Middleware (48 tests)**: Path parsing, utilities, protocol compliance
  - **Path parsing**: All path levels, wildcard detection, normalization
  - **Utilities**: Permission calculation, content formatting, ETag generation
  - **Protocol compliance**: FTP timestamps, content types, response structures

- **Observer System (35+ tests)**: Business logic validation and execution
  - **Individual observers**: SQL observer, UUID processors, validators
  - **Observer patterns**: BaseObserver, execution flows, error handling

#### **Integration Tests (Database Required) - 100+ Tests**
- **API Operations**: Real database testing of System, Database, Metabase classes
- **Observer Pipeline**: Complete 10-ring execution with real data
- **FTP Endpoints**: End-to-end workflow testing with account/contact schemas
- **Authentication**: JWT generation, tenant creation, user context setup

### Test Development Patterns

#### **Unit Test Pattern (No Database)**
```typescript
// Unit tests for pure logic validation
import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@src/lib/filter-where.js';

describe('Component Unit Tests', () => {
  test('should validate core logic', () => {
    // Test pure functions and logic
    const { whereClause, params } = FilterWhere.generate({
      $and: [
        { access_read: { $any: ['user-123'] } },
        { status: 'active' }
      ]
    });
    
    expect(whereClause).toContain('"access_read" && ARRAY[$1]');
    expect(params).toEqual(['user-123', 'active']);
  });
  
  test('should handle edge cases', () => {
    // Test boundary conditions and error scenarios
    expect(() => {
      FilterWhere.generate({ field: { $between: [null] } });
    }).toThrow('$between requires array with exactly 2 values');
  });
});
```

#### **Integration Test Pattern (Database Required)**
```typescript
// Integration tests with real database operations
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';

describe('Integration Test Suite', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');

    // Create test schemas and data
    const schemaJson = JSON.parse(await readFile('test/schemas/account.json', 'utf-8'));
    await testContext.metabase.createOne('account', schemaJson);
    
    await testContext.database.createOne('account', {
      id: 'test-account',
      name: 'Test User',
      email: 'test@example.com',
      username: 'testuser',
      account_type: 'personal'
    });
  });

  afterAll(async () => {
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  test('should test database operations', async () => {
    const result = await testContext.database.selectOne('account', {
      where: { id: 'test-account' }
    });
    
    expect(result).toBeDefined();
    expect(result.name).toBe('Test User');
  });
});
```

#### **HTTP Endpoint Testing Pattern**
```typescript
// Testing HTTP endpoints with real requests
describe('HTTP Endpoint Tests', () => {
  beforeAll(async () => {
    // Set up test tenant and context
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');
  });

  test('should test API endpoint', async () => {
    const response = await fetch('http://localhost:9001/ftp/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testContext.jwtToken}`
      },
      body: JSON.stringify({
        path: '/data/',
        ftp_options: { show_hidden: false, long_format: true, recursive: false }
      })
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
```

### TypeScript Testing Features

#### **Core Capabilities**
- **Real Database Testing**: Fresh tenant per test suite using `TenantService.createTenant()`
- **TypeScript Classes**: Direct testing of System, Database, Metabase, TenantService
- **Observer Integration**: Full 10-ring observer pipeline execution with `ObserverLoader.preloadObservers()`
- **Authenticated Context**: Proper JWT generation and System context setup
- **Automatic Cleanup**: Tenant and database cleanup after each test suite
- **Path Aliases**: Clean imports using `@src`, `@spec`, `@sql` patterns

#### **Advanced Testing Capabilities**
- **Complex Filter Testing**: 6+ level nesting, 500+ parameters, PostgreSQL array operations
- **HTTP Endpoint Testing**: Real API requests with authentication and validation
- **Mock System Support**: Observer testing with controlled environments
- **Schema Integration**: Real JSON schemas from test/schemas/ directory
- **Performance Testing**: Large datasets, complex queries, stress scenarios
- **Error Boundary Testing**: Comprehensive error handling validation

## Shell Testing

### Shell Test Structure

```bash
#!/bin/bash
set -e

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"
source "$(dirname "$0")/../helpers/auth-helper.sh"

# Test implementation with auth_as_user "root"
# Use $TEST_TENANT_NAME (provided by test-one.sh)

if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

# Authenticate and run tests
if ! auth_as_user "root"; then
    exit 1
fi

# Test implementation...
```

### Shell Test Categories

Each category contains both TypeScript (.test.ts) and Shell (.test.sh) tests side-by-side:

- **05-infrastructure/**: Server config, connectivity tests
- **10-connection/**: Database connectivity, ping tests  
- **15-authentication/**: Auth flows, JWT, multi-user scenarios
- **20-meta-api/**: Schema management, meta operations
- **30-data-api/**: CRUD operations, data validation
- **50-integration/**: End-to-end workflows
- **60-lifecycle/**: Record lifecycle, soft deletes
- **70-validation/**: Schema validation, constraints
- **85-observer-integration/**: Observer system testing

## Template-Based Testing

Enhanced testing infrastructure providing 25-130x faster test setup:

### Performance Comparison
```typescript
// Traditional approach (12-65 seconds per test)
beforeAll(async () => {
  tenantManager = await createTestTenant();
  testContext = await createTestContext(tenantManager.tenant!, 'root');
  // ... manual schema and data loading
});

// Template approach (0.5 seconds per test)  
beforeAll(async () => {
  testContext = await createTestContextWithFixture('basic');
  // Instantly have realistic data with relationships
});
```

### Template Management
```bash
# Build fixture templates
npm run fixtures:build basic

# Clean old templates  
npm run fixtures:clean

# Test template system
npm run fixtures:test

# Prepare templates for testing
npm run test:prepare
```

### Available Fixtures
- `basic`: Account and contact schemas (15+ accounts, 25+ contacts)
- `ecommerce`: E-commerce scenarios with products, orders, customers
- `user-management`: Users, roles, and permissions
- `performance`: Large datasets for stress testing

## Writing Tests

### Writing New TypeScript Tests

```typescript
// spec/25-new-feature/my-feature.test.ts
import { describe, test, expect, beforeAll } from 'vitest';
import { createTestContextWithFixture } from '@spec/helpers/test-tenant.js';

describe('25-new-feature: My Feature', () => {
  let testContext: TestContextWithData;

  beforeAll(async () => {
    testContext = await createTestContextWithFixture('basic');
  });

  test('should implement feature logic', async () => {
    // Test implementation
  });
});
```

### Writing New Shell Tests

```bash
# 1. Create test file in appropriate category
spec/25-new-feature/my-feature.test.sh

# 2. Use standard pattern
#!/bin/bash
set -e

# Auto-configure test environment
source "$(dirname "$0")/../helpers/test-env-setup.sh"
source "$(dirname "$0")/../helpers/auth-helper.sh"

# Test implementation with auth_as_user "root"
# Use $TEST_TENANT_NAME (provided by test-one.sh)

# 3. Make executable
chmod +x spec/25-new-feature/my-feature.test.sh

# 4. Test individually  
npm run spec:sh spec/25-new-feature/my-feature.test.sh

# 5. Test category
npm run spec 25
```

## Test Categories

### Unified Test Categories (`spec/`)

Each category contains both TypeScript (.test.ts) and Shell (.test.sh) tests side-by-side:

- **05-infrastructure/**: Server config, connectivity tests
  - `connectivity.test.ts`, `server-config.test.ts`, `servers-config.test.sh`
- **10-connection/**: Database connectivity, ping tests  
  - `basic-ping.test.sh`
- **15-authentication/**: Auth flows, JWT, multi-user scenarios
  - `basic-auth.test.ts`, `basic-auth.test.sh`, `auth-failure.test.sh`, `multi-user-auth.test.sh`, `token-management.test.sh`
- **20-meta-api/**: Schema management, meta operations
  - `schema-operations.test.ts`, `schema-create.test.sh`, `schema-protection.test.sh`, `recursive-discovery.test.sh`
- **30-data-api/**: CRUD operations, data validation
  - `data-operations.test.ts`, `basic-data-endpoints.test.sh`
- **50-integration/**: End-to-end workflows
  - `test-pipeline.test.sh`, `complete-pipeline.test.ts`, `observer-pipeline.test.ts`
- **60-lifecycle/**: Record lifecycle, soft deletes
  - `soft-deletes.test.sh`, `validation-constraints.test.sh`
- **70-validation/**: Schema validation, constraints
  - `schema-restrict.test.sh`, `schema-validations-change.test.sh`
- **85-observer-integration/**: Observer system testing
  - `basic-observer.test.sh`, `observer-startup.test.sh`

**Specialized TypeScript Directories:**
- **unit/**: Fast tests with no database dependencies (filter/, ftp/, observers/)
- **integration/**: Database-dependent tests with fixture support
- **examples/**: Template system demonstrations and migration examples  
- **fixtures/**: Schema definitions, generators, and template configurations
- **helpers/**: Shared test utilities for both TypeScript and Shell tests

## Best Practices

### Unit vs Integration Test Selection
- **Unit Tests**: Use for pure logic, utilities, parsing, validation without database
- **Integration Tests**: Use for database operations, API endpoints, observer pipeline
- **Performance**: Unit tests run faster (no database setup), prefer when possible

### Test Organization Guidelines
- **Group by functionality**: Filter tests in `unit/filter/`, FTP tests in `unit/ftp/`
- **Logical separation**: One test file per major component or operator group
- **Descriptive naming**: Clear test descriptions that explain the scenario being tested

### Vitest Testing Requirements
- **Observer preloading**: Call `await ObserverLoader.preloadObservers()` in `beforeAll` for integration tests
- **Real tenants**: Use `createTestTenant()` for isolated database testing
- **TypeScript context**: Use `createTestContext()` for authenticated System instances
- **Proper imports**: Use path aliases (`@src`, `@spec`, `@sql`) for clean code organization

### Common Testing Patterns
```typescript
// Test complex Filter operators
const { whereClause, params } = FilterWhere.generate({
  $and: [
    { access_read: { $any: ['user-123'] } },
    { status: { $nin: ['deleted', 'suspended'] } }
  ]
});

// Test HTTP endpoints
const response = await fetch('http://localhost:9001/ftp/list', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ path: '/data/' })
});

// Test database operations  
const record = await testContext.database.createOne('account', testData);
expect(record.id).toBeDefined();
```

### Test Data Strategy
- **Use existing schemas**: `test/schemas/account.json`, `contact.json` for realistic testing
- **Predictable IDs**: Use descriptive test record IDs like `account-test-001`
- **Edge cases**: Test null values, empty arrays, boundary conditions
- **Performance data**: Large objects, many records for stress testing

### Database Testing
- Each test gets a **fresh tenant database** (`test-$(date +%s)`)
- **No database pollution** between tests
- **Automatic cleanup** handled by test-one.sh
- **Authentication isolation** per test run

## Git-based Testing

### Testing Different Branches
```bash
# Create isolated git test environment
monk test git main                # Test main branch
monk test git feature/new-api     # Test feature branch
monk test git main abc123def      # Test specific commit

# Each creates isolated environment in /tmp/monk-builds/
# With independent database, server, and configuration
```

### Test Environment Management
```bash
# The monk test git command:
# 1. Clones repo to /tmp/monk-builds/<run-name>/
# 2. Checks out specified branch/commit
# 3. Runs npm install && npm run compile  
# 4. Allocates port and creates isolated config
# 5. Updates ~/.config/monk/test.json with run info

# Then manually run tests in environment:
cd /tmp/monk-builds/main-12345678/monk-api
npm run spec:sh spec/specific-test.sh
```

---

This comprehensive testing guide covers all aspects of the Monk API testing infrastructure. For additional details on specific components, see [SPEC.md](SPEC.md) for the complete test specification.