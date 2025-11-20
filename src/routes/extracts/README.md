# Extract API

The Extract API provides data export functionality with background job processing.

## Architecture

```
extracts              → Extract configurations (via Data API)
  └─ extract_runs     → Individual executions
       └─ extract_artifacts → Generated files
```

## Endpoints

### Configuration Management (Data API)

```bash
# Create extract config
POST /api/data/extracts
{
  "name": "Daily Backup",
  "format": "jsonl",
  "include": ["describe", "data"],
  "schemas": ["users", "orders"],
  "retention_days": 7
}

# List extracts
GET /api/data/extracts

# Get extract
GET /api/data/extracts/:id

# Update extract
PUT /api/data/extracts/:id

# Delete extract
DELETE /api/data/extracts/:id
```

### Execution

```bash
# Execute extract
POST /api/extracts/:id/run
→ Returns: { run_id, message, status_url }

# Cancel running extract
POST /api/extracts/:id/cancel

# Check status
GET /api/data/extract_runs/:runId
→ Returns: { status, progress, progress_detail, ... }
```

### Downloads

```bash
# Download all artifacts (ZIP)
GET /api/extracts/runs/:runId/download

# Download single artifact
GET /api/extracts/artifacts/:artifactId/download
```

## Usage Example

```bash
# 1. Create extract configuration
curl -X POST http://localhost:9001/api/data/extracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Full Export",
    "format": "jsonl",
    "include": ["describe", "data"],
    "retention_days": 7,
    "enabled": true
  }'

# Response:
{
  "success": true,
  "data": {
    "id": "extract_abc123",
    "name": "Full Export",
    ...
  }
}

# 2. Execute extract
curl -X POST http://localhost:9001/api/extracts/extract_abc123/run \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "success": true,
  "data": {
    "run_id": "run_xyz789",
    "message": "Extract queued for execution",
    "status_url": "/api/data/extract_runs/run_xyz789"
  }
}

# 3. Poll for completion
curl http://localhost:9001/api/data/extract_runs/run_xyz789 \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "success": true,
  "data": {
    "id": "run_xyz789",
    "status": "running",
    "progress": 45,
    "progress_detail": {
      "phase": "exporting_data",
      "schemas_completed": 5,
      "schemas_total": 10,
      "records_exported": 12500
    },
    ...
  }
}

# 4. Download when complete
curl -O http://localhost:9001/api/extracts/runs/run_xyz789/download \
  -H "Authorization: Bearer $TOKEN"

# Downloads: Full-Export-2025-01-19-run_xyz7.zip
```

## Extract Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Human-readable name |
| `description` | string | null | Optional notes |
| `format` | string | 'jsonl' | Output format: yaml, json, jsonl, archive |
| `include` | array | ['describe', 'data'] | What to export |
| `schemas` | array | null | Specific schemas (null = all) |
| `filter` | object | null | Per-schema filters (future) |
| `compress` | boolean | true | Gzip output (future) |
| `split_files` | boolean | false | One file per schema (future) |
| `schedule` | string | null | Cron expression (future) |
| `schedule_enabled` | boolean | false | Enable scheduling (future) |
| `retention_days` | number | 7 | How long to keep artifacts |
| `enabled` | boolean | true | Can this extract be executed |

## Run Statuses

- `pending` - Created but not started
- `queued` - Waiting to execute
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Execution failed
- `cancelled` - Manually cancelled

## Artifacts

Each run generates multiple artifacts:

1. **describe.yaml** - Schema + column definitions (if include=['describe'])
2. **{schema}.jsonl** - Data for each schema (if include=['data'])
3. **manifest.json** - Metadata about all artifacts

All artifacts include:
- SHA256 checksum for integrity verification
- Expiration date based on retention_days
- Download count and last access tracking

## Progress Tracking

The `progress_detail` field provides real-time status:

```json
{
  "phase": "exporting_data",
  "schemas_total": 10,
  "schemas_completed": 7,
  "current_schema": "orders",
  "records_exported": 25000
}
```

Phases:
- `exported_describe` - Metadata export complete
- `exporting_data` - Currently exporting records

## Implementation Status

**Phase 1 (Current):**
- ✅ Execute extract on-demand
- ✅ Export describe metadata (YAML)
- ✅ Export data (JSONL)
- ✅ Local file storage (/tmp/extracts)
- ✅ Progress tracking
- ✅ Download endpoints
- ✅ Artifact checksums
- ✅ Expiration dates

**Phase 2 (Future):**
- ⏳ Scheduling (cron)
- ⏳ Cloud storage (S3, GCS)
- ⏳ Compression (gzip)
- ⏳ Split files (one per schema)
- ⏳ Retry logic
- ⏳ Artifact cleanup job

## Storage

Artifacts are currently stored at:
```
/tmp/extracts/{run_id}/
  ├── describe.yaml
  ├── users.jsonl
  ├── orders.jsonl
  └── manifest.json
```

The `extract_artifacts` table tracks:
- Storage path
- Storage backend (currently 'local')
- File metadata (size, checksum, content-type)
- Lifecycle (created, accessed, expires)

## Error Handling

Errors during extraction:
- Update run status to 'failed'
- Store error message and stack trace
- Increment extract's failed_runs counter
- Preserve partial artifacts for debugging

Common errors:
- Extract disabled
- Already running
- Schema not found
- Disk space
- Permission issues
