# 31-describe-api: Schema Management API

**Priority**: CRITICAL
**Coverage**: 100% (Complete)
**Status**: GOLD STANDARD - Comprehensive test coverage

## Critical / Smoke Tests

### Existing Tests (109 total across 9 TypeScript files)
- GET /api/describe - List all schemas (5 tests)
- POST /api/describe/:schema - Create schema with flags (sudo/frozen/immutable) (13 tests)
- GET /api/describe/:schema - Retrieve schema definition (10 tests)
- PUT /api/describe/:schema - Update schema metadata (12 tests)
- DELETE /api/describe/:schema - Delete schema (11 tests)
- POST /api/describe/:schema/columns/:column - Create columns with all data types and constraints (22 tests)
- GET /api/describe/:schema/columns/:column - Retrieve column definition (9 tests)
- PUT /api/describe/:schema/columns/:column - Update column properties (16 tests)
- DELETE /api/describe/:schema/columns/:column - Delete column (11 tests)

## Additional Tests

### Comprehensive Coverage Includes
- All PostgreSQL data types (text, integer, boolean, json, jsonb, timestamp, uuid, etc.)
- Column constraints (NOT NULL, UNIQUE, DEFAULT values, CHECK constraints)
- Foreign key relationships and cascades
- Schema flags (sudo, frozen, immutable, system)
- Validation and error handling for invalid schema names
- Force override mechanisms
- System field handling (_id, _created_at, _updated_at, _deleted_at)

## Notes

- This is the best-tested component in the entire API
- Well-documented with README.test.md
- Tests use TypeScript/Vitest for comprehensive validation
- Covers all CRUD operations for both schemas and columns
- Excellent error handling and edge case coverage
- No missing tests identified
