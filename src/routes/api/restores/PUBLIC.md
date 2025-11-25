# Restore Application

Import data from extract archives with flexible conflict resolution and background processing.

## Base Path
Restore execution and import endpoints use: `/api/restores`

Restore configuration management uses: `/api/data/restores` (Data API)

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/restores/:id/run`](#post-apirestoresidrun) | Execute a restore job |
| POST | [`/api/restores/:id/cancel`](#post-apirestoresidcancel) | Cancel a running restore |
| POST | [`/api/restores/import`](#post-apirestoresimport) | Upload and restore in one step |

**Note:** Restore configuration management (create, read, update, delete) is handled via the standard Data API at `/api/data/restores`.

## Content Type
- **Request**: `application/json` for execution, `multipart/form-data` for import
- **Response**: `application/json`

## Authentication Required
All endpoints require a valid JWT bearer token. Authorization follows standard ACL rules.

---

## POST /api/restores/:id/run

Execute a restore job. Creates a `restore_run` record and starts background processing. The job executes asynchronously—this endpoint returns immediately with the run ID.

### Path Parameters
- `id` (string, required): Restore configuration ID

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "run_id": "run_abc123...",
    "message": "Restore queued for execution",
    "status_url": "/api/data/restore_runs/run_abc123..."
  }
}
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Restore not found |
| 409 | `CONFLICT` | Restore is disabled or already running |

### Usage Example
```bash
curl -X POST http://localhost:9001/api/restores/restore_123/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## POST /api/restores/:id/cancel

Cancel a running restore job. Marks the most recent running job for this restore as cancelled.

### Path Parameters
- `id` (string, required): Restore configuration ID

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "message": "Restore cancelled",
    "run_id": "run_456..."
  }
}
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | No running restore found |

---

## POST /api/restores/import

Upload a ZIP file (from extract download) and execute restore in one step. This is a convenience endpoint for quick imports without creating a restore configuration first.

### Request Headers
```
Content-Type: multipart/form-data
Authorization: Bearer YOUR_JWT_TOKEN
```

### Form Data Parameters

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `file` | File | Yes | - | ZIP file from extract download |
| `conflict_strategy` | string | No | 'upsert' | Conflict resolution strategy |
| `include` | string | No | 'describe,data' | Comma-separated: describe, data |
| `models` | string | No | null | Comma-separated model names (null = all) |
| `create_models` | string | No | 'true' | Allow creating new models |

### Conflict Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| `replace` | Delete all, import fresh | Dev restore on fresh DB |
| `upsert` | Update existing, insert new | Dev restore on existing DB |
| `merge` | Import only for new models | Package installation |
| `sync` | Import only new record IDs | Sandbox → Parent merge |
| `skip` | Skip existing records | Best-effort import |
| `error` | Fail on any conflict | Strict validation |

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "run_id": "run_xyz789...",
    "message": "Restore queued for execution",
    "status_url": "/api/data/restore_runs/run_xyz789...",
    "filename": "Dev-Data-2025-01-19.zip",
    "size": 524288,
    "config": {
      "conflict_strategy": "upsert",
      "include": ["describe", "data"],
      "models": null,
      "create_models": true
    }
  }
}
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `BAD_REQUEST` | Invalid file or missing required fields |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type must be multipart/form-data |

### Usage Example
```bash
curl -X POST http://localhost:9001/api/restores/import \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@Dev-Data-2025-01-19.zip" \
  -F "conflict_strategy=upsert"
```

---

## Restore Configuration

Restore configurations are managed via the Data API at `/api/data/restores`.

### Create Restore

```bash
POST /api/data/restores
```

**Request Body:**
```json
{
  "name": "Production Restore",
  "description": "Restore production data after testing",
  "source_type": "upload",
  "source_ref": "/tmp/restores/uploads/abc123.zip",
  "conflict_strategy": "upsert",
  "include": ["describe", "data"],
  "models": ["users", "orders"],
  "create_models": true,
  "enabled": true
}
```

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Human-readable name |
| `description` | string | No | null | Optional notes |
| `source_type` | string | Yes | 'upload' | Source: upload, extract_run, url |
| `source_ref` | string | No | null | File path, run ID, or URL |
| `conflict_strategy` | string | No | 'upsert' | Conflict resolution strategy |
| `include` | array | No | ['describe', 'data'] | What to restore |
| `models` | array | No | null | Specific models (null = all) |
| `create_models` | boolean | No | true | Allow creating new models |
| `enabled` | boolean | No | true | Can this restore be executed |

