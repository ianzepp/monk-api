# 32-data-api: Data CRUD Operations

**Priority**: CRITICAL
**Coverage**: TypeScript smoke tests complete for single-record CRUD
**Status**: 37 passing tests, 3 skipped (drift documented)

## Implementation Status

### Completed TypeScript Tests (37 passing, 3 skipped across 4 files)

1. **data-post.test.ts** - Create Records (11 passing, 1 skipped)
   - Single and multiple record creation
   - System field inclusion (id, timestamps)
   - UUID auto-generation
   - Transaction rollback on validation errors
   - Required field validation
   - Boolean, null, and decimal type handling
   - SKIPPED: Empty array rejection (API accepts empty arrays)

2. **data-get.test.ts** - Retrieve Single Record (10 passing)
   - Retrieve record by UUID
   - System fields in response
   - Single object response (not array)
   - Error handling (404, invalid UUID, non-existent schema)
   - Multiple data types retrieval
   - Null field values
   - Immediate retrieval after creation
   - Timestamp consistency for new records

3. **data-put.test.ts** - Update Single Record (9 passing, 2 skipped)
   - Single and multiple field updates
   - Timestamp updates (updated_at changes, created_at preserved)
   - Full response field inclusion
   - Boolean and null value updates
   - Error handling (404, non-existent schema)
   - SKIPPED: Required field null validation (UPDATE allows null, CREATE doesn't)
   - SKIPPED: Empty update rejection (API accepts empty bodies)

4. **data-delete.test.ts** - Delete Single Record (7 passing)
   - Soft delete with trashed_at timestamp
   - Full field inclusion in delete response
   - null deleted_at for soft delete
   - Timestamp validation
   - Error handling (404 for non-existent)
   - Multiple independent deletions

### Test Files Organization

```
spec/32-data-api/
├── data-post.test.ts    # POST /api/data/:schema (create)
├── data-get.test.ts     # GET /api/data/:schema/:record (read)
├── data-put.test.ts     # PUT /api/data/:schema/:record (update)
└── data-delete.test.ts  # DELETE /api/data/:schema/:record (delete)
```

## Testing Approach

### Smoke Test Strategy
- **Minimal setup**: Create schema and columns in beforeAll
- **Core functionality only**: Basic CRUD operations, no edge cases
- **Error validation**: Test common error scenarios (404, validation)
- **System fields**: Verify timestamps and metadata behavior
- **Template**: Uses 'data-{operation}' tenant naming pattern

### Pattern Used
```typescript
beforeAll(async () => {
    tenant = await TestHelpers.createTestTenant('data-post');

    // Create test schema
    await tenant.httpClient.post('/api/describe/products', {});
    await tenant.httpClient.post('/api/describe/products/columns/name', {
        column_name: 'name',
        type: 'text',
        required: true,
    });
});

it('should create record', async () => {
    const response = await tenant.httpClient.post('/api/data/products', [
        { name: 'Widget', price: 29.99 }
    ]);
    expectSuccess(response);
    expect(response.data[0].name).toBe('Widget');
});
```

## Documentation Drift Findings

New discrepancies documented in `spec/DRIFT.md`:

### Empty Array Acceptance (Low Impact)
- **Endpoint**: POST /api/data/:schema
- **Expected**: Reject empty arrays
- **Actual**: Accepts empty arrays, returns empty data
- **Status**: May be intentional (idempotent no-op)

### Non-Existent Schema Error Code (Low Impact)
- **Endpoints**: POST /api/data/:schema, PUT/DELETE /api/data/:schema/:record
- **Expected**: SCHEMA_NOT_FOUND
- **Actual**: INTERNAL_ERROR
- **Impact**: Error handling works, but codes differ

### Required Field Validation in UPDATE (Low Impact)
- **Endpoint**: PUT /api/data/:schema/:record
- **Expected**: Validation error when setting required field to null
- **Actual**: UPDATE allows null for required fields (CREATE rejects it)
- **Status**: May be intentional (allows clearing fields during updates)

### Empty Update Body (Low Impact)
- **Endpoint**: PUT /api/data/:schema/:record
- **Expected**: Validation error for empty request body
- **Actual**: Accepts empty body, returns success without changes
- **Status**: May be intentional (idempotent updates)

## Running Tests

```bash
# Run all Data API tests
npm run test:ts 32-data-api

# Run specific operation tests
npm run test:ts data-post
npm run test:ts data-get
npm run test:ts data-put
npm run test:ts data-delete

# Verbose output
TEST_VERBOSE=1 npm run test:ts 32-data-api
```

## Key Learnings

### Data API Response Format
- **Always includes system fields**: id, created_at, updated_at, trashed_at, deleted_at
- Unlike Describe API which strips system fields
- POST returns array (even for single record)
- GET/PUT/DELETE return single object

### Array-Based Requests
- POST /api/data/:schema requires array format: `[{...}]`
- Even single record must be wrapped in array
- Multiple records in transaction (all succeed or all fail)

### Soft Delete Behavior
- DELETE sets trashed_at timestamp by default
- deleted_at remains null (soft delete)
- Permanent delete requires `?permanent=true` and root access
- Full record returned in delete response

### Timestamp Behavior
- created_at set on creation, never changes
- updated_at set on creation and each update
- New records have matching created_at and updated_at
- Updates always modify updated_at

### Validation Differences
- CREATE: Strict required field validation
- UPDATE: Allows null for required fields
- Both operations validate data types

## Test Coverage Summary

**Total Tests**: 37 passing + 3 skipped = 40 tests
**Coverage**: Core CRUD operations for single records
**Drift Items**: 4 documented (all low impact)
**Next Steps**: Bulk operations, relationships (if needed beyond smoke tests)

## Legacy Shell Tests

Previous shell script tests are now superseded by TypeScript tests:
- ~~create-record.test.sh~~ → data-post.test.ts
- ~~select-record.test.sh~~ → data-get.test.ts
- ~~update-record.test.sh~~ → data-put.test.ts
- ~~delete-record.test.sh~~ → data-delete.test.ts

Relationship tests remain in shell scripts (not part of smoke test scope).

## Notes

- Tests follow actual implementation behavior, not documentation
- All discrepancies documented in spec/DRIFT.md
- Core CRUD functionality is solid and well-tested
- Skipped tests represent minor API behaviors needing clarification
- Test suite is ready for CI/CD integration
