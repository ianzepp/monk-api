# 51-restores-app: Data Import Application

**Priority**: NICE TO HAVE
**Coverage**: 0% (No tests implemented - specification only)
**Status**: Complete specification with 120+ planned test cases

## Critical / Smoke Tests

### Missing Critical Tests (6+ for end-to-end workflow)
- POST /api/data/restores - Create restore configuration
- POST /api/restores/:id/run - Execute restore operation
- POST /api/restores/import - Direct file upload and import
- Describe import (schema/column creation from YAML)
- Data import (JSONL record insertion)
- Conflict strategy handling (replace/upsert/merge/sync/skip/error)

## Additional Tests

### Missing Coverage (115+ test cases planned)

**Configuration Management:**
- CRUD operations for restore configurations via Data API
- Restore list/filter/order operations
- Configuration validation (source_type, conflict_strategy, include)

**Restore Execution:**
- Describe import functionality (schema/column creation, metadata preservation)
- Data import functionality (JSONL parsing, record creation, batching)
- Progress tracking (0% → 25% → 99% → 100%)
- Run status tracking (queued → running → completed/failed)
- Async execution pattern

**Conflict Strategies (6 strategies):**
- **replace**: Delete all existing records before import
- **upsert**: Update existing records by ID, insert new ones
- **merge**: Import data for new schemas only, skip existing
- **sync**: Import records with new IDs, skip existing IDs
- **skip**: Skip records with existing IDs, import new IDs only
- **error**: Fail immediately on first ID conflict

**Direct Import Endpoint:**
- ZIP file upload and processing
- Automatic restore config creation
- File extraction and validation
- Temporary directory cleanup

**Logging:**
- Detailed log entries for each import phase
- Log levels (info, warn, error)
- Log detail field with JSON context
- Queryable logs via Data API

**Error Handling:**
- Invalid YAML/JSON in source files
- Missing schemas (when create_schemas=false)
- Database constraint violations
- Disk full and permission errors
- Corrupted ZIP files

**Edge Cases:**
- Empty datasets (zero records)
- Very large datasets (millions of records)
- Many schemas (100+)
- Special characters and Unicode data
- Concurrent restores
- Duplicate record IDs in same file

**Schema Creation:**
- create_schemas=true: Create new schemas and add columns
- create_schemas=false: Error if schema/column doesn't exist

**Use Case Integration Tests:**
- Dev workflow (export → wipe → restore → verify match)
- Package install (external package → merge with existing tenant)
- Sandbox merge (sandbox changes → sync to parent tenant)

**Security:**
- ACL-based schema access restriction
- Tenant isolation for imports
- Sudo user access controls
- Permission validation (create/update rights)

**Performance:**
- 1000 records < 10 seconds
- 10,000 records < 60 seconds
- 100,000 records < 10 minutes

**Round-Trip:**
- Extract → Restore → Verify data integrity
- Test all PostgreSQL data types (arrays, JSONB, timestamps, etc.)

## Notes

- Comprehensive specification document with detailed test cases
- All test cases marked with checkboxes (none implemented)
- 6 conflict strategies each requiring matrix testing
- Includes helper function specifications
- Includes test fixture requirements (restore-test.zip, restore-invalid.zip, etc.)
- Target: 95%+ code coverage
- Application feature for data restore/import workflows
- Critical for package installation and sandbox merge scenarios
