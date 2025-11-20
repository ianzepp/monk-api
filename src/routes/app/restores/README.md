# Restore API

The Restore API provides data import functionality with background job processing and multiple conflict resolution strategies.

## TODO: Migrate to App Endpoint

**Future Migration:** This API should be moved from `/api/restores/*` to `/app/restores/*` as part of a broader initiative to separate specialized application endpoints from standard REST API endpoints. The `/app` path will host application-specific functionality (grids, extracts, restores) while `/api` remains focused on core data/schema operations.

**Target Path:** `/app/restores/:id/*`
**Rationale:** Restore API is an application-level feature (background jobs, file processing) rather than a direct data model operation, making it a better fit for the `/app` namespace.

## Architecture

```
restores              → Restore configurations (via Data API)
  └─ restore_runs     → Individual executions
       └─ restore_logs → Detailed log entries
```

## Endpoints

### Configuration Management (Data API)

```bash
# Create restore config
POST /api/data/restores
{
  "name": "Production Restore",
  "source_type": "upload",
  "source_ref": "/tmp/restores/uploads/abc123.zip",
  "conflict_strategy": "upsert",
  "include": ["describe", "data"],
  "schemas": ["users", "orders"],
  "create_schemas": true
}

# List restores
GET /api/data/restores

# Get restore
GET /api/data/restores/:id

# Update restore
PUT /api/data/restores/:id

# Delete restore
DELETE /api/data/restores/:id
```

### Execution

```bash
# Execute restore
POST /api/restores/:id/run
→ Returns: { run_id, message, status_url }

# Cancel running restore
POST /api/restores/:id/cancel

# Check status
GET /api/data/restore_runs/:runId
→ Returns: { status, progress, progress_detail, ... }

# Query logs
GET /api/data/restore_logs?filter[where][run_id]=run_xyz
→ Returns: [{ level, message, phase, schema_name, ... }]
```

### Direct Import

```bash
# Upload and run in one step
POST /api/restores/import
Content-Type: multipart/form-data

file: [ZIP file from extract]
conflict_strategy: upsert (optional)
include: describe,data (optional)
schemas: users,orders (optional)
create_schemas: true (optional)
```

## Usage Example

### Dev Workflow (Upload + Import)

```bash
# Before breaking changes: export
curl -X POST http://localhost:9001/api/extracts/my_extract/run
curl -O http://localhost:9001/api/extracts/runs/run_xyz/download
# Saved: Dev-Data-2025-01-19.zip

# After autoinstall: import
curl -X POST http://localhost:9001/api/restores/import \
  -F "file=@Dev-Data-2025-01-19.zip" \
  -F "conflict_strategy=replace"

# Response:
{
  "success": true,
  "data": {
    "run_id": "run_abc123",
    "message": "Restore queued for execution",
    "status_url": "/api/data/restore_runs/run_abc123"
  }
}
```

### Package Install (Multi-step)

```bash
# 1. Create restore configuration
curl -X POST http://localhost:9001/api/data/restores \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Install Slack Package",
    "source_type": "upload",
    "source_ref": "/path/to/monk-slack-v1.0.0.zip",
    "conflict_strategy": "merge",
    "create_schemas": true
  }'

# Response:
{
  "success": true,
  "data": {
    "id": "restore_def456",
    "name": "Install Slack Package",
    ...
  }
}

# 2. Execute restore
curl -X POST http://localhost:9001/api/restores/restore_def456/run \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "success": true,
  "data": {
    "run_id": "run_ghi789",
    "message": "Restore queued for execution",
    "status_url": "/api/data/restore_runs/run_ghi789"
  }
}

# 3. Poll for completion
curl http://localhost:9001/api/data/restore_runs/run_ghi789 \
  -H "Authorization: Bearer $TOKEN"

# Response (while running):
{
  "success": true,
  "data": {
    "id": "run_ghi789",
    "status": "running",
    "progress": 45,
    "progress_detail": {
      "phase": "importing_data",
      "files_completed": 5,
      "files_total": 10,
      "records_imported": 12500
    },
    ...
  }
}

# Response (when complete):
{
  "success": true,
  "data": {
    "id": "run_ghi789",
    "status": "completed",
    "progress": 100,
    "schemas_created": 3,
    "columns_created": 24,
    "records_imported": 50000,
    "records_skipped": 0,
    "duration_seconds": 12
  }
}
```

## Restore Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Human-readable name |
| `description` | string | null | Optional notes |
| `source_type` | string | 'upload' | Source type: upload, extract_run, url |
| `source_ref` | string | null | File path, run ID, or URL |
| `conflict_strategy` | string | 'upsert' | How to handle conflicts |
| `include` | array | ['describe', 'data'] | What to restore |
| `schemas` | array | null | Specific schemas (null = all) |
| `create_schemas` | boolean | true | Allow creating new schemas |
| `enabled` | boolean | true | Can this restore be executed |

## Conflict Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| **replace** | Delete all existing data, import fresh | Dev restore (fresh DB) |
| **upsert** | Update existing records, insert new | Dev restore (existing DB) |
| **merge** | Create new schemas, import only for new schemas | Package install |
| **sync** | Create new schemas, import only new record IDs | Sandbox → Parent |
| **skip** | Skip existing records silently | Best-effort import |
| **error** | Fail on any conflict | Strict validation |

