# Restore API Test Specification

Test cases for the Restore API endpoints and functionality.

## Test Structure

Each test case should:
1. Set up test data and extract fixtures
2. Create restore configuration or upload file
3. Execute operation
4. Verify results (schemas created, data imported, logs written)
5. Clean up

## Configuration Management (via Data API)

### Test: create-restore-config.test.sh
**POST /api/data/restores**

Test cases:
- ✅ Create restore with minimal config (name, source_ref)
- ✅ Create restore with full config (all optional fields)
- ✅ Create restore with specific schemas filter
- ✅ Create restore with include=['describe']
- ✅ Create restore with include=['data']
- ✅ Create restore with include=['describe', 'data']
- ✅ Create restore for each conflict strategy
- ✅ Create restore with create_schemas=false
- ❌ Reject invalid source_type
- ❌ Reject invalid conflict_strategy
- ❌ Reject invalid include values
- ❌ Reject missing required fields

### Test: update-restore-config.test.sh
**PUT /api/data/restores/:id**

Test cases:
- ✅ Update restore name
- ✅ Update restore enabled status
- ✅ Update conflict_strategy
- ✅ Update schemas filter
- ✅ Update create_schemas flag
- ❌ Cannot update non-existent restore

### Test: delete-restore-config.test.sh
**DELETE /api/data/restores/:id**

Test cases:
- ✅ Delete restore configuration
- ✅ Verify associated runs are preserved
- ❌ Cannot delete non-existent restore

### Test: list-restores.test.sh
**GET /api/data/restores**

Test cases:
- ✅ List all restores
- ✅ Filter by enabled status
- ✅ Filter by conflict_strategy
- ✅ Order by last_run_at
- ✅ Verify statistics (total_runs, successful_runs, failed_runs)

## Restore Execution

### Test: execute-restore-basic.test.sh
**POST /api/restores/:id/run**

Test cases:
- ✅ Execute restore with describe only
- ✅ Execute restore with data only
- ✅ Execute restore with describe + data
- ✅ Execute restore with schemas filter
- ✅ Verify run record created
- ✅ Verify restore stats updated (total_runs, last_run_id, last_run_at)
- ✅ Verify async execution (returns immediately)
- ❌ Reject if restore disabled
- ❌ Reject if restore not found
- ❌ Reject if source file missing
- ❌ Reject if already running

### Test: execute-restore-describe.test.sh
**Describe Import Functionality**

Test cases:
- ✅ Import creates schemas from describe.yaml
- ✅ Import creates columns from describe.yaml
- ✅ Schema metadata preserved (description, status, etc.)
- ✅ Column metadata preserved (type, required, description, etc.)
- ✅ Schemas filter is respected
- ✅ Log entries created for schema creation
- ✅ Log entries created for column creation
- ✅ schemas_created counter updated
- ✅ columns_created counter updated

### Test: execute-restore-data.test.sh
**Data Import Functionality**

Test cases:
- ✅ Import reads JSONL files correctly
- ✅ Import creates records in target schemas
- ✅ Import handles empty JSONL files
- ✅ Import handles large JSONL files
- ✅ Schemas filter is respected
- ✅ records_imported counter updated
- ✅ Log entries created for data import

### Test: restore-progress-tracking.test.sh
**Progress Updates**

Test cases:
- ✅ Progress starts at 0 when queued
- ✅ Progress updates to 25% after describe import
- ✅ Progress updates during data import (25-99%)
- ✅ Progress reaches 100% when completed
- ✅ progress_detail contains phase information
- ✅ progress_detail shows current_schema during data import
- ✅ progress_detail shows records_imported count

### Test: restore-run-status.test.sh
**Run Status Tracking**

Test cases:
- ✅ Run starts with status 'queued'
- ✅ Status changes to 'running' when execution begins
- ✅ Status changes to 'completed' on success
- ✅ Status changes to 'failed' on error
- ✅ started_at timestamp set when running
- ✅ completed_at timestamp set when done
- ✅ duration_seconds calculated correctly
- ✅ Statistics updated correctly

