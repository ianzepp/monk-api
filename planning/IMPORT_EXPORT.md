# Import/Export System (Removed)

This document captures the design of the extract/restore system that was removed to reduce bundle size. The implementation can be rebuilt using these specifications.

## Overview

Two complementary systems:
- **Extract**: Export tenant data to portable format
- **Restore**: Import data from extract files

## Data Models

### Extract System

```
extracts              → Export configurations
  └─ extract_runs     → Individual executions
       └─ extract_artifacts → Generated files (describe.yaml, *.jsonl, manifest.json)
```

### Restore System

```
restores              → Import configurations
  └─ restore_runs     → Individual executions
       └─ restore_logs → Detailed operation logs
```

## File Format

Extract produces a ZIP containing:

```
export-2025-01-19/
├── manifest.json      # Metadata: version, run_id, artifacts list with checksums
├── describe.yaml      # Model + field definitions (hierarchical)
├── users.jsonl        # One JSON object per line
├── orders.jsonl
└── ...
```

### manifest.json

```json
{
  "version": "1.0",
  "generated_at": "2025-01-19T10:00:00Z",
  "run_id": "run_abc123",
  "extract_id": "extract_def456",
  "format": "jsonl",
  "include": ["describe", "data"],
  "artifacts": [
    { "type": "describe", "name": "describe.yaml", "size": 12345, "checksum": "sha256:...", "records": 0 },
    { "type": "data-users", "name": "users.jsonl", "size": 98765, "checksum": "sha256:...", "records": 500 }
  ]
}
```

### describe.yaml

```yaml
users:
  label: Users
  label_plural: Users
  icon: user
  fields:
    name:
      data_type: text
      required: true
    email:
      data_type: text
      unique: true
orders:
  label: Order
  ...
```

### Data Files (JSONL)

One JSON object per line, preserving all fields including system fields (id, created_at, etc.):

```jsonl
{"id":"user_001","name":"Alice","email":"alice@example.com","created_at":"2025-01-01T00:00:00Z"}
{"id":"user_002","name":"Bob","email":"bob@example.com","created_at":"2025-01-02T00:00:00Z"}
```

## Extract Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Human-readable name |
| `format` | string | 'jsonl' | Output format |
| `include` | array | ['describe', 'data'] | What to export |
| `models` | array | null | Specific models (null = all) |
| `retention_days` | number | 7 | Artifact expiration |
| `enabled` | boolean | true | Can be executed |

## Restore Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Human-readable name |
| `source_type` | string | 'upload' | Source: upload, url |
| `source_ref` | string | required | File path or URL |
| `conflict_strategy` | string | 'upsert' | How to handle conflicts |
| `include` | array | ['describe', 'data'] | What to import |
| `models` | array | null | Specific models (null = all) |
| `create_models` | boolean | true | Allow creating new models |
| `enabled` | boolean | true | Can be executed |

## Conflict Strategies

| Strategy | Behavior | Use Case |
|----------|----------|----------|
| **replace** | Delete all existing, import fresh | Dev restore (clean slate) |
| **upsert** | Update existing by ID, insert new | Dev restore (preserve changes) |
| **merge** | Only import data for newly-created models | Package installation |
| **sync** | Only import records with new IDs | Sandbox → Production |
| **skip** | Skip existing records silently | Best-effort import |
| **error** | Fail on any conflict | Strict validation |

## API Endpoints

### Extract

```bash
# Configuration via Data API
POST   /api/data/extracts          # Create config
GET    /api/data/extracts          # List configs
GET    /api/data/extracts/:id      # Get config
PUT    /api/data/extracts/:id      # Update config
DELETE /api/data/extracts/:id      # Delete config

# Execution
POST   /api/extracts/:id/run       # Start extract job → { run_id }
POST   /api/extracts/:id/cancel    # Cancel running job

# Status (via Data API)
GET    /api/data/extract_runs/:runId

# Downloads
GET    /api/extracts/runs/:runId/download              # ZIP of all artifacts
GET    /api/extracts/artifacts/:artifactId/download    # Single artifact
```

### Restore

```bash
# Configuration via Data API
POST   /api/data/restores          # Create config
GET    /api/data/restores          # List configs
GET    /api/data/restores/:id      # Get config
PUT    /api/data/restores/:id      # Update config
DELETE /api/data/restores/:id      # Delete config

# Execution
POST   /api/restores/:id/run       # Start restore job → { run_id }
POST   /api/restores/:id/cancel    # Cancel running job

# Direct import (upload + run in one step)
POST   /api/restores/import        # multipart/form-data with file

# Status & Logs (via Data API)
GET    /api/data/restore_runs/:runId
GET    /api/data/restore_logs?filter[where][run_id]=:runId
```

## Processing Flow

### Extract Flow

1. Create `extract_runs` record (status: queued)
2. Update to running, create run directory
3. If include 'describe': export models/fields to describe.yaml
4. If include 'data': for each model, stream records to {model}.jsonl
5. Create manifest.json with checksums
6. Create `extract_artifacts` records
7. Update run to completed with stats

### Restore Flow

1. Create `restore_runs` record (status: queued)
2. Update to running, extract ZIP to run directory
3. Validate file structure (manifest.json, describe.yaml)
4. If include 'describe':
   - For each model in describe.yaml
   - Create model if doesn't exist (if create_models=true)
   - Create missing fields
5. If include 'data':
   - For each {model}.jsonl file
   - Apply conflict strategy per record
6. Clean up extracted files
7. Update run to completed with stats

## Progress Tracking

Both systems track progress via `progress` (0-100) and `progress_detail`:

```json
{
  "phase": "exporting_data",
  "models_total": 10,
  "models_completed": 7,
  "current_model": "orders",
  "records_exported": 25000
}
```

## Run Statuses

- `pending` - Created but not started
- `queued` - Waiting to execute
- `running` - Currently executing
- `completed` - Finished successfully
- `failed` - Execution failed
- `cancelled` - Manually cancelled

## Dependencies (Removed)

These were removed to reduce bundle size:
- `archiver` - ZIP creation for extract downloads
- `unzipper` - ZIP extraction for restore uploads
- `lodash`, `bluebird`, `fs-extra` - Transitive deps

## Future Enhancements

- Scheduling (cron expressions)
- Cloud storage (S3, GCS)
- Compression (gzip individual files)
- URL download (install packages from GitHub releases)
- Dry run / validation mode
- Rollback support
- Dependency resolution between packages
- Incremental exports (only changed records)

## Use Cases

### 1. Dev Workflow (Database Reset)

```bash
# Before breaking changes
POST /api/extracts/dev_backup/run
GET  /api/extracts/runs/run_xyz/download → dev-data.zip

# After autoinstall nukes DB
POST /api/restores/import -F "file=@dev-data.zip" -F "conflict_strategy=replace"
```

### 2. Package Installation

```bash
# Install external package into tenant
POST /api/restores/import \
  -F "file=@monk-slack-v1.0.0.zip" \
  -F "conflict_strategy=merge"
```

### 3. Sandbox → Production Promotion

```bash
# Export sandbox
POST /api/extracts/sandbox_export/run
GET  /api/extracts/runs/run_sandbox/download → sandbox.zip

# Import to production with sync (only new record IDs)
POST /api/restores/import \
  -F "file=@sandbox.zip" \
  -F "conflict_strategy=sync"
```
