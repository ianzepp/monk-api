# Extract API Test Specification

Test cases for the Extract API endpoints and functionality.

## Test Structure

Each test case should:
1. Set up test data (schemas, columns, records)
2. Create extract configuration
3. Execute operation
4. Verify results
5. Clean up

## Configuration Management (via Data API)

### Test: create-extract-config.test.sh
**POST /api/data/extracts**

Test cases:
- ✅ Create extract with minimal config (name only)
- ✅ Create extract with full config (all optional fields)
- ✅ Create extract with specific schemas filter
- ✅ Create extract with include=['describe']
- ✅ Create extract with include=['data']
- ✅ Create extract with include=['describe', 'data']
- ❌ Reject invalid format (not yaml/json/jsonl/archive)
- ❌ Reject invalid include values
- ❌ Reject invalid retention_days (negative, > 365)
- ❌ Reject missing required field (name)

### Test: update-extract-config.test.sh
**PUT /api/data/extracts/:id**

Test cases:
- ✅ Update extract name
- ✅ Update extract enabled status
- ✅ Update schemas filter
- ✅ Update retention_days
- ❌ Cannot update non-existent extract

### Test: delete-extract-config.test.sh
**DELETE /api/data/extracts/:id**

Test cases:
- ✅ Delete extract configuration
- ✅ Verify associated runs are preserved (soft delete behavior)
- ❌ Cannot delete non-existent extract

### Test: list-extracts.test.sh
**GET /api/data/extracts**

Test cases:
- ✅ List all extracts
- ✅ Filter by enabled status
- ✅ Order by last_run_at
- ✅ Verify statistics (total_runs, successful_runs, failed_runs)

## Extract Execution

### Test: execute-extract-basic.test.sh
**POST /api/extracts/:id/run**

Test cases:
- ✅ Execute extract with describe only
- ✅ Execute extract with data only
- ✅ Execute extract with describe + data
- ✅ Execute extract with schemas filter
- ✅ Verify run record created
- ✅ Verify extract stats updated (total_runs, last_run_id, last_run_at)
- ✅ Verify async execution (returns immediately)
- ❌ Reject if extract disabled
- ❌ Reject if extract not found
- ❌ Reject if already running

### Test: execute-extract-describe.test.sh
**Describe Export Functionality**

Test cases:
- ✅ Export creates describe.yaml
- ✅ YAML contains all schemas
- ✅ YAML contains all columns per schema
- ✅ YAML structure is hierarchical (schemas -> columns)
- ✅ System fields are stripped from output
- ✅ Schemas filter is respected
- ✅ Artifact record created with correct metadata

### Test: execute-extract-data.test.sh
**Data Export Functionality**

Test cases:
- ✅ Export creates {schema}.jsonl for each schema
- ✅ JSONL contains all records
- ✅ JSONL format is valid (one JSON object per line)
- ✅ Records contain all fields
- ✅ Schemas filter is respected
- ✅ Empty schemas create empty .jsonl files
- ✅ Large datasets handled with batching (1000 records at a time)
- ✅ Artifact records created for each schema file

### Test: execute-extract-manifest.test.sh
**Manifest Generation**

Test cases:
- ✅ Manifest.json created
- ✅ Manifest contains version, generated_at, run_id, extract_id
- ✅ Manifest.artifacts lists all generated files
- ✅ Each artifact entry has type, name, size, checksum, records
- ✅ Checksums are SHA256 and match actual files

### Test: extract-progress-tracking.test.sh
**Progress Updates**

Test cases:
- ✅ Progress starts at 0 when queued
- ✅ Progress updates to 25% after describe export
- ✅ Progress updates during data export (25-99%)
- ✅ Progress reaches 100% when completed
- ✅ progress_detail contains phase information
- ✅ progress_detail shows current_schema during data export
- ✅ progress_detail shows records_exported count

### Test: extract-run-status.test.sh
**Run Status Tracking**

Test cases:
- ✅ Run starts with status 'queued'
- ✅ Status changes to 'running' when execution begins
- ✅ Status changes to 'completed' on success
- ✅ Status changes to 'failed' on error
- ✅ started_at timestamp set when running
- ✅ completed_at timestamp set when done
- ✅ duration_seconds calculated correctly
- ✅ Statistics updated (records_exported, schemas_exported, artifacts_created)

### Test: extract-artifacts.test.sh
**Artifact Management**

Test cases:
- ✅ Artifacts created with correct storage_path
- ✅ Artifacts have SHA256 checksums
- ✅ Artifacts have correct content_type
- ✅ Artifacts have expires_at based on retention_days
- ✅ Artifact files exist on disk at storage_path
- ✅ Artifact checksums match file contents
- ✅ is_primary flag set correctly

### Test: cancel-extract.test.sh
**POST /api/extracts/:id/cancel**