### List Restores
```bash
GET /api/data/restores
```

### Get Restore
```bash
GET /api/data/restores/:id
```

### Update Restore
```bash
PUT /api/data/restores/:id
```

### Delete Restore
```bash
DELETE /api/data/restores/:id
```

---

## Restore Runs

Restore runs track individual executions. Query via Data API at `/api/data/restore_runs`.

### Run Statuses

| Status | Description |
|--------|-------------|
| `pending` | Created but not started |
| `queued` | Waiting to execute |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Execution failed |
| `cancelled` | Manually cancelled |

### Check Run Status
```bash
GET /api/data/restore_runs/:runId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "run_xyz789",
    "restore_id": "restore_123",
    "restore_name": "Production Restore",
    "status": "running",
    "progress": 67,
    "progress_detail": {
      "phase": "importing_data",
      "files_total": 10,
      "files_completed": 7,
      "current_model": "orders",
      "records_imported": 25000,
      "records_skipped": 150
    },
    "started_at": "2025-01-19T10:00:00Z",
    "records_imported": 25000,
    "records_skipped": 150,
    "models_created": 2,
    "fields_created": 15,
    "created_at": "2025-01-19T10:00:00Z"
  }
}
```

### Progress Tracking

The `progress_detail` field provides real-time execution status:

**During describe import (0-25%):**
```json
{
  "phase": "imported_describe",
  "models_created": 3,
  "fields_created": 24
}
```

**During data import (25-100%):**
```json
{
  "phase": "importing_data",
  "files_total": 10,
  "files_completed": 7,
  "current_model": "orders",
  "records_imported": 25000,
  "records_skipped": 150
}
```

---

## Restore Logs

Detailed execution logs track every operation. Query via Data API at `/api/data/restore_logs`.

### Log Levels

| Level | Description |
|-------|-------------|
| `info` | Normal operations |
| `warn` | Non-critical issues |
| `error` | Failures and problems |

### Log Phases

| Phase | Description |
|-------|-------------|
| `upload` | File extraction |
| `validation` | File structure validation |
| `describe_import` | Model/field creation |
| `data_import` | Record insertion |

### Query Logs for Run
```bash
GET /api/data/restore_logs?filter[where][run_id]=run_xyz789
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "log_001",
      "run_id": "run_xyz789",
      "level": "info",
      "phase": "describe_import",
      "model_name": "channels",
      "record_id": null,
      "message": "Created model",
      "detail": null,
      "created_at": "2025-01-19T10:00:01Z"
    },
    {
      "id": "log_002",
      "level": "info",
      "phase": "data_import",
      "model_name": "channels",
      "record_id": "ch_123",
      "message": "Skipped existing record (sync strategy)",
      "detail": { "reason": "record_exists_in_parent" },
      "created_at": "2025-01-19T10:00:05Z"
    }
  ]
}
```

---

## Complete Workflows

### Workflow 1: Dev Restore (Fresh Database)

```bash
# BEFORE breaking changes: Export data
curl -X POST http://localhost:9001/api/data/extracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Dev Data",
    "enabled": true
  }'
# Response: { "id": "extract_abc" }

curl -X POST http://localhost:9001/api/extracts/extract_abc/run \
  -H "Authorization: Bearer $TOKEN"
# Response: { "run_id": "run_xyz" }

# Wait for completion, then download
curl -O http://localhost:9001/api/extracts/runs/run_xyz/download \
  -H "Authorization: Bearer $TOKEN"
# Saved: My-Dev-Data-2025-01-19-run_xyz.zip

# AFTER autoinstall (DB is fresh): Restore data
curl -X POST http://localhost:9001/api/restores/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@My-Dev-Data-2025-01-19-run_xyz.zip" \
  -F "conflict_strategy=replace"

# Response:
{
  "success": true,
  "data": {
    "run_id": "run_def456",
    "message": "Restore queued for execution",
    "status_url": "/api/data/restore_runs/run_def456"
  }
}

# Check status
curl http://localhost:9001/api/data/restore_runs/run_def456 \
  -H "Authorization: Bearer $TOKEN"
```

### Workflow 2: Package Installation

```bash
# Install external package (e.g., Slack clone)
curl -X POST http://localhost:9001/api/restores/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@monk-slack-v1.0.0.zip" \
  -F "conflict_strategy=merge"

# Result:
# ✅ Creates new models (channels, messages, etc.)
# ✅ Imports seed data for new models
# ✅ Preserves all existing tenant data
```

