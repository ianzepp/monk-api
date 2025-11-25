# 50-extracts-app: Data Export Application

**Priority**: NICE TO HAVE
**Coverage**: 0% (No tests implemented - specification only)
**Status**: Complete specification with 90+ planned test cases

## Critical / Smoke Tests

### Missing Critical Tests (5+ for end-to-end workflow)
- POST /api/data/extracts - Create extract configuration
- POST /api/extracts/:id/run - Execute extract operation
- Extract describe.yaml generation and validation
- Extract data JSONL file generation
- GET /api/extracts/runs/:runId/download - Download generated archive

## Additional Tests

### Missing Coverage (85+ test cases planned)

**Configuration Management:**
- CRUD operations for extract configurations via Data API
- Extract list/filter/order operations
- Configuration validation (format, include, retention_days)

**Extract Execution:**
- Describe export functionality (YAML generation, model/field metadata)
- Data export functionality (JSONL generation, batching, filtering)
- Manifest generation (checksums, artifact metadata)
- Progress tracking (0% → 25% → 99% → 100%)
- Run status tracking (queued → running → completed/failed)
- Async execution pattern

**Artifact Management:**
- Artifact creation with storage paths and checksums (SHA256)
- Artifact expiration based on retention_days
- Content-type and file existence validation

**Download Endpoints:**
- ZIP archive download with all artifacts
- Single artifact download
- Download count tracking and access timestamps

**Error Handling:**
- Non-existent model handling
- Database connection errors
- Disk full scenarios
- Permission denied errors

**Edge Cases:**
- Empty datasets (zero records)
- Very large datasets (millions of records)
- Many models (100+)
- Special characters and Unicode data
- Concurrent extracts

**Security:**
- ACL-based model access restriction
- Tenant isolation for artifacts
- Sudo user access controls

**Performance:**
- 1000 records < 5 seconds
- 10,000 records < 30 seconds
- 100,000 records < 5 minutes

**Integration:**
- Round-trip testing (extract → download → verify)
- Manifest validation (JSON structure, checksums)
- YAML format validation (describe.yaml)
- JSONL format validation

## Notes

- Comprehensive specification document with detailed test cases
- All test cases marked with checkboxes (none implemented)
- Includes helper function specifications
- Includes test fixture requirements
- Target: 95%+ code coverage
- Application feature for data backup/export workflows
