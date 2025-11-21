# 32-data-api: Data CRUD Operations

**Priority**: CRITICAL
**Coverage**: 60% (9 of 13 endpoints tested)
**Status**: Good record-level coverage, missing bulk operations

## Critical / Smoke Tests

### Existing Tests (10 total: 9 shell, 1 TypeScript)
- POST /api/data/:schema - Create single record with validation (create-record.test.sh)
- GET /api/data/:schema/:record - Retrieve single record by ID (select-record.test.sh)
- PUT /api/data/:schema/:record - Update single record fields (update-record.test.sh)
- DELETE /api/data/:schema/:record - Soft delete single record (delete-record.test.sh)
- POST /api/data/:schema/:record/:relationship - Add relationship children (create-relationship-post.test.sh)
- PUT /api/data/:schema/:record/:relationship/:child - Update relationship child (update-relationship-post.test.sh)
- DELETE /api/data/:schema/:record/:relationship/:child - Remove relationship child (delete-relationship-post.test.sh)
- System field filtering (_id, _created_at, _updated_at, _deleted_at) (system-field-filtering.test.ts)

### Missing Critical Tests (4)
- GET /api/data/:schema - List all records for schema (bulk retrieval)
- PUT /api/data/:schema - Bulk update with filter (mass updates)
- DELETE /api/data/:schema - Bulk delete with filter (mass deletion)
- GET /api/data/:schema/:record/:relationship - List relationship children

## Additional Tests

### Existing Coverage
- Single record creation with multiple fields
- Bulk record creation (multiple records in one request)
- Relationship management (create, update, delete)
- Array-based relationship removal
- System field behavior

### Missing Coverage
- Bulk operations via schema-level endpoints (critical for data management)
- Pagination for large result sets
- Complex filter conditions for bulk operations
- Transaction rollback on bulk operation failures
- Performance testing with large datasets

## Notes

- Strong coverage for single-record operations
- Relationship handling well-tested
- Missing bulk operations are critical for production data management
- Tests use shell scripts for API validation
- System field filtering has dedicated TypeScript test