## Conflict Strategies

### Test: conflict-strategy-replace.test.sh
**Strategy: replace**

Test cases:
- ✅ Delete all existing records before import
- ✅ Import all records from file
- ✅ Verify final record count matches import file
- ✅ Verify existing records were replaced
- ✅ Log entry for deletion phase
- ✅ records_imported counter accurate

### Test: conflict-strategy-upsert.test.sh
**Strategy: upsert**

Test cases:
- ✅ Update existing records (by ID)
- ✅ Insert new records (by ID)
- ✅ Verify existing records updated with new data
- ✅ Verify new records inserted
- ✅ records_updated counter accurate
- ✅ records_imported counter accurate
- ✅ Log entries for both updates and inserts

### Test: conflict-strategy-merge.test.sh
**Strategy: merge**

Test cases:
- ✅ Import data for newly created schemas
- ✅ Skip data for existing schemas
- ✅ Add columns to existing schemas
- ✅ Verify data imported for new schemas only
- ✅ Verify data skipped for existing schemas
- ✅ records_imported counter accurate
- ✅ records_skipped counter accurate
- ✅ Log entries explain skipping behavior

### Test: conflict-strategy-sync.test.sh
**Strategy: sync**

Test cases:
- ✅ Import records with new IDs
- ✅ Skip records with existing IDs
- ✅ Create new schemas and import all data
- ✅ Add columns to existing schemas
- ✅ Verify only new IDs imported
- ✅ Verify existing IDs skipped
- ✅ records_imported counter accurate
- ✅ records_skipped counter accurate
- ✅ Log entries for each skipped record

### Test: conflict-strategy-skip.test.sh
**Strategy: skip**

Test cases:
- ✅ Skip records with existing IDs
- ✅ Import records with new IDs
- ✅ Verify existing records unchanged
- ✅ Verify new records inserted
- ✅ records_imported counter accurate
- ✅ records_skipped counter accurate
- ✅ No error on conflicts

### Test: conflict-strategy-error.test.sh
**Strategy: error**

Test cases:
- ✅ Import succeeds when no conflicts
- ❌ Fail immediately on first conflict
- ✅ Run status set to 'failed'
- ✅ Error message describes conflict
- ✅ Log entry shows which record caused error
- ✅ Partial import preserved for debugging
- ✅ records_imported shows count before error

## Direct Import Endpoint

### Test: import-upload-basic.test.sh
**POST /api/restores/import**

Test cases:
- ✅ Upload ZIP file and execute restore
- ✅ Verify file saved to /tmp/restores/uploads
- ✅ Verify restore config created automatically
- ✅ Verify run started automatically
- ✅ Verify response includes run_id and status_url
- ✅ Default conflict_strategy is 'upsert'
- ✅ Default include is ['describe', 'data']
- ❌ Reject non-multipart request
- ❌ Reject missing file parameter
- ❌ Reject invalid ZIP file

### Test: import-upload-options.test.sh
**POST /api/restores/import - with options**

Test cases:
- ✅ Upload with conflict_strategy=replace
- ✅ Upload with conflict_strategy=merge
- ✅ Upload with conflict_strategy=sync
- ✅ Upload with include=describe
- ✅ Upload with include=data
- ✅ Upload with schemas filter
- ✅ Upload with create_schemas=false
- ✅ Verify all options respected in execution

### Test: import-file-extraction.test.sh
**ZIP File Extraction**

Test cases:
- ✅ Extract ZIP to temporary directory
- ✅ Verify describe.yaml extracted
- ✅ Verify all .jsonl files extracted
- ✅ Verify manifest.json extracted
- ✅ Temporary directory cleaned up after completion
- ✅ Temporary directory cleaned up on error
- ❌ Reject corrupted ZIP file
- ❌ Reject ZIP with missing describe.yaml

## Logging

### Test: restore-logs-basic.test.sh
**Restore Logs Creation**