### Workflow 3: Sandbox → Parent Merge

```bash
# In sandbox: Export changes
curl -X POST http://localhost:9001/api/extracts/sandbox_export/run \
  -H "Authorization: Bearer $SANDBOX_TOKEN"

curl -O http://localhost:9001/api/extracts/runs/run_sandbox/download \
  -H "Authorization: Bearer $SANDBOX_TOKEN"
# Saved: Sandbox-Changes.zip

# In parent: Restore with sync strategy
curl -X POST http://localhost:9001/api/restores/import \
  -H "Authorization: Bearer $PARENT_TOKEN" \
  -F "file=@Sandbox-Changes.zip" \
  -F "conflict_strategy=sync"

# Result:
# ✅ Creates new models
# ✅ Adds new fields to existing models
# ✅ Imports training data (new record IDs only)
# ✅ Skips production data (existing record IDs)
```

---

## Error Handling

### Common Errors

| Error | Solution |
|-------|----------|
| Restore not found | Verify restore ID exists |
| Restore disabled | Enable restore via `PUT /api/data/restores/:id` |
| Already running | Wait for current run to complete or cancel it |
| Invalid ZIP file | Ensure file is a valid extract archive |
| Model doesn't exist | Set `create_models: true` in config |
| Record conflict | Adjust conflict strategy (e.g., `upsert` instead of `error`) |

### Failed Restores

When a restore fails:
- Run status set to `failed`
- Error message stored in `error` field
- Stack trace in `error_detail` field
- Detailed logs in `restore_logs` table

Query failed runs:
```bash
GET /api/data/restore_runs?filter[where][status]=failed
```

Query error logs:
```bash
GET /api/data/restore_logs?filter[where][run_id]=run_xyz&filter[where][level]=error
```

---

## Conflict Strategy Examples

### Strategy: replace

**Use Case:** Dev restore on fresh database

**Behavior:**
1. Delete all existing records in target models
2. Import all records from file

**Example:**
```bash
curl -X POST /api/restores/import \
  -F "file=@backup.zip" \
  -F "conflict_strategy=replace"
```

---

### Strategy: upsert

**Use Case:** Dev restore on existing database, updating modified records

**Behavior:**
1. For each record in file:
   - If ID exists: Update record
   - If ID doesn't exist: Insert record

**Example:**
```bash
curl -X POST /api/restores/import \
  -F "file=@backup.zip" \
  -F "conflict_strategy=upsert"
```

---

### Strategy: merge

**Use Case:** Package installation

**Behavior:**
1. Create new models and import all data
2. Add fields to existing models
3. Skip data import for existing models

**Example:**
```bash
curl -X POST /api/restores/import \
  -F "file=@monk-slack-v1.0.0.zip" \
  -F "conflict_strategy=merge"
```

**Result:**
- ✅ `channels` model created → all seed data imported
- ✅ `messages` model created → all seed data imported
- ✅ `users` model exists → new fields added, data skipped

---

### Strategy: sync

**Use Case:** Sandbox → Parent merge

**Behavior:**
1. Create new models and import all data
2. Add fields to existing models
3. Import only records with IDs that don't exist in parent

**Example:**
```bash
curl -X POST /api/restores/import \
  -F "file=@sandbox-export.zip" \
  -F "conflict_strategy=sync"
```

**Result:**
- ✅ Production record `task_001` exists → skipped
- ✅ Training record `task_002` is new → imported
- ✅ New model `projects` → all data imported

---

### Strategy: skip

**Use Case:** Best-effort import, don't overwrite anything

**Behavior:**
- Skip any record that exists
- Only insert records with new IDs

**Example:**
```bash
curl -X POST /api/restores/import \
  -F "file=@backup.zip" \
  -F "conflict_strategy=skip"
```

---

### Strategy: error

**Use Case:** Strict validation, ensure no conflicts

**Behavior:**
- Error immediately if any record ID exists
- Restore fails, no partial import

**Example:**
```bash
curl -X POST /api/restores/import \
  -F "file=@package.zip" \
  -F "conflict_strategy=error"
```

---

## Limitations

- ZIP files only (no tar.gz or raw directories)
- Local file storage (no cloud integration yet)
- JSONL format for data, YAML for describe
- No incremental imports
- No model downgrades (can't remove fields via restore)
- No rollback support (yet)

## Future Features

- Download from URL (GitHub packages)
- Dry run / validation mode
- Rollback support
- Model migration scripts
- Package dependencies
- Cloud storage (S3, GCS, Azure)
