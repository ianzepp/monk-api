# File API

> **Path-First Filesystem Facade**
>
> The File API exposes Monk records and schema definitions through filesystem-style paths. Clients interact with schema directories, record folders, field files, and schema properties without learning database internals. Each endpoint accepts a `path` and returns predictable metadata so external tooling (CLI, desktop apps, FUSE filesystems, FTP middleware, etc.) can treat Monk like a lightweight virtual filesystem.

## Overview

The API maps Monk schemas and records onto a small, consistent hierarchy:

```
/                              # Root namespace
/data/                         # Tenant data namespace
/data/users/                   # Records within the users schema
/data/users/user-1/            # A record directory containing fields
/data/users/user-1/email       # Individual field value
/data/users/user-1/metadata    # Complex field (object/array)
/describe/                     # Schema definitions namespace
/describe/users/               # Field definitions for users schema
/describe/users/email/         # Properties of email field definition
/describe/users/email/maxLength  # Individual property value
```

Key properties:

- Requests always use `POST` with a JSON body that contains a `path`.
- Responses include a `file_metadata` object that mirrors filesystem attributes (type, permissions, modified time, etc.).
- Limited wildcard support is available for directory listings. Schema and record segments recognise the literal `*` today; other pattern tokens (`?`, ranges, alternatives) remain reserved for future expansion.
- The API reuses Monk authentication and ACL rules; the caller must supply a valid JWT.
- Property decomposition allows granular access to schema definitions and record fields without retrieving entire documents.

> The File API refactor is now complete and exercised by the shell specs under `spec/37-file-api/`. Property-level access for both `/data` and `/describe` namespaces is fully implemented.

## Path Structure

### Data Namespace (`/data`)

Records are represented as **directories** containing individual field files:

- `/data/users/john-123/` - Record directory
- `/data/users/john-123/email` - Email field file
- `/data/users/john-123/name` - Name field file
- `/data/users/john-123/metadata` - Complex field (stored as JSON)

Fields are individual files whose content type depends on the field value (text, JSON, etc.).

### Describe Namespace (`/describe`)

Schema definitions are decomposed into field definitions and properties:

- `/describe/users/` - Directory of field definitions
- `/describe/users/email/` - Email field definition directory
- `/describe/users/email/type` - Field type property (e.g., "string")
- `/describe/users/email/maxLength` - Max length constraint (e.g., 255)
- `/describe/users/email/pattern` - Validation pattern (regex)

Properties support unlimited nesting depth:

- `/describe/users/metadata/properties/tags/type` - Nested property access

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

**For `/describe` paths**, only root users can modify schema definitions. All users can read schema definitions.

## Endpoints

Every endpoint lives under `/api/file/<operation>` and expects the request shapes listed below.

### POST /api/file/list

List the contents of a path. Supported locations:

**Data namespace:**
- `/` – root namespace (`data`, `describe` entries)
- `/data` – schema directories
- `/data/<schema>` – records for a schema
- `/data/<schema>/<record>` – field files within a record

**Describe namespace:**
- `/describe` – schema definition directories
- `/describe/<schema>` – field definition directories for a schema
- `/describe/<schema>/<field>` – properties of a field definition
- `/describe/<schema>/<field>/<property>` – nested properties (unlimited depth)

Wildcard filters are accepted for directory segments, but record identifiers only support the literal `*` (which selects all records). Examples:

- `/data/*` → all schema directories matching any name
- `/data/users/*` → every record directory within the `users` schema
- `/data/*channel*/` → schema directories that contain `channel` in their name

> TODO: Record identifiers only honor the literal `*` wildcard right now. Pattern alternatives (`(a|b)`) and ranges (`[01-12]`) described elsewhere are not implemented for record segments yet.

**Request**
```json
{
  "path": "/data/users",
  "file_options": {
    "show_hidden": false,
    "long_format": false,
    "recursive": false,
    "flat": false,
    "max_depth": -1,
    "sort_by": "name",
    "sort_order": "asc",
    "where": null
  }
}
```

**Options**:
- `show_hidden`: Include system metadata fields (default: `false`)
- **`long_format`**: Include extended metadata inline to eliminate N+1 stat queries (default: `false`)
  - When enabled, each entry includes `created_time`, `content_type`, `etag`, `soft_deleted`, `field_count`
  - Optimizes performance for FUSE filesystems and tools that need stat info for all entries
  - Example: `ls -l` with 1000 files = 1 query instead of 1001
- **`recursive`**: Recursively list all subdirectories (default: `false`)
  - When combined with `flat: true`, returns all files in a flat array instead of nested structure
  - Essential for package management workflows that need to enumerate entire directory trees