Test cases:
- ✅ Log entry for upload phase
- ✅ Log entry for validation phase
- ✅ Log entry for describe_import phase
- ✅ Log entry for data_import phase
- ✅ Log entries include run_id
- ✅ Log entries include schema_name when applicable
- ✅ Log entries include record_id when applicable
- ✅ Log entries queryable via Data API

### Test: restore-logs-levels.test.sh
**Log Levels**

Test cases:
- ✅ info level for normal operations
- ✅ warn level for skipped records
- ✅ error level for failures
- ✅ Filter logs by level
- ✅ Filter logs by phase
- ✅ Filter logs by schema_name

### Test: restore-logs-detail.test.sh
**Log Detail Field**

Test cases:
- ✅ Detail field contains additional context
- ✅ Detail field is valid JSON when present
- ✅ Detail field includes error stack traces
- ✅ Detail field includes skip reasons
- ✅ Detail field queryable

## Cancel Restore

### Test: cancel-restore.test.sh
**POST /api/restores/:id/cancel**

Test cases:
- ✅ Cancel running restore
- ✅ Run status set to 'cancelled'
- ✅ completed_at timestamp set
- ✅ Log entry created for cancellation
- ❌ Cannot cancel non-existent restore
- ❌ Cannot cancel if no running job
- ⚠️ Note: Background job may not stop immediately

## Error Handling

### Test: restore-error-handling.test.sh
**Error Scenarios**

Test cases:
- ✅ Handle invalid YAML in describe.yaml
- ✅ Handle invalid JSON in JSONL files
- ✅ Handle missing schema (when create_schemas=false)
- ✅ Handle database constraint violations
- ✅ Handle disk full during file extraction
- ✅ Handle permission denied on temp directory
- ✅ Handle corrupted ZIP file
- ✅ Error message stored in run.error
- ✅ Error detail stored in run.error_detail
- ✅ Run status set to 'failed'
- ✅ Restore failed_runs counter incremented
- ✅ Error logged to restore_logs

## Edge Cases

### Test: restore-edge-cases.test.sh
**Edge Case Scenarios**

Test cases:
- ✅ Restore with zero records (empty JSONL files)
- ✅ Restore with very large dataset (millions of records)
- ✅ Restore with many schemas (100+)
- ✅ Restore with special characters in schema names
- ✅ Restore with Unicode data in records
- ✅ Restore while another restore is running (different configs)
- ✅ Restore with malformed JSONL (missing newlines)
- ✅ Restore with duplicate record IDs in same file
- ✅ Restore after manual deletion of source file

## Schema Creation

### Test: restore-create-schemas.test.sh
**create_schemas Flag Behavior**

Test cases:
- ✅ create_schemas=true: Create new schemas
- ✅ create_schemas=true: Add columns to existing schemas
- ✅ create_schemas=false: Error if schema doesn't exist
- ✅ create_schemas=false: Succeed if schema exists
- ✅ create_schemas=false: Error if column doesn't exist
- ✅ Log entries reflect create_schemas behavior

## Use Case Integration Tests

### Test: use-case-dev-workflow.test.sh
**Dev Workflow: Export → Autoinstall → Restore**

Test cases:
- ✅ Create test schemas and data
- ✅ Execute extract
- ✅ Download ZIP
- ✅ Simulate DB wipe (delete all test schemas)
- ✅ Restore with conflict_strategy=replace
- ✅ Verify schemas recreated
- ✅ Verify data restored
- ✅ Verify data matches original

### Test: use-case-package-install.test.sh
**Package Install: External Package → Existing Tenant**

Test cases:
- ✅ Create existing tenant data
- ✅ Prepare package ZIP (new schemas + seed data)
- ✅ Restore with conflict_strategy=merge
- ✅ Verify new schemas created
- ✅ Verify seed data imported for new schemas
- ✅ Verify existing data preserved
- ✅ Verify no data imported for existing schemas

### Test: use-case-sandbox-merge.test.sh
**Sandbox Merge: Sandbox Changes → Parent**

