# Extract Application

Execute data extraction jobs to export models and data with background processing and downloadable artifacts.

## Base Path
Extract execution and download endpoints use: `/api/extracts`

Extract configuration management uses: `/api/data/extracts` (Data API)

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/extracts/:id/run`](#post-apiextractsidrun) | Execute an extract job |
| POST | [`/api/extracts/:id/cancel`](#post-apiextractsidcancel) | Cancel a running extract |
| GET | [`/api/extracts/runs/:runId/download`](#get-apiextractsrunsruniddownload) | Download all artifacts as ZIP |
| GET | [`/api/extracts/artifacts/:artifactId/download`](#get-apiextractsartifactsartifactiddownload) | Download single artifact |

**Note:** Extract configuration management (create, read, update, delete) is handled via the standard Data API at `/api/data/extracts`.

## Content Type
- **Request**: `application/json`
- **Response**: `application/json` for execution endpoints, file streams for downloads

## Authentication Required
All endpoints require a valid JWT bearer token. Authorization follows standard ACL rules.

---

## POST /api/extracts/:id/run

Execute an extract job. Creates an `extract_run` record and starts background processing. The job executes asynchronously—this endpoint returns immediately with the run ID.

### Path Parameters
- `id` (string, required): Extract configuration ID

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "run_id": "abc123...",
    "message": "Extract queued for execution",
    "status_url": "/api/data/extract_runs/abc123..."
  }
}
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Extract not found |
| 409 | `CONFLICT` | Extract is disabled or already running |

### Usage Example
```bash
curl -X POST http://localhost:9001/api/extracts/extract_123/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## POST /api/extracts/:id/cancel

Cancel a running extract job. Marks the most recent running job for this extract as cancelled.

### Path Parameters
- `id` (string, required): Extract configuration ID

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "message": "Extract cancelled",
    "run_id": "run_456..."
  }
}
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | No running extract found |

---

## GET /api/extracts/runs/:runId/download

Download all artifacts from a completed extract run as a ZIP archive.

### Path Parameters
- `runId` (string, required): Extract run ID

### Success Response (200)
Returns a ZIP file stream containing all artifacts.

**Response Headers:**
```
Content-Type: application/zip
Content-Disposition: attachment; filename="ExtractName-2025-01-19-abc12345.zip"
```

**ZIP Contents:**
```
ExtractName-2025-01-19-abc12345.zip
├── describe.yaml          # Model and field definitions
├── users.jsonl            # User data (one JSON object per line)
├── orders.jsonl           # Order data
├── products.jsonl         # Product data
└── manifest.json          # Export metadata and checksums
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Extract run not found |
| 409 | `CONFLICT` | Extract run not completed yet |
| 410 | `GONE` | Artifacts have expired |

### Usage Example
```bash
curl -O http://localhost:9001/api/extracts/runs/run_456/download \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## GET /api/extracts/artifacts/:artifactId/download

Download a single artifact file.

### Path Parameters
- `artifactId` (string, required): Artifact ID

### Success Response (200)
Returns the artifact file as a stream.

**Response Headers:**
```
Content-Type: application/yaml (or appropriate type)
Content-Disposition: attachment; filename="describe.yaml"
Content-Length: 15360
X-Checksum-SHA256: a1b2c3d4...
```

### Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 404 | `RECORD_NOT_FOUND` | Artifact not found or file missing |
| 410 | `GONE` | Artifact has expired |

### Usage Example
```bash
curl -O http://localhost:9001/api/extracts/artifacts/artifact_789/download \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Extract Configuration

Extract configurations are managed via the Data API at `/api/data/extracts`.

### Create Extract
```bash
POST /api/data/extracts
```

**Request Body:**
```json
{
  "name": "Daily Backup",
  "description": "Full export of all models and data",
  "format": "jsonl",
  "include": ["describe", "data"],
  "models": ["users", "orders", "products"],
  "retention_days": 7,
  "enabled": true
}
```

**Fields:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Human-readable name |
| `description` | string | No | null | Optional notes |
| `format` | string | No | 'jsonl' | Output format: yaml, json, jsonl, archive |
| `include` | array | No | ['describe', 'data'] | What to export |
| `models` | array | No | null | Specific models (null = all non-system) |
| `filter` | object | No | null | Per-model filters (future) |
| `compress` | boolean | No | true | Gzip output (future) |
| `split_files` | boolean | No | false | One file per model (future) |
| `schedule` | string | No | null | Cron expression (future) |
| `schedule_enabled` | boolean | No | false | Enable scheduling (future) |
| `retention_days` | number | No | 7 | How long to keep artifacts |
| `enabled` | boolean | No | true | Can this extract be executed |

### List Extracts
```bash
GET /api/data/extracts
```

### Get Extract
```bash
GET /api/data/extracts/:id
```

### Update Extract
```bash
PUT /api/data/extracts/:id
```

### Delete Extract
```bash
DELETE /api/data/extracts/:id
```

---

## Extract Runs

Extract runs track individual executions. Query via Data API at `/api/data/extract_runs`.

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
GET /api/data/extract_runs/:runId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "run_456",
    "extract_id": "extract_123",
    "extract_name": "Daily Backup",
    "status": "running",
    "progress": 67,
    "progress_detail": {
      "phase": "exporting_data",
      "models_total": 10,
      "models_completed": 7,
      "current_model": "orders",
      "records_exported": 25000
    },
    "started_at": "2025-01-19T10:00:00Z",
    "records_exported": 25000,
    "models_exported": 7,
    "artifacts_created": 0,
    "created_at": "2025-01-19T10:00:00Z"
  }
}
```