- **`flat`**: Return flat list of all files when combined with `recursive: true` (default: `false`)
  - Only returns files (`file_type: "f"`), not directories
  - Each entry includes full path from root (e.g., `/describe/users/email/type`)
  - Enables efficient piping to grep/batch operations without client-side tree walking
  - Example: List all 2500 schema properties in one call for package pull operations
- `max_depth`: Maximum recursion depth when `recursive: true` (default: `-1` = unlimited)
  - `0`: List only the specified directory (same as non-recursive)
  - `1`: Include immediate children only
  - `-1`: No limit, traverse entire tree
- `sort_by`: Sort field - `name` (default), `size`, `time`, or `type`
  - `name`: Alphabetical by entry name (case-insensitive)
  - `size`: By file size in bytes (directories are size 0)
  - `time`: By modification timestamp
  - `type`: Directories first, then files
- `sort_order`: Sort direction - `asc` (default) or `desc`
- `where`: [Find API](33-find-api.md) WHERE clause to filter records
- `cross_schema_limit`: Cap records returned when wildcards span multiple schemas
- `pattern_optimization`, `use_pattern_cache`: Reuse wildcard translations (default: `true`)

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
      "file_modified": "2025-01-01T12:00:00.000Z",
      "path": "/data/users/user-1/",
      "api_context": {
        "schema": "users",
        "record_id": "user-1",
        "access_level": "read"
      },
      // Extended metadata (only when long_format: true)
      "created_time": "2024-12-31T11:59:59.000Z",
      "content_type": "application/json",
      "etag": "abc123def456",
      "soft_deleted": false,
      "field_count": 5
    }
  ],
  "total": 1,
  "has_more": false,
  "file_metadata": {
    "path": "/data/users",
    "type": "directory",
    "permissions": "r--",
    "size": 0,
    "modified_time": "2025-02-10T12:00:00.000Z"
  }
}
```

Record directories return one entry per non-system field (system fields such as `id`, `created_at`, `updated_at`, `trashed_at`, and `deleted_at` are hidden by default). When a `where` clause is provided, it is evaluated through the Database Filter system just like `/api/find/:schema`.

#### Flat Recursive Listing Example

When `recursive: true` and `flat: true` are combined, the response returns only files in a flat array:

**Request**
```json
{
  "path": "/describe/users",
  "file_options": {
    "recursive": true,
    "flat": true
  }
}
```

**Response**
```json
{
  "success": true,
  "entries": [
    {
      "name": "type",
      "file_type": "f",
      "file_size": 6,
      "file_permissions": "r--",
      "file_modified": "2025-01-01T12:00:00.000Z",
      "path": "/describe/users/email/type",
      "api_context": {
        "schema": "users",
        "access_level": "read"
      }
    },
    {
      "name": "maxLength",
      "file_type": "f",
      "file_size": 3,
      "file_permissions": "r--",
      "file_modified": "2025-01-01T12:00:00.000Z",
      "path": "/describe/users/email/maxLength",
      "api_context": {
        "schema": "users",
        "access_level": "read"
      }
    },
    {
      "name": "pattern",
      "file_type": "f",
      "file_size": 45,
      "file_permissions": "r--",
      "file_modified": "2025-01-01T12:00:00.000Z",
      "path": "/describe/users/email/pattern",
      "api_context": {
        "schema": "users",
        "access_level": "read"
      }
    }
    // ... all other property files in flat list
  ],
  "total": 147,
  "has_more": false,
  "file_metadata": {
    "path": "/describe/users",
    "type": "directory",
    "permissions": "r--",
    "size": 0,
    "modified_time": "2025-01-01T12:00:00.000Z"
  }
}
```

This eliminates the need for client-side tree walking and enables efficient workflows:
- Pipe paths to grep: `jq -r '.entries[].path' | grep 'email'`
- Feed to batch-retrieve: Collect all paths, then retrieve in batches of 1000
- Generate file manifests: Export complete directory structure in one call

### POST /api/file/retrieve

Fetch the content behind a field or property.

**Data namespace examples:**
- `/data/users/user-1/email` – Single field value
- `/data/users/user-1/metadata` – Complex field (object/array)

**Describe namespace examples:**
- `/describe/users/email/maxLength` – Field property value
- `/describe/users/email/pattern` – Validation pattern
- `/describe/users/metadata/properties/tags/type` – Nested property

**Request**
```json
{
  "path": "/data/users/user-1/email",
  "file_options": {
    "format": "json",
    "start_offset": 0,
    "max_bytes": 65536,
    "show_hidden": false
  }
}
```

`format` accepts `json` (default) or `raw`. The `start_offset` and `max_bytes` options apply only when `format` is `raw`, enabling efficient partial reads for large files. When `show_hidden` is `false` (default), system metadata fields are excluded from responses.

**Response**
```json
{
  "success": true,
  "content": "user@example.com",
  "file_metadata": {
    "path": "/data/users/user-1/email",
    "type": "file",
    "permissions": "r--",
    "size": 17,
    "modified_time": "2025-01-01T12:00:00.000Z",
    "content_type": "text/plain",
    "etag": "abc123",
    "can_resume": false
  }
}
```

Field paths return the underlying field value (string, number, object, etc.) when `format` is `json`. Use `format: "raw"` to stream the JSON/serialized representation. Arrays are returned with one element per line for better diff-ability.

### POST /api/file/store

Create or update data using filesystem semantics. Supported paths:

**Data namespace:**
- `/data/<schema>/<record>/<field>` – Set individual field value
- `/data/<schema>/<record>` – Create or update full record (directory treated as record)

**Describe namespace (root only):**
- `/describe/<schema>/<field>` – Create or update field definition
- `/describe/<schema>/<field>/<property>` – Set individual property value
- `/describe/<schema>/<field>/<prop>/<subprop>` – Set nested property (unlimited depth)

**Request (Data)**
```json
{
  "path": "/data/users/user-2/email",
  "content": "user2@example.com",
  "file_options": {
    "overwrite": true,
    "append_mode": false,
    "validate_schema": true
  }
}
```

**Request (Describe - Root Only)**
```json
{
  "path": "/describe/users/email/maxLength",
  "content": 500,
  "file_options": {
    "overwrite": true
  }
}
```

Field updates accept plain strings or JSON-serialisable values. If `append_mode` is `true` and the existing field is a string, the API concatenates the new content.

**For `/describe` paths:**
- Only root users can modify schema definitions
- Updates are atomic and invalidate schema cache
- Full JSON Schema validation is performed after updates
- Supports creating new fields and updating existing properties

**Response**
```json
{
  "success": true,
  "operation": "field_update",
  "result": {
    "record_id": "user-2",
    "field_name": "email",
    "created": false,
    "updated": true,
    "validation_passed": true
  },
  "file_metadata": {
    "path": "/data/users/user-2/email",
    "type": "file",
    "permissions": "rw-",
    "size": 17,
    "modified_time": "2025-02-10T12:00:00.000Z",
    "content_type": "text/plain",
    "etag": "def456"
  }
}
```

### POST /api/file/delete

Delete a record or clear a field.

**Data namespace:**
- `/data/<schema>/<record>` removes the record via soft delete
- `/data/<schema>/<record>/<field>` sets the field value to `null`

**Describe namespace:**
- Not supported (schema modifications through Data API only)

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
  "path": "/data/users/user-1/email"
}
```

