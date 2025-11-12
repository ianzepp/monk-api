# File API

> **Path-First Filesystem Facade**
>
> The File API exposes Monk records through filesystem-style paths. Clients interact with schema directories, record folders, and field "files" without learning database internals. Each endpoint accepts a `path` and returns predictable metadata so external tooling (CLI, desktop apps, FTP middleware, etc.) can treat Monk like a lightweight virtual filesystem.

## Overview

The API maps Monk schemas and records onto a small, consistent hierarchy:

```
/                     # Root namespace
/data/                # Tenant schemas
/data/users/          # Records within the users schema
/data/users/user-1/   # A record directory (fields + .json snapshot)
/data/users/user-1.json  # Snapshot of the record
/data/users/user-1/email # Individual field value
/describe/            # JSON schema definitions (if enabled)
```

Key properties:

- Requests always use `POST` with a JSON body that contains a `path`.
- Responses include a `file_metadata` object that mirrors filesystem attributes (type, permissions, modified time, etc.).
- Limited wildcard support is available for directory listings. Schema and record segments recognise the literal `*` today; other pattern tokens (`?`, ranges, alternatives) remain reserved for future expansion.
- The API reuses Monk authentication and ACL rules; the caller must supply a valid JWT.

> The File API refactor is now complete and exercised by the shell specs under `spec/37-file-api/`. Notes below call out the few roadmap options that remain placeholders (hidden entries, wildcard deletes, aggregated sizing).

## System Fields and File Sizes

The File API distinguishes between **user data** and **system metadata**:

- **User data**: The `id` field plus any schema-defined fields (e.g., `name`, `email`, `status`)
- **System metadata**: Infrastructure fields (`access_*`, `created_at`, `updated_at`, `trashed_at`, `deleted_at`)

**For `stat` and `size` operations**, file sizes always reflect user data only. System metadata is excluded to ensure:
- **Stability**: File sizes don't change when ACLs are updated or timestamps shift
- **Consistency**: The reported size matches what users see by default
- **Semantics**: The "file" represents user data, not infrastructure

**For `retrieve` and `list` operations**, the `show_hidden` option controls visibility:
- `show_hidden: false` (default) — Returns only user data
- `show_hidden: true` — Includes system metadata fields

This approach mirrors real filesystems where `stat` reports intrinsic file properties independent of view options.

## Authentication

All endpoints require the standard Monk bearer token:

```http
Authorization: Bearer <jwt>
Content-Type: application/json
```

Permissions are resolved by the File API before touching the database. Record-level ACL arrays (`access_read`, `access_edit`, `access_full`, `access_deny`) drive the effective access level that appears in responses.

## Endpoints

Every endpoint lives under `/api/file/<operation>` and expects the request shapes listed below.

### POST /api/file/list

List the contents of a path. Supported locations:

- `/` – root namespace (`data`, `describe` entries)
- `/data` – schema directories
- `/data/<schema>` – records for a schema
- `/data/<schema>/<record>` – files under a record (fields + `<record>.json`)

Wildcard filters are accepted for directory segments, but record identifiers only support the literal `*` (which selects all records). Examples:

- `/data/*` → all schema directories matching any name
- `/data/users/*` → every record directory within the `users` schema
- `/data/*admin*/` → schema directories that contain `admin` in their name

> TODO: Record identifiers only honor the literal `*` wildcard right now. Pattern alternatives (`(a|b)`) and ranges (`[01-12]`) described elsewhere are not implemented for record segments yet.

**Request**
```json
{
  "path": "/data/users",
  "file_options": {
    "show_hidden": false,
    "sort_by": "name",
    "sort_order": "asc"
  }
}
```

**Sorting Options**:
- `sort_by`: Sort field - `name` (default), `size`, `time`, or `type`
  - `name`: Alphabetical by entry name (case-insensitive)
  - `size`: By file size in bytes (directories are size 0)
  - `time`: By modification timestamp
  - `type`: Directories first, then files
- `sort_order`: Sort direction - `asc` (default) or `desc`

Set `pattern_optimization` and `use_pattern_cache` to `true` (default) to reuse wildcard translations on schema directories. `cross_schema_limit` caps the number of records returned when a schema wildcard spans multiple schemas. Use `where` to supply a [Find API](33-find-api.md) WHERE clause that filters record `.json` entries based on their content before they are included in listings.