### Strategy Details

**replace:**
```typescript
// Delete all records in target schemas
await db.deleteMany(schema, {});
// Import all records
for (const record of records) {
    await db.createOne(schema, record);
}
```

**upsert:**
```typescript
// Update or insert each record
for (const record of records) {
    if (exists(record.id)) {
        await db.updateOne(schema, record.id, record);
    } else {
        await db.createOne(schema, record);
    }
}
```

**merge:**
```typescript
// Only import data for newly created schemas
if (schemaWasCreatedInThisRun) {
    for (const record of records) {
        await db.createOne(schema, record);
    }
} else {
    // Skip all data for existing schemas
}
```

**sync:**
```typescript
// Only import records with new IDs
for (const record of records) {
    if (!existsInParent(record.id)) {
        await db.createOne(schema, record);
    } else {
        // Skip existing record
    }
}
```

## Run Statuses

- `pending` - Created but not started
- `queued` - Waiting to execute
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Execution failed
- `cancelled` - Manually cancelled

## Logs

Restore logs provide detailed execution tracking:

```bash
GET /api/data/restore_logs?filter[where][run_id]=run_ghi789

# Response:
[
  {
    "id": "log_001",
    "run_id": "run_ghi789",
    "level": "info",
    "phase": "describe_import",
    "schema_name": "channels",
    "message": "Created schema",
    "created_at": "2025-01-19T10:00:01Z"
  },
  {
    "id": "log_002",
    "level": "info",
    "phase": "data_import",
    "schema_name": "channels",
    "record_id": "ch_001",
    "message": "Skipped existing record (sync strategy)",
    "created_at": "2025-01-19T10:00:05Z"
  }
]
```

### Log Levels

- `info` - Normal operations
- `warn` - Non-critical issues
- `error` - Failures and problems

### Log Phases

- `upload` - File extraction
- `validation` - File structure validation
- `describe_import` - Schema/column creation
- `data_import` - Record insertion

## Progress Tracking

The `progress_detail` field provides real-time status:

```json
{
  "phase": "importing_data",
  "files_total": 10,
  "files_completed": 7,
  "current_schema": "orders",
  "records_imported": 25000,
  "records_skipped": 150
}
```

## Implementation Status

**Phase 1 (Current):**
- ✅ Execute restore on-demand
- ✅ Upload and extract ZIP files
- ✅ Import describe metadata (schemas + columns)
- ✅ Import data with all conflict strategies
- ✅ Local file storage (/tmp/restores)
- ✅ Progress tracking
- ✅ Detailed logging
- ✅ Direct import endpoint

**Phase 2 (Future):**
- ⏳ Download from URL (package install from GitHub)
- ⏳ Dry run / validation mode
- ⏳ Rollback support
- ⏳ Schema migration scripts
- ⏳ Dependency resolution (package A requires package B)

## Storage

Uploaded files are temporarily stored at:
```
/tmp/restores/uploads/
  └── {upload_id}.zip

/tmp/restores/{run_id}/
  ├── describe.yaml
  ├── users.jsonl
  ├── orders.jsonl
  └── manifest.json
```

Files are cleaned up after processing completes.

## Error Handling

Errors during restoration:
- Update run status to 'failed'
- Store error message and stack trace
- Increment restore's failed_runs counter
- Log error to restore_logs
- Preserve partial state for debugging

Common errors:
- Invalid ZIP file
- Missing describe.yaml or data files
- Schema doesn't exist (when create_schemas=false)
- Record conflicts (when conflict_strategy=error)
- Permission issues

Query failed runs:
```bash
GET /api/data/restore_runs?filter[where][status]=failed
```

## Use Cases

### 1. Dev Workflow (Database Reset)

Export before breaking changes, restore after autoinstall:
```bash
# Export → /tmp/my-dev-data.zip
curl -X POST /api/extracts/my_dev/run
curl -O /api/extracts/runs/run_xyz/download

# Autoinstall (nukes DB)
./scripts/autoinstall.sh

# Restore
curl -X POST /api/restores/import \
  -F "file=@my-dev-data.zip" \
  -F "conflict_strategy=replace"
```

### 2. Package Installation

Install external package into existing tenant:
```bash
curl -X POST /api/restores/import \
  -F "file=@monk-slack-v1.0.0.zip" \
  -F "conflict_strategy=merge"
```

### 3. Sandbox → Parent Merge

Promote sandbox changes to production:
```bash
# Extract sandbox
curl -X POST /api/extracts/sandbox_export/run
curl -O /api/extracts/runs/run_sandbox/download

# Switch to parent tenant, import with sync
curl -X POST /api/restores/import \
  -F "file=@Sandbox-Export.zip" \
  -F "conflict_strategy=sync"
```

## Limitations

- ZIP files only (no tar.gz, raw directories)
- Local storage only (no S3/cloud integration yet)
- JSONL format for data, YAML for describe
- No incremental imports (full restore each time)
- No schema downgrade support (can't remove columns)