**Response**
```json
{
  "success": true,
  "file_metadata": {
    "path": "/data/users/user-1/email",
    "type": "file",
    "permissions": "r--",
    "size": 17,
    "modified_time": "2025-01-01T12:00:00.000Z",
    "created_time": "2024-12-31T11:59:59.000Z",
    "access_time": "2025-02-10T12:00:00.000Z",
    "content_type": "text/plain",
    "etag": "abc123"
  },
  "record_info": {
    "schema": "users",
    "record_id": "user-1",
    "field_name": "email",
    "soft_deleted": false,
    "access_permissions": ["read"]
  }
}
```

Directory responses include `children_count` and best-effort schema information when available. For `/describe` paths, `schema_info` includes field definitions and constraints.

> **Note on file sizes**: The `size` field always reports the size of user data (excluding system fields like `access_*` and timestamps). This ensures consistent size reporting regardless of ACL or timestamp changes. The reported size matches what users see by default when retrieving content.

### POST /api/file/size

Return the byte size of a field or property.

**Request**
```json
{
  "path": "/data/users/user-1/email"
}
```

> TODO: Aggregated directory sizing is not available yet. The handler accepts only field and property paths and returns a single-file byte count.

**Response**
```json
{
  "success": true,
  "size": 17,
  "file_metadata": {
    "path": "/data/users/user-1/email",
    "type": "file",
    "permissions": "r--",
    "size": 17,
    "modified_time": "2025-01-01T12:00:00.000Z",
    "content_type": "text/plain"
  }
}
```

> **Note on size calculation**: File sizes always exclude system fields (`access_*`, `created_at`, `updated_at`, `trashed_at`, `deleted_at`) to provide stable, consistent size reporting. The size represents the actual user data content, not infrastructure metadata. This matches the default view users see when retrieving files.

### POST /api/file/modify-time

Return the modification timestamp for any path in ISO 8601 format.