### Progress Tracking

The `progress_detail` field provides real-time execution status:

**During describe export (0-25%):**
```json
{
  "phase": "exported_describe",
  "models_total": 10,
  "models_completed": 0
}
```

**During data export (25-100%):**
```json
{
  "phase": "exporting_data",
  "models_total": 10,
  "models_completed": 7,
  "current_model": "orders",
  "records_exported": 25000
}
```

---

## Artifacts

Each extract run generates multiple artifacts. Query via Data API at `/api/data/extract_artifacts`.

### Artifact Types

| Type | Description | Format |
|------|-------------|--------|
| `describe` | Model and field definitions | YAML |
| `data-{model}` | Data for specific model | JSONL |
| `manifest` | Export metadata | JSON |

### List Artifacts for Run
```bash
GET /api/data/extract_artifacts?filter[where][run_id]=run_456
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "artifact_1",
      "run_id": "run_456",
      "artifact_type": "describe",
      "artifact_name": "describe.yaml",
      "format": "yaml",
      "size_bytes": 15360,
      "checksum": "a1b2c3d4...",
      "is_primary": true,
      "download_count": 3,
      "expires_at": "2025-01-26T10:00:00Z"
    },
    {
      "id": "artifact_2",
      "artifact_type": "data-users",
      "artifact_name": "users.jsonl",
      "format": "jsonl",
      "size_bytes": 524288,
      "checksum": "e5f6g7h8...",
      "is_primary": true
    }
  ]
}
```

---

## Complete Workflow

### 1. Create Extract Configuration
```bash
curl -X POST http://localhost:9001/api/data/extracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Backup",
    "include": ["describe", "data"],
    "retention_days": 30,
    "enabled": true
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "extract_abc123",
    "name": "Production Backup",
    "enabled": true,
    "total_runs": 0
  }
}
```

### 2. Execute Extract
```bash
curl -X POST http://localhost:9001/api/extracts/extract_abc123/run \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "run_id": "run_xyz789",
    "message": "Extract queued for execution",
    "status_url": "/api/data/extract_runs/run_xyz789"
  }
}
```

### 3. Poll for Completion
```bash
# Check every few seconds until status is 'completed'
curl http://localhost:9001/api/data/extract_runs/run_xyz789 \
  -H "Authorization: Bearer $TOKEN"
```

**While running:**
```json
{
  "success": true,
  "data": {
    "status": "running",
    "progress": 67,
    "progress_detail": {
      "phase": "exporting_data",
      "current_model": "orders",
      "records_exported": 50000
    }
  }
}
```

**When complete:**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "progress": 100,
    "records_exported": 125000,
    "models_exported": 10,
    "artifacts_created": 12,
    "duration_seconds": 45
  }
}
```

### 4. Download Results
```bash
# Download all artifacts as ZIP
curl -O http://localhost:9001/api/extracts/runs/run_xyz789/download \
  -H "Authorization: Bearer $TOKEN"

# Or download individual artifacts
curl -O http://localhost:9001/api/extracts/artifacts/artifact_1/download \
  -H "Authorization: Bearer $TOKEN"
```

---

## Manifest File

Each extract includes a `manifest.json` file with metadata:

```json
{
  "version": "1.0",
  "generated_at": "2025-01-19T10:00:45Z",
  "run_id": "run_xyz789",
  "extract_id": "extract_abc123",
  "format": "jsonl",
  "include": ["describe", "data"],
  "artifacts": [
    {
      "type": "describe",
      "name": "describe.yaml",
      "size": 15360,
      "checksum": "a1b2c3d4...",
      "records": 0
    },
    {
      "type": "data-users",
      "name": "users.jsonl",
      "size": 524288,
      "checksum": "e5f6g7h8...",
      "records": 1250
    },
    {
      "type": "data-orders",
      "name": "orders.jsonl",
      "size": 2097152,
      "checksum": "i9j0k1l2...",
      "records": 8432
    }
  ]
}
```

---

## Error Handling

### Common Errors

| Error | Solution |
|-------|----------|
| Extract not found | Verify extract ID exists |
| Extract disabled | Enable extract via `PUT /api/data/extracts/:id` |
| Already running | Wait for current run to complete or cancel it |
| Run not completed | Check status, wait for completion |
| Artifacts expired | Re-run extract to generate new artifacts |

### Failed Extracts

When an extract fails:
- Run status set to `failed`
- Error message stored in `error` field
- Stack trace in `error_detail` field
- Partial artifacts preserved for debugging

Query failed runs:
```bash
GET /api/data/extract_runs?filter[where][status]=failed
```

---

## Limitations

- Maximum artifact retention: 365 days
- Extracts execute sequentially (no parallel runs per extract)
- Artifacts stored locally at `/tmp/extracts` (configurable)
- JSONL format only for data (YAML for describe)

## Future Features

- Scheduled execution (cron)
- Compression (gzip)
- Split files (one per model)
- Cloud storage (S3, GCS, Azure)
- Incremental exports
- Custom filters per model