> Listings fully support `sort_by` and `sort_order` for all entry types, `cross_schema_limit`, `where`, and `show_hidden`. When `show_hidden` is `false` (default), record JSON files exclude ACL fields (`access_*`) and timestamp fields (`created_at`, `updated_at`, `trashed_at`, `deleted_at`) from the response; the `id` field is always included. Flags such as `pattern_optimization` and `use_pattern_cache` are reserved and have no effect yet; directory responses stay flat.

**Response**
```json
{
  "success": true,
  "entries": [
    {
      "name": "user-1",
      "file_type": "d",
      "file_size": 0,
      "file_permissions": "r--",
      "file_modified": "20250101120000",
      "path": "/data/users/user-1/",
      "api_context": {
        "schema": "users",
        "record_id": "user-1",
        "access_level": "read"
      }
    }
  ],
  "total": 1,
  "has_more": false,
  "file_metadata": {
    "path": "/data/users",
    "type": "directory",
    "permissions": "r--",
    "size": 0,
    "modified_time": "20250210120000"
  }
}
```

Record directories return both the `<record>.json` snapshot and one entry per non-system field (system fields such as `id`, `created_at`, `updated_at`, `trashed_at`, and `deleted_at` are hidden by default). When a `where` clause is provided, it is evaluated through the Database Filter system just like `/api/find/:schema`. Schema listings only include record directories whose JSON snapshots satisfy the condition. Directory entries (`file_type: "d"`) themselves are never filtered out, but a record directory whose snapshot does not match returns an empty `entries` array while still providing metadata about the directory.

### POST /api/file/retrieve

Fetch the content behind a record JSON file or a specific field.

**Request**
```json
{
  "path": "/data/users/user-1.json",
  "file_options": {
    "format": "json",
    "start_offset": 0,
    "max_bytes": 65536,
    "show_hidden": false
  }
}
```

`path` may also be `/data/users/user-1/email` for a single field. `format` accepts `json` (default) or `raw`. The `start_offset` and `max_bytes` options apply only when `format` is `raw`. When `show_hidden` is `false` (default), record JSON responses exclude ACL fields (`access_*`) and timestamp fields (`created_at`, `updated_at`, `trashed_at`, `deleted_at`); the `id` field is always included.

**Response**
```json
{
  "success": true,
  "content": {
    "id": "user-1",
    "email": "user@example.com"
  },
  "file_metadata": {
    "path": "/data/users/user-1.json",
    "type": "file",
    "permissions": "r--",
    "size": 256,
    "modified_time": "20250101120000",
    "content_type": "application/json",
    "etag": "abc123",
    "can_resume": false
  }
}
```

Field paths return the underlying field value (string, number, object, etc.) when `format` is `json`. Use `format: "raw"` to stream the JSON/serialized representation.

### POST /api/file/store

Create or update data using filesystem semantics. Supported paths:

- `/data/<schema>/<record>.json` – create or replace the full record
- `/data/<schema>/<record>` – treat the record directory as shorthand for the JSON snapshot
- `/data/<schema>/<record>/<field>` – set an individual field value

**Request**
```json
{
  "path": "/data/users/user-2.json",
  "content": {
    "email": "user2@example.com",
    "name": "Second User"
  },
  "file_options": {
    "overwrite": true,
    "append_mode": false,
    "binary_mode": false
  }
}
```

Field updates accept plain strings or JSON-serialisable values. If `append_mode` is `true` and the existing field is a string, the API concatenates the new content.

**Response**
```json
{
  "success": true,
  "operation": "create",
  "result": {
    "record_id": "user-2",
    "field_name": null,
    "created": true,
    "updated": false,
    "validation_passed": true
  },
  "file_metadata": {
    "path": "/data/users/user-2.json",
    "type": "file",
    "permissions": "rw-",
    "size": 256,
    "modified_time": "20250210120000",
    "content_type": "application/json",
    "etag": "def456"
  }
}
```

### POST /api/file/delete

Delete a record or clear a field.

- `/data/<schema>/<record>` or `/data/<schema>/<record>.json` removes the record via soft delete.
- `/data/<schema>/<record>/<field>` sets the field value to `null`.