**Request**
```json
{
  "path": "/data/users/user-1/email"
}
```

> TODO: This endpoint is currently read-only. The `modified_time` is reported from record metadata; clients cannot set or override timestamps yet.

**Response**
```json
{
  "success": true,
  "modified_time": "2025-01-01T12:00:00.000Z",
  "file_metadata": {
    "path": "/data/users/user-1/email",
    "type": "file",
    "permissions": "r--",
    "size": 17,
    "modified_time": "2025-01-01T12:00:00.000Z"
  },
  "timestamp_info": {
    "source": "updated_at",
    "iso_timestamp": "2025-01-01T12:00:00.000Z",
    "timezone": "UTC"
  }
}
```

## Performance Optimizations

### Long Format Listings

The `long_format` option eliminates N+1 query problems common in filesystem operations:

```json
{
  "path": "/data/users/",
  "file_options": {
    "long_format": true
  }
}
```

When enabled, each entry includes extended metadata inline:
- `created_time` - Creation timestamp
- `content_type` - MIME type (e.g., "application/json", "text/plain")
- `etag` - Content hash for caching/validation
- `soft_deleted` - Deletion status
- `field_count` - Number of fields (for records) or properties (for field definitions)

**Performance impact:**
- Without `long_format`: `ls -l /data/users/` with 1000 records = 1 list + 1000 stat queries
- With `long_format`: `ls -l /data/users/` with 1000 records = 1 list query

This is critical for FUSE filesystem implementations where operations like `ls -l` require stat information for every entry.

### Schema Cache

Schema definitions are cached in memory after first access:
- Cache invalidation happens automatically on schema updates via `/describe` store operations
- No time-based expiry - trust-based caching with explicit invalidation
- Per-database cache isolation for multi-tenant architecture

This ensures `/describe` reads are fast and don't query the database unnecessarily.

## Use Cases

### Package Management via FUSE

The property decomposition design enables package managers to treat Monk as a filesystem:

```bash
# Mount Monk as filesystem
monk-fuse mount /mnt/monk

# Browse packages
ls /mnt/monk/data/packages/

# Read package metadata
cat /mnt/monk/data/packages/express-4.18.2/version
# Output: 4.18.2

cat /mnt/monk/data/packages/express-4.18.2/description
# Output: Fast, unopinionated, minimalist web framework

# Update package field
echo "4.18.3" > /mnt/monk/data/packages/express-4.18.2/version

# Browse schema constraints
ls /mnt/monk/describe/packages/version/
# Output: type maxLength pattern description

# Update schema constraint (requires root)
echo "100" > /mnt/monk/describe/packages/version/maxLength
```

### Granular Schema Management

Update individual schema properties without loading entire definitions:

```bash
# Update email field max length
POST /api/file/store
{
  "path": "/describe/users/email/maxLength",
  "content": 500
}

# Add validation pattern
POST /api/file/store
{
  "path": "/describe/users/email/pattern",
  "content": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
}

# Create new field definition
POST /api/file/store
{
  "path": "/describe/users/phone",
  "content": {
    "type": "string",
    "pattern": "^\\+?[1-9]\\d{1,14}$",
    "description": "International phone number"
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
| `INVALID_PATH` | Path missing the expected `/data/...` or `/describe/...` structure |
| `PERMISSION_DENIED` | Caller lacks the required ACL entry (or not root for `/describe` writes) |
| `RECORD_NOT_FOUND` | Record does not exist |
| `FIELD_NOT_FOUND` | Field does not exist on the record or in schema definition |
| `NOT_A_FILE` | Operation expects a file, received directory |
| `NOT_A_DIRECTORY` | Operation expects a directory, received file |
| `INVALID_PATH_FORMAT` | Path contains invalid components or syntax |
| `WILDCARDS_NOT_ALLOWED` | Wildcards not supported for this operation |
| `PATH_TOO_LONG` | Path exceeds maximum length (1000 characters) |

## Testing Status

Shell specs under `spec/37-file-api/` now exercise the live File API implementation: list (including root and schema coverage), retrieve (JSON and raw modes), stat/size/modify-time, store/update flows (including `/describe` paths), and record/field deletes. Use `npm run test:sh spec/37-file-api/<name>.test.sh` to run individual scenarios or the entire directory for a full sweep.

## Future Enhancements

- **Recursive listing** - Will be implemented as part of batch operations endpoints
- **Atomic writes** - Transaction guarantees for multi-field updates
- **Aggregated directory sizing** - Total size of all files in a directory tree
- **Wildcard deletions** - Bulk delete operations using patterns
- **Extended attributes (xattr)** - Expose metadata as filesystem extended attributes
- **Symbolic links** - Cross-reference support for relationships