Test cases:
- ✅ Cancel running extract
- ✅ Run status set to 'cancelled'
- ✅ completed_at timestamp set
- ❌ Cannot cancel non-existent extract
- ❌ Cannot cancel if no running job

## Download Endpoints

### Test: download-run-archive.test.sh
**GET /api/extracts/runs/:runId/download**

Test cases:
- ✅ Download ZIP archive of all artifacts
- ✅ ZIP contains describe.yaml
- ✅ ZIP contains all {schema}.jsonl files
- ✅ ZIP contains manifest.json
- ✅ ZIP filename format: {ExtractName}-{date}-{runId}.zip
- ✅ Content-Type: application/zip
- ✅ Content-Disposition header set
- ❌ Cannot download non-existent run
- ❌ Cannot download incomplete run (status != 'completed')
- ❌ Cannot download expired run (artifacts expired)

### Test: download-single-artifact.test.sh
**GET /api/extracts/artifacts/:artifactId/download**

Test cases:
- ✅ Download single artifact file
- ✅ Content-Type matches artifact type
- ✅ Content-Disposition header set with filename
- ✅ Content-Length header set
- ✅ X-Checksum-SHA256 header set
- ✅ File content matches storage_path
- ✅ download_count incremented
- ✅ accessed_at timestamp updated
- ❌ Cannot download non-existent artifact
- ❌ Cannot download expired artifact
- ❌ Cannot download if file missing from disk

## Error Handling

### Test: extract-error-handling.test.sh
**Error Scenarios**

Test cases:
- ✅ Handle non-existent schema in filter gracefully
- ✅ Handle database connection error during export
- ✅ Handle disk full error during file write
- ✅ Handle permission denied on storage directory
- ✅ Error message stored in run.error
- ✅ Error detail stored in run.error_detail
- ✅ Run status set to 'failed'
- ✅ Extract failed_runs counter incremented

## Edge Cases

### Test: extract-edge-cases.test.sh
**Edge Case Scenarios**

Test cases:
- ✅ Extract with zero records (empty schemas)
- ✅ Extract with very large dataset (millions of records)
- ✅ Extract with many schemas (100+)
- ✅ Extract with special characters in schema names
- ✅ Extract with Unicode data in records
- ✅ Extract while another extract is running (different configs)
- ✅ Extract with system schemas (should skip schemas/columns)
- ✅ Extract after manual deletion of artifact files

## Security & Permissions

### Test: extract-permissions.test.sh
**ACL and Permission Tests**

Test cases:
- ✅ User can only extract schemas they have access to
- ✅ Downloaded artifacts respect ACLs
- ✅ Cannot access another tenant's extract artifacts
- ✅ Sudo users can access all extracts

## Performance

### Test: extract-performance.test.sh
**Performance Benchmarks** (optional)

Test cases:
- ⏱️ Extract 1000 records completes in < 5 seconds
- ⏱️ Extract 10,000 records completes in < 30 seconds
- ⏱️ Extract 100,000 records completes in < 5 minutes
- ⏱️ Batching prevents memory exhaustion on large datasets
- ⏱️ Progress updates don't slow down execution significantly

## Integration Tests

### Test: extract-round-trip.test.sh
**End-to-End Workflow**

Test cases:
- ✅ Create schemas with columns
- ✅ Insert test data
- ✅ Create extract config
- ✅ Execute extract
- ✅ Wait for completion
- ✅ Download ZIP
- ✅ Verify ZIP contents
- ✅ Verify describe.yaml is valid YAML
- ✅ Verify data files are valid JSONL
- ✅ Verify manifest is valid JSON
- ✅ Verify checksums match

## Test Utilities Needed

Create helper functions in `spec/helpers/extract-helpers.sh`:
- `create_test_extract()` - Create extract config
- `execute_and_wait()` - Execute extract and poll until complete
- `verify_extract_run()` - Verify run record state
- `verify_artifacts()` - Verify artifact files and metadata
- `download_and_extract_zip()` - Download and unzip archive
- `validate_describe_yaml()` - Parse and validate describe.yaml
- `validate_jsonl_file()` - Validate JSONL format
- `cleanup_extracts()` - Clean up test data

## Test Data Fixtures

Create test fixtures in `spec/fixtures/`:
- `test-schemas.json` - Sample schema definitions
- `test-data.jsonl` - Sample data records
- `expected-describe.yaml` - Expected describe output
- `expected-manifest.json` - Expected manifest structure

## Coverage Goals

- ✅ All endpoints have basic success tests
- ✅ All endpoints have error condition tests
- ✅ All configuration options tested
- ✅ All export formats tested (describe, data, manifest)
- ✅ Progress tracking verified
- ✅ Artifact lifecycle tested
- ✅ Download endpoints tested
- ✅ Error handling tested
- ✅ Edge cases covered
- ✅ Round-trip integration test passes

Target: 95%+ code coverage for Extract API
