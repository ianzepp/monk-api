# Test Specification Documentation

## Overview

The Monk API project employs a comprehensive three-tier testing strategy combining shell-based integration tests, TypeScript unit/integration tests via Vitest, and a new template-based database system for fast fixture loading. This document provides complete specification for all testing processes and the ongoing template system implementation.

## Testing Architecture

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

3. **Template Database System** (NEW - Epic #140)
   - Pre-built test databases with realistic fixtures
   - PostgreSQL template cloning for fast setup
   - Smart regeneration on schema changes
   - Comprehensive fixture library

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
├── 20-meta-api/          # Schema management operations
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
npm run spec:sh 20-30           # Meta and data API tests

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
├── 20-meta-api/              # Schema management tests
├── 30-data-api/              # Data operation tests
├── 40-49-unit/              # Unit testing series
│   ├── 41-database/         # Database connection tests
│   ├── 42-tenant/           # Tenant service tests
│   ├── 43-schema/           # Reserved for schema/metabase unit tests
│   ├── 44-filter/           # Filter system tests
│   ├── 45-observers/        # Observer system tests
│   ├── 46-ftp/              # FTP middleware tests
│   └── 47-49/               # Reserved for future unit test categories
├── 50-59-integration/       # Integration testing series
│   ├── 50-integration/      # Core integration tests
│   ├── 51-integration-observers/ # Observer pipeline integration
│   ├── 52-integration-ftp/  # FTP middleware integration
│   └── 53-59/               # Reserved for future integration categories
├── fixtures/                # Template system tests
└── helpers/                 # Test utilities
```

### Running TypeScript Tests

```bash
# All tests
npm run spec:ts

# Series-specific  
npm run spec:ts 11              # SQL injection security tests
npm run spec:ts 12              # API endpoint security tests
npm run spec:ts 15              # Authentication workflow tests
npm run spec:ts 41              # Database unit tests
npm run spec:ts 44              # Filter system tests
npm run spec:ts 45              # Observer system tests
npm run spec:ts 46              # FTP middleware tests

# Range patterns
npm run spec:ts 10-19           # All security tests
npm run spec:ts 40-49           # All unit tests
npm run spec:ts 20-30           # All API tests

# Individual file
npm run spec:ts spec/44-filter/logical-operators.test.ts
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
  - **46-ftp**: FTP middleware and file operations

#### Integration Tests (50-59 Series)
- **Purpose**: Test database operations, API endpoints, multi-component workflows
- **Count**: 100+ tests
- **Speed**: Slower (database setup/teardown)
- **Series**:
  - **50-integration**: Core integration workflows
  - **51-integration-observers**: Observer pipeline integration
  - **52-integration-ftp**: FTP middleware integration

### Writing TypeScript Tests

#### Unit Test Pattern

```typescript
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

#### Integration Test Pattern

```typescript
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
    const schemaJson = JSON.parse(await readFile('test/schemas/account.json', 'utf-8'));
    await testContext.metabase.createOne('account', schemaJson);
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

## Template Database System (NEW - Epic #140)

### Overview

The template database system revolutionizes test setup by pre-building databases with realistic fixture data, then using PostgreSQL's native cloning for sub-second test database creation.

### Performance Impact

```
Traditional Setup:              Template System:
Create tenant: 500ms           Clone template: 300ms
Load schemas: 2000ms          → 
Load data: 10000ms            → 
Total: 12.5 seconds           Total: 0.5 seconds

Improvement: 25x faster for small datasets
            130x faster for large datasets
```

### Architecture

```
Development Phase:
Fixture Definitions → Build Template DBs → Cache Templates
                           ↓
                   monk-api-template-*

Test Phase:
Test Start → Clone Template → Run Test → Cleanup
                 ↓
           Fast PG Clone (200-500ms)
```

### Implementation Phases

#### Phase 1: Core Infrastructure (Issue #141) ✅ COMPLETE
- Template database creation and management
- PostgreSQL cloning integration
- Basic template lifecycle

```typescript
// Core capabilities implemented
export class TemplateDatabase {
  async buildTemplate(fixtureName: string): Promise<void>;
  async cloneTemplate(fixtureName: string): Promise<string>;
  async dropTemplate(fixtureName: string): Promise<void>;
  async listTemplates(): Promise<TemplateInfo[]>;
}
```

#### Phase 2: Fixture System (Issue #142) ✅ COMPLETE
- Fixture definition framework
- Smart data generators
- Relationship management

```typescript
// Fixture structure
interface FixtureDefinition {
  name: string;
  schemas: Record<string, string>;      // Schema file paths
  data_generators: Record<string, GeneratorConfig>;
  relationships: RelationshipDefinition[];
  metadata: FixtureMetadata;
}

// Generator system
export class DataGenerator {
  generate(count: number, options: GeneratorOptions): GeneratedRecord[];
  getDependencies(): string[];
  validate(records: GeneratedRecord[]): ValidationResult;
}
```

#### Phase 3: Compatibility Management (Issue #143) ✅ COMPLETE
- Schema change detection
- Smart regeneration strategies
- Automatic fixture updates

```typescript
// Compatibility tracking
interface TemplateMetadata {
  schema_hash: string;
  observer_hash: string;
  created_at: string;
  monk_version: string;
}

// Auto-regeneration
export class CompatibilityManager {
  async detectChanges(template: string): Promise<ChangeAnalysis>;
  async regenerateIfNeeded(template: string): Promise<void>;
}
```

#### Phase 4: Enhanced Test Helpers (Issue #144) 🚧 IN PROGRESS
- Simplified test setup APIs
- Template-aware test context
- Multi-fixture composition

```typescript
// New simplified test setup
export async function createTestContextWithTemplate(
  fixtureName: string,
  user?: string
): Promise<TestContextWithData>;

// Usage
const context = await createTestContextWithTemplate('ecommerce');
// Instantly have 5000 products, 1000 customers, 10000 orders
```

### Fixture Library

```
spec/fixtures/
├── definitions/           # Fixture configurations
│   ├── basic.ts          # Simple test scenarios
│   ├── ecommerce.ts      # E-commerce with relationships
│   └── performance.ts    # Large dataset testing
├── generators/           # Data generators
│   ├── base-generator.ts # Base class with utilities
│   ├── account-generator.ts
│   ├── contact-generator.ts
│   └── example-generator.ts
└── schema/              # Schema definitions
    ├── account.json
    ├── contact.json
    └── example.json
```

### Using Templates in Tests

#### Current Method (Slow)
```typescript
// 12-65 seconds per test
beforeAll(async () => {
  tenantManager = await createTestTenant();
  testContext = await createTestContext(tenantManager.tenant!, 'root');
  
  // Manual schema loading
  const accountJson = JSON.parse(await readFile('test/schemas/account.json', 'utf-8'));
  await testContext.metabase.createOne('account', accountJson);
  
  // Manual data creation
  for (let i = 0; i < 100; i++) {
    await testContext.database.createOne('account', generateAccount(i));
  }
});
```

#### Template Method (Fast)
```typescript
// 0.5 seconds per test
beforeAll(async () => {
  // One line replaces entire setup
  testContext = await createTestContextWithTemplate('ecommerce');
  
  // Instantly have:
  // - All schemas created
  // - Thousands of records with relationships
  // - Edge cases included
  // - Proper foreign keys
});
```

### Template Management Commands

```bash
# Build templates
npm run fixtures:build            # Build all templates
npm run fixtures:build basic      # Build specific template

# Status and maintenance
npm run fixtures:list             # List available templates
npm run fixtures:clean            # Remove stale templates

# Testing
npm run fixtures:test             # Test template system
npm run fixtures:prepare          # Auto-rebuild if needed
```

### Migration Modes

#### Safe Mode (Default)
- Full observer pipeline validation
- Business logic applied
- Audit trail created
- Use for: Integration testing, observer testing

#### Unsafe Mode (Performance)
- Direct SQL insertion
- No observer overhead
- Very fast for large datasets
- Use for: Performance testing, stress testing

```typescript
// Mode selection
await templateDatabase.buildTemplate('basic', 'safe');      // With observers
await templateDatabase.buildTemplate('performance', 'unsafe'); // Direct SQL
```

## Test Data Management

### Schema Files
Located in `spec/fixtures/schema/`:
- **account.json**: User account schema
- **contact.json**: Contact/customer schema
- **example.json**: Demonstration schema

### Data Generators
Located in `spec/fixtures/generators/`:
- **BaseGenerator**: Common utilities, foreign keys
- **AccountGenerator**: User accounts with preferences
- **ContactGenerator**: Contacts with relationships
- **ExampleGenerator**: Various field types

### Generator Features
- Deterministic UUIDs for reproducibility
- Realistic data distributions
- Edge case generation
- Relationship awareness
- Configurable record counts

## Schema to Generator Development Process

### Overview

The fixture system uses a two-part approach: JSON schemas define the data structure and validation rules, while TypeScript generators create realistic test data that conforms to those schemas. This separation allows for clear data contracts while maintaining flexibility in test data generation.

### Step-by-Step Process

#### 1. Define the Schema (JSON)

Start by creating a JSON schema file that defines all fields, types, and validation constraints:

```json
# spec/fixtures/schema/example.json
{
  "title": "Example",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Unique identifier"
    },
    "title": {
      "type": "string"
    minLength: 1
    maxLength: 200
  status:
    type: string
    enum: ["draft", "pending", "approved", "rejected", "archived"]
    default: "draft"
  priority:
    type: integer
    minimum: 1
    maximum: 5
  value:
    type: number
    minimum: 0
    maximum: 100000
required:
  - id
  - title
  - status
  - priority
```

#### 2. Create the Generator Class

Build a generator that produces data matching the schema constraints:

```typescript
// spec/fixtures/generators/example-generator.ts
export class ExampleGenerator extends BaseGenerator {
  generate(count: number, options: DataGeneratorOptions): GeneratedRecord[] {
    const examples: GeneratedRecord[] = [];
    
    for (let i = 0; i < count; i++) {
      const example: GeneratedRecord = {
        // Required fields (must always be present)
        id: this.generateDeterministicUuid('example', `example-${i}`),
        title: this.generateTitle(i, options),
        status: this.generateStatus(i),
        priority: this.generatePriority(i),
        
        // Optional fields (include based on schema defaults)
        value: this.generateValue(i),
        
        // Nullable fields (can be null)
        expires_at: this.generateExpiresAt(i)
      };
      
      examples.push(example);
    }
    
    return examples;
  }
}
```

#### 3. Implement Field Generators

Create methods that respect schema constraints:

```typescript
private generateStatus(index: number): string {
  // Match enum values from schema
  if (index % 2 === 0) return 'approved';     // 50% approved
  if (index % 5 === 1) return 'pending';      // 20% pending
  if (index % 7 === 2) return 'draft';        // ~14% draft
  if (index % 11 === 3) return 'rejected';    // ~9% rejected
  return 'archived';                          // ~7% archived
}

private generatePriority(index: number): number {
  // Respect min/max constraints (1-5)
  if (index % 10 === 0) return 5;  // 10% highest
  if (index % 5 === 1) return 4;   // 20% high
  if (index % 7 === 2) return 2;   // ~14% low
  if (index % 9 === 3) return 1;   // ~11% lowest
  return 3;                         // ~45% medium
}

private generateValue(index: number): number {
  const seed = this.seededRandom(`value-${index}`);
  // Ensure value stays within 0-100000 range
  return Math.round(seed * 100000 * 100) / 100;
}
```

#### 4. Add Edge Cases

Include boundary conditions for comprehensive testing:

```typescript
private generateEdgeCases(): GeneratedRecord[] {
  return [
    {
      // Minimal values
      id: this.generateDeterministicUuid('example', 'edge-minimal'),
      title: 'M',  // Min length 1
      status: 'draft',
      priority: 1,  // Minimum
      value: 0      // Minimum
    },
    {
      // Maximum values
      id: this.generateDeterministicUuid('example', 'edge-maximum'),
      title: 'A'.repeat(200),  // Max length
      status: 'archived',
      priority: 5,  // Maximum
      value: 100000 // Maximum
    }
  ];
}
```

### Real-World Examples

#### Account Schema → Generator

The **account.json** schema defines:
- Required fields: id, name, email, username, account_type
- Constraints: username pattern `^[a-zA-Z0-9_-]{3,50}$`, balance 0-1,000,000
- Nullable fields: credit_limit (only for business accounts), phone, last_login

The **AccountGenerator** implements:
- Username generation that follows the regex pattern
- Balance distribution: 30% minimal ($0-100), 40% low ($100-1000), 20% medium ($1000-10000)
- Credit limits only for business/premium accounts
- 60% have phone numbers, 80% have logged in

#### Contact Schema → Generator

The **contact.json** schema defines:
- Required fields: id, first_name, last_name, email, contact_type
- Complex object: address with street, city, state, postal_code, country
- Array field: tags (max 10 items, each max 50 chars)

The **ContactGenerator** implements:
- 50% customers, 25% prospects distribution
- 40% have addresses, 60% have mobile numbers
- Realistic tag distribution: 30% no tags, 40% have 1-2 tags, 30% have 3-5 tags
- Foreign key relationships to accounts (70% linked)

### Schema-Generator Alignment Checklist

When creating or updating generators:

1. **Required Fields**: Ensure all required fields from schema are always generated
2. **Type Matching**: Match exact types (string, number, boolean, array, object)
3. **Constraints**: Respect minLength, maxLength, minimum, maximum values
4. **Enums**: Only use values listed in enum arrays
5. **Patterns**: Generate data matching regex patterns
6. **Defaults**: Use schema defaults for optional fields when appropriate
7. **Nullable Fields**: Allow null values where schema doesn't require the field
8. **Format Compliance**: Follow formats (uuid, email, date-time)
9. **Edge Cases**: Test boundaries of all constraints

### Benefits of This Approach

1. **Contract Clarity**: JSON schemas serve as clear data contracts
2. **Validation Ready**: Schemas can be used for runtime validation
3. **Realistic Data**: Generators create believable test scenarios
4. **Maintainability**: Changes to schemas guide generator updates
5. **Documentation**: Schemas self-document the data structure
6. **Type Safety**: TypeScript generators catch type mismatches at compile time

### Common Patterns

#### Distribution Patterns
```typescript
// Use modulo for deterministic distributions
if (index % 10 === 0) return 'special';  // 10%
if (index % 5 === 1) return 'common';    // 20%
return 'default';                        // 70%
```

#### Nullable Fields
```typescript
// Return null for some percentage
if (index % 5 === 0) {
  return null;  // 20% null
}
return generateValue();
```

#### Constrained Values
```typescript
// Always check schema constraints
const value = Math.random() * 100;
return Math.min(Math.max(value, schema.minimum), schema.maximum);
```

## Performance Considerations

### Test Setup Speed

| Method | Small Dataset | Large Dataset |
|--------|--------------|---------------|
| Manual Setup | 12.5s | 65s |
| Template Clone | 0.5s | 0.5s |
| Improvement | 25x | 130x |

### CI/CD Impact
- **Before**: 45-minute test suite
- **After**: 15 minutes (10 min template build + 5 min tests)
- **Improvement**: 3x faster overall

### Parallel Testing
Template cloning enables safe parallel test execution:
```typescript
describe.concurrent('Parallel Suite', () => {
  // Each test gets independent database clone
  // No shared state or pollution
});
```

## Best Practices

### Test Selection

1. **Use Shell Tests For:**
   - End-to-end CLI testing
   - Complex multi-step workflows
   - External tool integration
   - Production-like scenarios

2. **Use TypeScript Unit Tests For:**
   - Pure logic validation
   - Utility functions
   - Parser testing
   - No database required

3. **Use TypeScript Integration Tests For:**
   - Database operations
   - Observer pipeline
   - API endpoints
   - Complex queries

4. **Use Template Tests For:**
   - Tests needing realistic data
   - Performance testing
   - Relationship validation
   - Large dataset scenarios

### Writing Effective Tests

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data/tenants
3. **Naming**: Clear, descriptive test names
4. **Coverage**: Test happy path and edge cases
5. **Performance**: Prefer unit tests when possible

### Template Best Practices

1. **Fixture Selection**: Choose minimal fixture for test needs
2. **Regeneration**: Run `npm run test:prepare` after schema changes
3. **Custom Data**: Add test-specific data on top of templates
4. **Mode Selection**: Use safe mode for business logic, unsafe for volume

## Template Database Management

### Template Lifecycle

#### Building Templates
Templates are built from fixture definitions containing schemas and data generators:

```bash
# Build specific template
npm run fixtures:build basic

# Build all templates
npm run fixtures:build

# Force rebuild (clean and rebuild)
npm run fixtures:clean && npm run fixtures:build basic
```

#### Template Storage
Templates are stored as PostgreSQL databases with naming convention:
```
monk-api$test-template-{fixture-name}

Examples:
- monk-api$test-template-basic
- monk-api$test-template-ecommerce  
- monk-api$test-template-performance
```

#### Template Cloning
When tests use templates, PostgreSQL's fast cloning creates test databases:
```
Template DB: monk-api$test-template-basic
     ↓ (PostgreSQL CREATE DATABASE WITH TEMPLATE)
Test DB: monk-api$test-1756132407957-abc123
```

### Cleanup Procedures

#### Automatic Cleanup
The system automatically manages template databases:

```bash
# Remove stale templates
npm run fixtures:clean

# View template status
npm run fixtures:list

# Emergency cleanup (removes all templates)
npm run fixtures:clean
```

#### Manual Cleanup
For troubleshooting or manual maintenance:

```bash
# List all template databases
npm run fixtures:list

# Clean all templates
npm run fixtures:clean

# PostgreSQL direct cleanup (emergency only)
psql -c "DROP DATABASE \"monk-api\$test-template-basic\";"
```

#### Test Database Cleanup
Test databases (cloned from templates) are automatically cleaned:

```typescript
// Automatic cleanup after each test
afterAll(async () => {
  await tenantManager?.cleanup(); // Removes test database
});
```

#### Cleanup Monitoring
Monitor cleanup operations:

```bash
# View available templates
npm run fixtures:list

# Test template system
npm run fixtures:test

# Verify cleanup completed
psql -l | grep "monk-api\$test"
```

### Maintenance Operations

#### Template Health Checks
Regular maintenance commands:

```bash
# Check template compatibility with current schema
npm run fixtures:verify basic

# Test template cloning performance
npm run fixtures:benchmark basic

# Validate template data integrity
npm run fixtures:validate basic
```

#### Schema Change Handling
When schemas change, templates need regeneration:

```bash
# Check if templates need updates
npm run test:prepare

# The system will automatically:
# 1. Detect schema changes via hash comparison
# 2. Regenerate affected templates
# 3. Log regeneration activity
# 4. Validate new templates work
```

#### Storage Management
Template databases consume disk space:

```bash
# Monitor template storage
npm run fixtures:disk-usage

# Typical template sizes:
# - basic: ~50MB (100 records)
# - ecommerce: ~200MB (5,000 records)  
# - performance: ~2GB (50,000+ records)
```

#### Backup and Recovery
Template databases can be backed up:

```bash
# Backup template (PostgreSQL dump)
pg_dump monk-api$test-template-basic > backups/template-basic.sql

# Restore template  
psql -c "CREATE DATABASE \"monk-api\$test-template-basic\";"
psql monk-api$test-template-basic < backups/template-basic.sql
```

### Production Considerations

#### CI/CD Integration
In continuous integration:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    steps:
      - name: Build Templates
        run: npm run fixtures:build-all
      
      - name: Run Tests  
        run: npm run spec:all
        
      - name: Cleanup Templates
        run: npm run fixtures:clean
```

#### PostgreSQL Requirements
Template cloning requires:
- PostgreSQL 12+ (for reliable template support)
- Sufficient disk space (2x dataset size during cloning)
- Database user with CREATEDB privilege
- Shared buffers sized appropriately for template operations

#### Monitoring and Alerts
Production monitoring should track:
- Template build success/failure rates
- Template cloning performance (should be <1s)
- Template storage usage
- Failed cleanup operations
- Schema compatibility issues

## Troubleshooting

### Common Issues

#### Shell Test Failures
```bash
# Check database connectivity
psql -d monk-api-auth -c "SELECT COUNT(*) FROM tenants;"

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

#### Template Issues
```bash
# List available templates
npm run fixtures:list

# Rebuild specific template
npm run fixtures:build basic

# View template databases
psql -l | grep template

# Force regeneration
npm run fixtures:clean && npm run fixtures:build
```

### Debug Commands

```bash
# Shell test debugging
bash -x scripts/test-one.sh spec/failing-test.test.sh

# TypeScript test debugging
npm run spec:ts spec/failing-test.test.ts --verbose

# Template debugging
npm run fixtures:test
```

## Future Enhancements

### Planned Features
1. **Template Composition**: Combine multiple fixtures
2. **Test Data Snapshots**: Version control for test data
3. **Performance Benchmarking**: Track test execution trends
4. **Cloud Template Storage**: Shared template repository
5. **AI-Generated Fixtures**: Smart test data generation

### Phase 5 and Beyond
- Comprehensive fixture library expansion
- Cross-fixture relationship management
- Template versioning system
- Distributed template caching
- Test data analytics

## Summary

The Monk API testing infrastructure provides:

1. **Three complementary test frameworks** for complete coverage
2. **Fast test execution** via template database cloning
3. **Realistic test data** through smart generators
4. **Automatic maintenance** with schema change detection
5. **Developer-friendly** APIs and commands

The template database system (Epic #140) represents a revolutionary advancement in test infrastructure, enabling comprehensive testing with realistic data while maintaining sub-second setup times. This positions Monk API as having best-in-class testing capabilities suitable for enterprise-grade applications.