Test cases:
- ✅ Create parent tenant data
- ✅ Clone to sandbox (simulate)
- ✅ Add new schemas in sandbox
- ✅ Add new columns to existing schemas in sandbox
- ✅ Add training data to sandbox
- ✅ Extract sandbox
- ✅ Restore to parent with conflict_strategy=sync
- ✅ Verify new schemas created in parent
- ✅ Verify new columns added in parent
- ✅ Verify training data imported (new IDs)
- ✅ Verify production data preserved (existing IDs)

## Round-Trip Integration

### Test: restore-round-trip.test.sh
**Extract → Restore Round Trip**

Test cases:
- ✅ Create test schemas with various column types
- ✅ Insert test data with edge cases (nulls, arrays, JSON, etc.)
- ✅ Execute extract
- ✅ Download ZIP
- ✅ Delete all test data
- ✅ Restore with conflict_strategy=replace
- ✅ Verify schemas match original
- ✅ Verify data matches original (deep equality)
- ✅ Verify special types preserved (arrays, JSONB, timestamps, etc.)

## Security & Permissions

### Test: restore-permissions.test.sh
**ACL and Permission Tests**

Test cases:
- ✅ User can only restore to schemas they have access to
- ✅ Cannot restore to another tenant
- ✅ Sudo users can restore anywhere
- ✅ Restore respects create permissions
- ✅ Restore respects update permissions (for upsert)

## Performance

### Test: restore-performance.test.sh
**Performance Benchmarks** (optional)

Test cases:
- ⏱️ Restore 1000 records completes in < 10 seconds
- ⏱️ Restore 10,000 records completes in < 60 seconds
- ⏱️ Restore 100,000 records completes in < 10 minutes
- ⏱️ File extraction is efficient (no memory issues)
- ⏱️ Progress updates don't slow down execution significantly

## Test Utilities Needed

Create helper functions in `spec/helpers/restore-helpers.sh`:
- `create_test_restore()` - Create restore config
- `upload_and_import()` - Upload file and execute import
- `execute_and_wait()` - Execute restore and poll until complete
- `verify_restore_run()` - Verify run record state
- `verify_logs()` - Verify log entries
- `verify_data_imported()` - Compare imported data to expected
- `create_test_zip()` - Create test ZIP from fixtures
- `cleanup_restores()` - Clean up test data

## Test Data Fixtures

Create test fixtures in `spec/fixtures/`:
- `restore-test.zip` - Sample extract archive for testing
- `restore-minimal.zip` - Minimal valid archive (describe only)
- `restore-large.zip` - Large dataset for performance testing
- `restore-invalid.zip` - Corrupted archive for error testing
- `restore-empty.zip` - Empty archive (no files)
- `restore-partial.zip` - Archive missing describe.yaml

## Conflict Strategy Test Matrix

Each conflict strategy should be tested with:
- ✅ Empty target database (no conflicts)
- ✅ Partially populated database (some conflicts)
- ✅ Fully populated database (all conflicts)
- ✅ New schemas in archive
- ✅ Existing schemas in database
- ✅ Mixed (some new, some existing)

## Coverage Goals

- ✅ All endpoints have basic success tests
- ✅ All endpoints have error condition tests
- ✅ All conflict strategies thoroughly tested
- ✅ All configuration options tested
- ✅ All import phases tested (upload, validation, describe, data)
- ✅ Logging verified for all operations
- ✅ Progress tracking verified
- ✅ Error handling tested
- ✅ Edge cases covered
- ✅ All three use cases validated (dev, package, sandbox)
- ✅ Round-trip integration test passes
- ✅ Security/permissions verified

Target: 95%+ code coverage for Restore API

## Test Execution Order

Recommended order for implementing tests:
1. Configuration management (CRUD)
2. Basic execution (run, cancel)
3. Direct import endpoint
4. Conflict strategy: replace (simplest)
5. Conflict strategy: upsert
6. Conflict strategy: skip
7. Conflict strategy: error
8. Conflict strategy: merge
9. Conflict strategy: sync (most complex)
10. Logging tests
11. Error handling
12. Edge cases
13. Use case integration tests
14. Round-trip test
15. Performance tests (optional)