Wildcard expansion and the `permanent` flag are not implemented yet; delete operations currently target a single record or field per request.

**Request**
```json
{
  "path": "/data/users/user-2"
}
```

**Response**
```json
{
  "success": true,
  "operation": "soft_delete",
  "results": {
    "deleted_count": 1,
    "paths": ["/data/users/user-2"],
    "records_affected": ["user-2"]
  },
  "file_metadata": {
    "can_restore": true
  }
}
```
Field deletions respond with `operation: "field_delete"`, include `fields_cleared`, and reuse the same response envelope.

### POST /api/file/stat

Return metadata for any supported path.

**Request**
```json
{
  "path": "/data/users/user-1.json"
}
```

**Response**
```json
{
  "success": true,
  "file_metadata": {
    "path": "/data/users/user-1.json",
    "type": "file",
    "permissions": "r--",
    "size": 256,
    "modified_time": "20250101120000",
    "created_time": "20241231115959",
    "access_time": "20250210120000",
    "content_type": "application/json",
    "etag": "abc123"
  },
  "record_info": {
    "schema": "users",
    "record_id": "user-1",
    "field_count": 5,
    "soft_deleted": false,
    "access_permissions": ["read"]
  },
  "children_count": 6
}
```

Directory responses include `children_count` and best-effort schema information when available.

> **Note on file sizes**: The `size` field always reports the size of user data (excluding system fields like `access_*` and timestamps). This ensures consistent size reporting regardless of ACL or timestamp changes. The reported size matches what users see by default when retrieving content.

### POST /api/file/size

Return the byte size of a record snapshot or a field.

**Request**
```json
{
  "path": "/data/users/user-1.json"
}
```

> TODO: Aggregated directory sizing is not available yet. The handler accepts only record JSON files or individual field paths and returns a single-file byte count.

**Response**
```json
{
  "success": true,
  "size": 256,
  "file_metadata": {
    "path": "/data/users/user-1.json",
    "type": "file",
    "permissions": "r--",
    "size": 256,
    "modified_time": "20250101120000",
    "content_type": "application/json"
  }
}
```

> **Note on size calculation**: File sizes always exclude system fields (`access_*`, `created_at`, `updated_at`, `trashed_at`, `deleted_at`) to provide stable, consistent size reporting. The size represents the actual user data content, not infrastructure metadata. This matches the default view users see when retrieving files.

### POST /api/file/modify-time

Return the FTP-style modification timestamp for any path.

**Request**
```json
{
  "path": "/data/users/user-1.json"
}
```

> TODO: This endpoint is currently read-only. The MDTM-style `modified_time` is reported from record metadata; clients cannot set or override timestamps yet.

**Response**
```json
{
  "success": true,
  "modified_time": "20250101120000",
  "file_metadata": {
    "path": "/data/users/user-1.json",
    "type": "file",
    "permissions": "r--",
    "size": 0,
    "modified_time": "20250101120000"
  },
  "timestamp_info": {
    "source": "updated_at",
    "iso_timestamp": "2025-01-01T12:00:00.000Z",
    "timezone": "UTC"
  }
}
```

## Error Handling

Errors follow Monk's `HttpErrors` format:

```json
{
  "success": false,
  "error": "RECORD_NOT_FOUND",
  "error_code": "RECORD_NOT_FOUND",
  "message": "Record user-123 not found"
}
```

Common error codes include:

| Code | Description |
| ---- | ----------- |
| `INVALID_PATH` | Path missing the expected `/data/...` structure |
| `PERMISSION_DENIED` | Caller lacks the required ACL entry |
| `RECORD_NOT_FOUND` | Record does not exist |
| `FIELD_NOT_FOUND` | Field does not exist on the record |
| `NOT_A_FILE` | Operation expects a JSON file or field, received directory |
| `UUID_WILDCARD_NOT_SUPPORTED` | Record identifiers only support the literal `*` wildcard |

## Testing Status

Shell specs under `spec/37-file-api/` now exercise the live File API implementation: list (including root and schema coverage), retrieve (JSON and raw modes), stat/size/modify-time, store/update flows, and record/field deletes. Use `npm run test:sh spec/37-file-api/<name>.test.sh` to run individual scenarios or the entire directory for a full sweep.
