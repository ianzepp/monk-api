# Describe API Tests (TypeScript/Vitest)

Comprehensive test suite for the Describe API endpoints. Each test file focuses on a single endpoint with thorough coverage of success and error cases.

## Test Files

### Schema Operations

| File | Endpoint | Tests | Description |
|------|----------|-------|-------------|
| `list-schemas.test.ts` | `GET /api/describe` | 5 | List all schema names in tenant |
| `create-schema.test.ts` | `POST /api/describe/:schema` | 13 | Create schema (metadata only) |
| `get-schema.test.ts` | `GET /api/describe/:schema` | 10 | Retrieve schema details |
| `update-schema.test.ts` | `PUT /api/describe/:schema` | 12 | Update schema metadata |
| `delete-schema.test.ts` | `DELETE /api/describe/:schema` | 11 | Soft-delete schema |

### Column Operations

| File | Endpoint | Tests | Description |
|------|----------|-------|-------------|
| `create-column.test.ts` | `POST /api/describe/:schema/:column` | 22 | Add column to schema |
| `get-column.test.ts` | `GET /api/describe/:schema/:column` | 9 | Retrieve column details |
| `update-column.test.ts` | `PUT /api/describe/:schema/:column` | 16 | Update column properties |
| `delete-column.test.ts` | `DELETE /api/describe/:schema/:column` | 11 | Delete column (hard delete) |

**Total: 109 tests across 9 endpoints**

## Running Tests

```bash
# Run all Describe API tests
npm run test:ts 31

# Run specific test file
npm run test:ts 31-describe-api/create-schema.test.ts

# Run with verbose output
npm run test:ts 31 -- --reporter=verbose
```

## Test Architecture

### Template Strategy

All tests use the **'system' template** which includes:
- System schemas (schemas, columns, users, acls)
- Root user with full permissions
- No pre-populated test data

This approach:
- Requires no fixture setup
- Provides predictable baseline
- Creates isolated test data per test

### Test Pattern

Each test file follows this structure:

```typescript
describe('Endpoint Name', () => {
    let tenant: TestTenant;

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('test-name');
        // Create any prerequisite data
    });

    afterAll(async () => {
        await TestHelpers.cleanupTestTenant(tenant.tenantName);
    });

    it('should test specific behavior', async () => {
        const response = await tenant.httpClient.post('/api/endpoint', {});
        expectSuccess(response);
    });
});
```

### Test Scope

Tests focus on **API validation**, not individual flags:
- Request/response structure
- Success/error conditions
- Basic constraint validation
- State management (create → read → update → delete)

Tests intentionally do NOT exhaustively test:
- Every combination of schema/column flags
- Deep validation rules
- Complex relationships
- Performance characteristics

## Test Coverage

### Schema Operations

**Create Schema** (`create-schema.test.ts`):
- Minimal field creation
- Status values
- Protection flags (sudo, freeze, immutable)
- Duplicate rejection
- Mismatch validation
- Force parameter

**Get Schema** (`get-schema.test.ts`):
- Metadata retrieval
- System field filtering
- System schema access
- Trashed schema handling
- 404 for missing schemas

**Update Schema** (`update-schema.test.ts`):
- Status updates
- Protection flag updates
- Multiple field updates
- Empty update rejection
- System schema protection

**Delete Schema** (`delete-schema.test.ts`):
- Soft delete behavior
- Listing removal
- Retrieval prevention
- System schema protection
- Double-delete handling

**List Schemas** (`list-schemas.test.ts`):
- Array response format
- System schema inclusion
- Custom schema visibility
- Trashed schema exclusion

### Column Operations

**Create Column** (`create-column.test.ts`):
- All data types (text, integer, decimal, boolean, timestamp, date, uuid, jsonb)
- Array types
- Constraints (required, unique, default)
- Validation (pattern, min/max, enum)
- Indexes (index, searchable)
- Protection (immutable, sudo)
- Features (tracked, transform)
- Duplicate rejection

**Get Column** (`get-column.test.ts`):
- Column metadata retrieval
- Type information
- Constraint flags
- Validation rules
- System column access
- 404 handling

**Update Column** (`update-column.test.ts`):
- Metadata updates (description, pattern, min/max, enum)
- Protection flags (immutable, sudo, tracked)
- Transform updates
- Structural updates (required, default)
- Multiple field updates
- Empty update rejection

**Delete Column** (`delete-column.test.ts`):
- Hard delete behavior
- Retrieval prevention
- Various column types
- Required column deletion
- Constraint column deletion
- Double-delete handling

## API Changes Reflected

These tests reflect the **new Describe API architecture**:

1. **Schema creation is metadata-only** - No columns array accepted
2. **Columns added individually** - Sequential POST requests per column
3. **System fields filtered** - No id, timestamps, access_* in responses
4. **Column-name from URL** - Not from request body
5. **Soft delete for schemas** - Marked as trashed, not hard deleted
6. **Hard delete for columns** - DROP COLUMN from PostgreSQL

## Notes

- Tests use AuthClient for automatic JWT caching
- Each test creates isolated tenant on port 9002
- Tests are independent and can run in any order
- Global cleanup handles all test tenants
- No shell tests used - pure TypeScript/vitest

## Related Documentation

- **API Docs**: `src/routes/api/describe/PUBLIC.md`
- **Test Framework**: `spec/README.md`
- **Shell Tests**: `spec/31-describe-api/*.test.sh` (legacy, not used)
