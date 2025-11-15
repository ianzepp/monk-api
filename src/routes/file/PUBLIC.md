# File API Routes

The File API provides a filesystem-like interface for accessing data records and schema definitions, transforming the traditional REST approach into intuitive path-based operations. This abstraction makes it possible to interact with schemas, records, fields, and schema properties as if they were directories and files in a traditional filesystem.

## Recent Improvements

**Flat Recursive Listing (Latest)**: The File API now supports efficient directory tree enumeration:
- **Flat Listing**: Returns all files in a flat array with `recursive: true, flat: true`
- **Package Management**: List all 2500+ schema properties in a single API call
- **No Tree Walking**: Client receives complete file manifest without recursive requests
- **Grep-Friendly**: Pipe paths directly to grep or feed to batch operations

**Property Decomposition**: The File API supports granular property-level access:
- **No .json Files**: Records are pure directories containing individual field files
- **Property Decomposition**: Both `/data` and `/describe` support unlimited path depth
- **Schema Management**: Update individual schema properties without loading entire definitions
- **Long Format**: Eliminate N+1 query problems with inline extended metadata
- **Schema Cache**: Trust-based caching with explicit invalidation for performance
- **FUSE Ready**: Optimized for filesystem implementations (FUSE, FTP, WebDAV)

**Architecture Refactoring**: The File API follows modern design patterns with:
- **Unified Components**: Shared path parsing, permission validation, and utilities
- **Transaction Integration**: Proper database transaction support using `withTransactionParams()`
- **Standardized Errors**: Consistent HttpErrors with FTP-compatible error codes
- **Optional Parameters**: All `file_options` are now optional with sensible defaults
- **Performance**: Schema caching and long_format optimization for FUSE filesystems

## Base Path
All File API routes are prefixed with `/api/file`

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/file/list`](#post-apifilelist) | List directories/files with wildcard and pagination support. |
| POST | [`/api/file/retrieve`](#post-apifileretrieve) | Read records, fields, or schema properties using filesystem-style paths. |
| POST | [`/api/file/store`](#post-apifilestore) | Upsert records, fields, or schema properties by writing to a virtual file. |
| POST | [`/api/file/stat`](#post-apifilestat) | Inspect metadata (size, timestamps, schema info) for any entry. |
| POST | [`/api/file/delete`](#post-apifiledelete) | Delete records or fields through file semantics. |
| POST | [`/api/file/size`](#post-apifilesize) | Calculate storage footprint for fields or properties. |
| POST | [`/api/file/modify-time`](#post-apifilemodify-time) | Retrieve modified timestamps for caching and sync tools. |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication
All File API routes require authentication via JWT token in the Authorization header.
- **Header**: `Authorization: Bearer <jwt_token>`

## Filesystem Abstraction

The File API maps database concepts to filesystem paths for intuitive navigation:

### Path Structure

```
/                                      → Root directory
/data/                                 → Data namespace (tenant records)
/data/users/                           → All user records
/data/users/user-123/                  → Record directory (fields)
/data/users/user-123/email             → Individual field (text)
/data/users/user-123/metadata          → Complex field (JSON)
/describe/                             → Schema definitions namespace
/describe/users/                       → Field definitions for users schema
/describe/users/email/                 → Properties of email field
/describe/users/email/maxLength        → Individual property value
/describe/users/email/pattern          → Validation regex pattern
/describe/users/metadata/properties/tags/type  → Nested property (unlimited depth)
```

### File System Mapping

| Path Type | Example | Description |
|-----------|---------|-------------|
| **Root** | `/` | Shows available namespaces (`data`, `describe`) |
| **Data Schema** | `/data/users/` | Lists all records in the schema |
| **Record Directory** | `/data/users/user-123/` | Shows individual field files |
| **Field File** | `/data/users/user-123/email` | Individual field value |
| **Describe Schema** | `/describe/users/` | Lists field definitions |
| **Field Definition** | `/describe/users/email/` | Shows field properties |
| **Property File** | `/describe/users/email/maxLength` | Individual property value |

### Access Patterns

- **Directory Operations**: Use `list` to browse schemas, records, fields, and properties
- **File Operations**: Use `retrieve` to get field values or property values
- **Write Operations**: Use `store` to create/update records, fields, or schema properties
- **Metadata Operations**: Use `stat` to get detailed information about any path

---

## POST /api/file/list

Traverse schemas, records, fields, or schema properties as if they were directories. This endpoint powers file-browser experiences with wildcard globbing, ACL-aware filtering, and performance optimizations for FUSE filesystems.

### Request Body
```json
{
  "path": "/data/users/",
  "file_options": {
    "show_hidden": false,
    "long_format": false,
    "recursive": false,
    "flat": false,
    "max_depth": -1,
    "sort_by": "name",
    "sort_order": "asc",
    "where": null,
    "pattern_optimization": true,
    "cross_schema_limit": 100,
    "use_pattern_cache": true
  }
}
```

**Key Options**:
- **`long_format`**: Include extended metadata inline (eliminates N+1 queries)
  - Adds: `created_time`, `content_type`, `etag`, `soft_deleted`, `field_count`
  - Critical for FUSE: `ls -l` with 1000 files = 1 query instead of 1001
- **`recursive`**: Recursively list all subdirectories (default: `false`)
  - When combined with `flat: true`, returns all files in a flat array
  - Essential for package management workflows
- **`flat`**: Return flat list of files when combined with `recursive: true` (default: `false`)
  - Only returns files (`file_type: "f"`), not directories
  - Each entry includes full path (e.g., `/describe/users/email/type`)
  - Enables efficient piping to grep/batch operations
  - Example: List all 2500 schema properties in one call
- `max_depth`: Maximum recursion depth when `recursive: true` (default: `-1` = unlimited)
- `show_hidden`: Include system metadata fields (default: `false`)
- `sort_by`: Sort by `name` (default), `size`, `time`, or `type`
- `sort_order`: Direction - `asc` (default) or `desc`
- `where`: Filter records using [Find API](../../docs/33-find-api.md) WHERE clause

**Note**: All `file_options` are optional with sensible defaults.

### Wildcard Support

The File API supports pattern matching:

```json
{
  "path": "/data/users/*admin*/"
}
```

**Supported Patterns:**
- `*` - Match any characters
- Schema and record wildcards supported
- Cross-schema patterns: `/data/*/recent_activity/`

### Success Response (200)
```json
{
  "success": true,
  "entries": [
    {
      "name": "user-123",
      "file_type": "d",
      "file_size": 0,
      "file_permissions": "rwx",
      "file_modified": "20241201120000",
      "path": "/data/users/user-123/",
      "api_context": {
        "schema": "users",
        "record_id": "user-123",
        "access_level": "full"
      },
      // Extended metadata (when long_format: true)
      "created_time": "20241130100000",
      "content_type": "application/json",
      "etag": "abc123def456",
      "soft_deleted": false,
      "field_count": 5
    }
  ],
  "total": 1,
  "has_more": false,
  "file_metadata": {
    "path": "/data/users/",
    "type": "directory",
    "permissions": "r-x",
    "size": 0,
    "modified_time": "20241201120000"
  }
}
```

### Flat Recursive Listing

When `recursive: true` and `flat: true` are combined, the response returns only files in a flat array without directories:

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
      "file_modified": "20250101120000",
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
      "file_modified": "20250101120000",
      "path": "/describe/users/email/maxLength",
      "api_context": {
        "schema": "users",
        "access_level": "read"
      }
    }
    // ... all property files in flat list
  ],
  "total": 147,
  "has_more": false,
  "file_metadata": {
    "path": "/describe/users",
    "type": "directory",
    "permissions": "r--",
    "size": 0,
    "modified_time": "20250101120000"
  }
}
```

**Use Cases**:
- **Package Management**: List all schema properties in one call for package pull operations
- **Grep Workflows**: Pipe paths to grep: `jq -r '.entries[].path' | grep 'email'`
- **Batch Operations**: Collect paths, then feed to batch-retrieve for efficient syncing
- **File Manifests**: Export complete directory structure without client-side tree walking

### File Types
- `d` - Directory (schema, record, field definition)
- `f` - File (field value, property value)
- `l` - Link (symbolic links, if supported)

### File Permissions
- `rwx` - Read, write, execute (full access)
- `rw-` - Read and write (edit access)
- `r-x` - Read and execute (directory access)
- `r--` - Read only
- `---` - No access

---

## POST /api/file/retrieve

Read field values or schema property values through filesystem paths. The endpoint supports byte-range offsets for large files, multiple formats, and emits consistent metadata (ETag, modified time) for caching clients.

### Request Body
```json
{
  "path": "/data/users/user-123/email",
  "file_options": {
    "format": "json",
    "start_offset": 0,
    "max_bytes": 1000000,
    "show_hidden": false
  }
}
```

**Supported Paths**:
- **Data**: `/data/<schema>/<record>/<field>` - Field values
- **Describe**: `/describe/<schema>/<field>/<property>` - Property values
- **Nested**: `/describe/<schema>/<field>/<prop>/<subprop>` - Unlimited depth

**Supported Formats**:
- `json` - Structured JSON (default)
- `raw` - Raw string content (supports `start_offset` and `max_bytes`)

**Note**: All `file_options` are optional. Defaults: `format: "json"`, `start_offset: 0`.

### Success Response (200)

#### Field Value Retrieval
```json
{
  "success": true,
  "content": "john@example.com",
  "file_metadata": {
    "path": "/data/users/user-123/email",
    "type": "file",
    "permissions": "r--",
    "size": 17,
    "modified_time": "20241201120000",
    "content_type": "text/plain",
    "etag": "abc123",
    "can_resume": false
  }
}
```

#### Schema Property Retrieval
```json
{
  "success": true,
  "content": 255,
  "file_metadata": {
    "path": "/describe/users/email/maxLength",
    "type": "file",
    "permissions": "r--",
    "size": 3,
    "modified_time": "20241201120000",
    "content_type": "application/json",
    "etag": "def456",
    "can_resume": false
  }
}
```

---

## POST /api/file/store

Create or update data or schema definitions using filesystem semantics. Supports field-level updates for records and property-level updates for schema definitions.

### Request Body

#### Data: Field-Level Update
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

#### Data: Record Creation (Directory Path)
```json
{
  "path": "/data/users/user-3",
  "content": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "department": "Marketing"
  },
  "file_options": {
    "overwrite": true,
    "validate_schema": true
  }
}
```

#### Describe: Property Update (Root Only)
```json
{
  "path": "/describe/users/email/maxLength",
  "content": 500,
  "file_options": {
    "overwrite": true
  }
}
```

#### Describe: Field Definition Creation (Root Only)
```json
{
  "path": "/describe/users/phone",
  "content": {
    "type": "string",
    "pattern": "^\\+?[1-9]\\d{1,14}$",
    "description": "International phone number"
  },
  "file_options": {
    "overwrite": true
  }
}
```

**Describe Path Requirements**:
- Only root users can modify schema definitions
- Updates are atomic and invalidate schema cache
- Full JSON Schema validation is performed after updates
- Supports unlimited nesting depth for properties

**Note**: All `file_options` are optional. Defaults: `overwrite: true`, `append_mode: false`, `validate_schema: true`.

### Success Response (201)
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
    "modified_time": "20241201120000",
    "content_type": "text/plain",
    "etag": "def456"
  }
}
```

---

## POST /api/file/stat

Inspect any virtual path to learn its type, size, timestamps, permissions, and optional schema metadata. Think of it as `stat` for the Monk filesystem.

### Request Body
```json
{
  "path": "/data/users/user-123/email"
}
```

### Success Response (200)

#### Field Status
```json
{
  "success": true,
  "file_metadata": {
    "path": "/data/users/user-123/email",
    "type": "file",
    "permissions": "rwx",
    "size": 17,
    "modified_time": "20241201120000",
    "created_time": "20241201100000",
    "access_time": "20241201130000",
    "content_type": "text/plain",
    "etag": "abc123"
  },
  "record_info": {
    "schema": "users",
    "record_id": "user-123",
    "field_name": "email",
    "soft_deleted": false,
    "access_permissions": ["read", "edit", "full"]
  }
}
```

#### Directory Status with Schema Information
```json
{
  "success": true,
  "file_metadata": {
    "path": "/describe/users/",
    "type": "directory",
    "permissions": "r-x",
    "size": 0,
    "modified_time": "20241201120000"
  },
  "record_info": {
    "schema": "users",
    "soft_deleted": false,
    "access_permissions": ["read"]
  },
  "children_count": 8,
  "schema_info": {
    "description": "User management and authentication",
    "record_count": 247,
    "field_definitions": [
      {
        "name": "email",
        "type": "string",
        "required": true,
        "constraints": "max 255 chars, email format",
        "description": "User email address"
      }
    ]
  }
}
```

---

## POST /api/file/delete

Delete records or clear fields using filesystem semantics. The API enforces safety checks and supports soft deletes.

### Request Body
```json
{
  "path": "/data/users/user-123",
  "file_options": {
    "recursive": false,
    "force": false,
    "permanent": false
  },
  "safety_checks": {
    "require_empty": false,
    "max_deletions": 100
  }
}
```

**Supported Paths**:
- `/data/<schema>/<record>` - Soft delete record
- `/data/<schema>/<record>/<field>` - Set field to `null`

**Not Supported**:
- `/describe` paths (schema modifications through Data API only)

**Note**: All `file_options` and `safety_checks` are optional. Defaults: `recursive: false`, `force: false`, `permanent: false`.

### Success Response (200)
```json
{
  "success": true,
  "operation": "soft_delete",
  "results": {
    "deleted_count": 1,
    "paths": ["/data/users/user-123"],
    "records_affected": ["user-123"]
  },
  "file_metadata": {
    "can_restore": true,
    "restore_deadline": "2025-01-01T12:00:00Z"
  }
}
```

---

## POST /api/file/size

Calculate the storage footprint of a field or property without fetching content. Useful for quota enforcement and UI progress bars.

### Request Body
```json
{
  "path": "/data/users/user-123/email"
}
```

### Success Response (200)
```json
{
  "success": true,
  "size": 17,
  "file_metadata": {
    "path": "/data/users/user-123/email",
    "type": "file",
    "permissions": "rw-",
    "size": 17,
    "modified_time": "20241201120000",
    "content_type": "text/plain"
  }
}
```

---

## POST /api/file/modify-time

Read the modified timestamp for any entry using FTP-friendly formatting. Integrations like FTP servers and sync tools rely on this endpoint.

### Request Body
```json
{
  "path": "/data/users/user-123/email"
}
```

### Success Response (200)
```json
{
  "success": true,
  "modified_time": "20241201120000",
  "file_metadata": {
    "path": "/data/users/user-123/email",
    "type": "file",
    "permissions": "rw-",
    "size": 17,
    "modified_time": "20241201120000"
  },
  "timestamp_info": {
    "source": "updated_at",
    "iso_timestamp": "2024-12-01T12:00:00Z",
    "timezone": "UTC"
  }
}
```

---

## Performance Optimizations

### Long Format Listings

Eliminate N+1 query problems with `long_format: true`:

```json
{
  "path": "/data/users/",
  "file_options": {
    "long_format": true
  }
}
```

**Performance Impact**:
- Without: `ls -l` with 1000 files = 1 list + 1000 stat queries
- With: `ls -l` with 1000 files = 1 list query

Each entry includes:
- `created_time` - Creation timestamp
- `content_type` - MIME type
- `etag` - Content hash
- `soft_deleted` - Deletion status
- `field_count` - Number of fields/properties

Critical for FUSE filesystem implementations.

### Schema Cache

Schema definitions are cached in memory:
- Automatic invalidation on updates via `/describe` store operations
- No time-based expiry - trust-based caching
- Per-database isolation for multi-tenant architecture

---

## Authentication & Permissions

### Permission Levels

| Level | Description | File Permissions |
|-------|-------------|------------------|
| **None** | No access | `---` |
| **Read** | View records and fields | `r--` |
| **Edit** | Read and modify records | `rw-` |
| **Full** | Complete access including delete | `rwx` |
| **Root** | Schema modifications (` /describe` writes) | `rwx` |

### Access Control
- All endpoints validate JWT tokens and user permissions
- Record-level ACL enforcement through `access_read`, `access_edit`, `access_full` arrays
- Field-level operations inherit record permissions
- `/describe` write operations require root access
- Soft delete operations require `access_edit` or `access_full`
- Permanent delete operations require `access_full`

---

## Error Handling

### Standard Error Format
```json
{
  "success": false,
  "error": "PERMISSION_DENIED",
  "error_code": "PERMISSION_DENIED",
  "message": "Only root users can modify schema definitions"
}
```

### Common Error Codes

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `TOKEN_INVALID` | Invalid or expired JWT token |
| 403 | `PERMISSION_DENIED` | Insufficient access permissions (or not root for `/describe` writes) |
| 404 | `RECORD_NOT_FOUND` | Record or field does not exist |
| 404 | `SCHEMA_NOT_FOUND` | Invalid schema name |
| 404 | `FIELD_NOT_FOUND` | Field does not exist in record or schema definition |
| 400 | `INVALID_PATH` | Malformed filesystem path |
| 400 | `NOT_A_FILE` | Operation requires file, not directory |
| 400 | `NOT_A_DIRECTORY` | Operation requires directory, not file |
| 400 | `WILDCARDS_NOT_ALLOWED` | Wildcards not supported for operation |
| 409 | `RECORD_EXISTS` | Record already exists and overwrite disabled |

---

## Practical Usage Scenarios

### When to Use File API vs Data API

**Use File API when:**
- Building FUSE filesystems, FTP servers, or WebDAV interfaces
- Need hierarchical navigation of data
- Working with individual fields frequently
- Managing schema definitions granularly
- Building tools that benefit from path-based addressing
- Implementing package managers or file-based workflows

**Use Data API when:**
- Building traditional web applications
- Need bulk operations on multiple records
- Working primarily with complete records
- Implementing REST-based client applications

### Common Workflows

#### 1. Granular Schema Management
```javascript
// Update email field max length
await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer root_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/describe/users/email/maxLength',
    content: 500
  })
});

// Add validation pattern
await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer root_token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/describe/users/email/pattern',
    content: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
  })
});
```

#### 2. Browsing Data Structure
```javascript
// List all schemas
const schemas = await fetch('/api/file/list', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ path: '/data/' })
});

// List records with long format (no N+1 queries)
const users = await fetch('/api/file/list', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/',
    file_options: { long_format: true }
  })
});
```

#### 3. Field-Level Updates
```javascript
// Update individual field
await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/user-123/email',
    content: 'newemail@example.com'
  })
});

// Create complete record (directory path)
await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/user-456',
    content: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      department: 'Engineering'
    }
  })
});
```

### Integration Examples

#### FUSE Filesystem Integration
```javascript
// FUSE readdir with long_format to pre-populate cache
fuseServer.on('readdir', async (path, callback) => {
  const response = await fetch('/api/file/list', {
    method: 'POST',
    body: JSON.stringify({
      path: path,
      file_options: { long_format: true }
    })
  });

  const entries = response.entries.map(entry => ({
    name: entry.name,
    mode: parsePermissions(entry.file_permissions, entry.file_type),
    size: entry.file_size,
    mtime: parseTimestamp(entry.file_modified),
    ctime: parseTimestamp(entry.created_time) // From long_format
  }));

  // Pre-populate stat cache to avoid N+1 queries
  for (const entry of response.entries) {
    cache.set(entry.path, {
      size: entry.file_size,
      mtime: entry.file_modified,
      etag: entry.etag  // From long_format
    });
  }

  callback(entries);
});
```

#### Package Manager via FUSE
```bash
# Mount Monk as filesystem
monk-fuse mount /mnt/monk

# Browse packages
ls /mnt/monk/data/packages/
# express-4.18.2/  lodash-4.17.21/  react-18.2.0/

# Read package metadata
cat /mnt/monk/data/packages/express-4.18.2/version
# 4.18.2

# Update package version
echo "4.18.3" > /mnt/monk/data/packages/express-4.18.2/version

# Browse schema constraints (root only)
ls /mnt/monk/describe/packages/version/
# type  maxLength  pattern  description

# Update schema constraint (root only)
echo "100" > /mnt/monk/describe/packages/version/maxLength
```

---

The File API provides a powerful and intuitive interface for accessing structured data through filesystem metaphors, making it ideal for building FUSE filesystems, FTP servers, package managers, and hierarchical data browsers while maintaining full compatibility with the underlying database structure and access control systems.
