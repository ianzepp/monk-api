# File API Routes

The File API provides a filesystem-like interface for accessing data and metadata records, transforming the traditional REST approach into intuitive path-based operations. This abstraction makes it possible to interact with schemas, records, and fields as if they were directories and files in a traditional filesystem.

## Recent Improvements

**Architecture Refactoring (Latest)**: The File API has been refactored to follow modern design patterns with:
- **Unified Components**: Shared path parsing, permission validation, and utilities
- **Transaction Integration**: Proper database transaction support using `withTransactionParams()`
- **Standardized Errors**: Consistent HttpErrors with FTP-compatible error codes
- **Optional Parameters**: All `file_options` are now optional with sensible defaults
- **Performance**: Removed timing metrics for cleaner, faster responses
- **Breaking Changes**: Response formats standardized (acceptable since no current clients)

## Base Path
All File API routes are prefixed with `/api/file`

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
/                          → Root directory
/data/                     → List all schemas
/describe/                     → Schema definitions
/data/users/               → List all user records
/data/users/user-123/      → List record fields + .json file
/data/users/user-123.json  → Complete user record as JSON
/data/users/user-123/email → Individual field access
```

### File System Mapping

| Path Type | Example | Description |
|-----------|---------|-------------|
| **Root** | `/` | Shows available namespaces (`data`, `meta`) |
| **Schema Directory** | `/data/users/` | Lists all records in the schema |
| **Record Directory** | `/data/users/user-123/` | Shows individual fields + JSON file |
| **Record File** | `/data/users/user-123.json` | Complete record as JSON file |
| **Field File** | `/data/users/user-123/email` | Individual field value |

### Access Patterns

- **Directory Operations**: Use `list` to browse schemas, records, and fields
- **File Operations**: Use `retrieve` to get complete records or individual field values
- **Write Operations**: Use `store` to create/update records or modify individual fields
- **Metadata Operations**: Use `stat` to get detailed information about any path

---

## POST /api/file/list

Directory listing with advanced wildcard support and performance optimization.

### Request Body
```json
{
  "path": "/data/users/",
  "file_options": {
    "show_hidden": false,
    "long_format": true,
    "recursive": false,
    "max_depth": 3,
    "sort_by": "name",
    "sort_order": "asc",
    "pattern_optimization": true,
    "cross_schema_limit": 100,
    "use_pattern_cache": true
  }
}
```

**Note**: All `file_options` are optional with sensible defaults. The `performance_hints` section has been removed as performance metrics are no longer collected for simplicity.

### Wildcard Support

The File API supports advanced pattern matching:

```json
{
  "path": "/data/users/*admin*/department/eng*/"
}
```

**Supported Patterns:**
- `*` - Match any characters
- `?` - Match single character
- `(admin|mod)` - Alternative patterns
- `[01-12]` - Range patterns
- `/data/*/recent_activity/` - Cross-schema patterns

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
      }
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

**Note**: The response has been simplified to remove performance metrics (`pattern_info`, `performance_metrics`) for cleaner API design. The core functionality remains the same.

### File Types
- `d` - Directory (schema, record directory)
- `f` - File (record JSON, individual field)
- `l` - Link (symbolic links, if supported)

### File Permissions
- `rwx` - Read, write, execute (full access)
- `rw-` - Read and write (edit access)
- `r-x` - Read and execute (directory access)
- `r--` - Read only
- `---` - No access

---

## POST /api/file/retrieve

File content retrieval with resume support and multiple formats.

### Request Body
```json
{
  "path": "/data/users/user-123.json",
  "file_options": {
    "binary_mode": false,
    "start_offset": 0,
    "max_bytes": 1000000,
    "format": "json"
  }
}
```

**Note**: All `file_options` are optional. Defaults: `binary_mode: false`, `start_offset: 0`, `format: "json"`.

### Supported Formats
- `json` - Structured JSON (default)
- `raw` - Raw string content

### Success Response (200)

#### Complete Record Retrieval
```json
{
  "success": true,
  "content": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z"
  },
  "file_metadata": {
    "size": 256,
    "modified_time": "20241201120000",
    "content_type": "application/json",
    "can_resume": false,
    "etag": "abc123def456"
  }
}
```

#### Individual Field Retrieval
```json
{
  "path": "/data/users/user-123/email",
  "content": "john@example.com",
  "file_metadata": {
    "size": 16,
    "modified_time": "20241201120000",
    "content_type": "text/plain",
    "can_resume": false,
    "etag": "def456ghi789"
  }
}
```

---

## POST /api/file/store

Atomic file storage with transaction management and schema validation.

### Request Body

#### Complete Record Storage
```json
{
  "path": "/data/users/new-user.json",
  "content": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "department": "Marketing"
  },
  "file_options": {
    "binary_mode": false,
    "overwrite": true,
    "append_mode": false,
    "create_path": false,
    "atomic": true,
    "validate_schema": true
  }
}
```

**Note**: All `file_options` are optional. Defaults: `binary_mode: false`, `overwrite: true`, `append_mode: false`, `create_path: false`, `atomic: true`, `validate_schema: true`. The `metadata` section has been removed as it's handled automatically.

#### Field-Level Update
```json
{
  "path": "/data/users/user-123/department",
  "content": "Senior Engineering",
  "file_options": {
    "binary_mode": false,
    "overwrite": true,
    "append_mode": false,
    "atomic": true
  }
}
```

**Note**: Field-level updates support the same options as record storage.

### Success Response (201)
```json
{
  "success": true,
  "operation": "create",
  "result": {
    "record_id": "user-456",
    "created": true,
    "updated": false,
    "validation_passed": true
  },
  "file_metadata": {
    "path": "/data/users/user-456.json",
    "type": "file",
    "permissions": "rwx",
    "size": 256,
    "modified_time": "20241201120000",
    "content_type": "application/json",
    "etag": "xyz789abc123"
  }
}
```

**Note**: The response has been simplified with standardized `file_metadata` structure. Transaction management is now handled automatically by the database layer.

---

## POST /api/file/stat

Detailed file and directory status information with schema introspection.

### Request Body
```json
{
  "path": "/data/users/user-123.json"
}
```

### Success Response (200)

#### File Status
```json
{
  "success": true,
  "path": "/data/users/user-123.json",
  "type": "file",
  "permissions": "rwx",
  "size": 256,
  "modified_time": "20241201120000",
  "created_time": "20241201100000",
  "access_time": "20241201130000",
  "record_info": {
    "schema": "users",
    "record_id": "user-123",
    "field_count": 5,
    "soft_deleted": false,
    "access_permissions": ["read", "edit", "full"]
  }
}
```

#### Directory Status with Schema Information
```json
{
  "success": true,
  "path": "/data/users/",
  "type": "directory",
  "permissions": "rwx",
  "size": 0,
  "modified_time": "20241201120000",
  "created_time": "20241201100000",
  "access_time": "20241201130000",
  "record_info": {
    "schema": "users",
    "soft_deleted": false,
    "access_permissions": ["read", "edit"]
  },
  "children_count": 247,
  "total_size": 0,
  "schema_info": {
    "description": "User management and authentication",
    "record_count": 247,
    "recent_changes": 15,
    "last_modified": "2024-12-01T11:30:00Z",
    "field_definitions": [
      {
        "name": "name",
        "type": "string",
        "required": true,
        "constraints": "min 1 chars, max 100 chars",
        "description": "User display name"
      },
      {
        "name": "email",
        "type": "string",
        "required": true,
        "constraints": "email format",
        "description": "Login identifier"
      }
    ]
  }
}
```

---

## POST /api/file/delete

Safe deletion with soft-delete support and comprehensive safety checks.

### Request Body
```json
{
  "path": "/data/users/user-123",
  "file_options": {
    "recursive": false,
    "force": false,
    "permanent": false,
    "atomic": true
  },
  "safety_checks": {
    "require_empty": false,
    "max_deletions": 100
  }
}
```

**Note**: All `file_options` and `safety_checks` are optional. Defaults: `recursive: false`, `force: false`, `permanent: false`, `atomic: true`, `max_deletions: 100`. The `metadata` section has been simplified.

### Success Response (200)

#### Soft Delete Response
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

**Note**: Response simplified to remove `skipped` array for cleaner structure.

#### Field Deletion Response
```json
{
  "success": true,
  "operation": "field_delete",
  "results": {
    "deleted_count": 1,
    "paths": ["/data/users/user-123/temp_field"],
    "records_affected": ["user-123"],
    "fields_cleared": ["temp_field"]
  },
  "file_metadata": {
    "can_restore": false
  }
}
```

---

## POST /api/file/size

Lightweight file size query for optimal performance.

### Request Body
```json
{
  "path": "/data/users/user-123.json"
}
```

### Success Response (200)
```json
{
  "success": true,
  "size": 256,
  "file_metadata": {
    "path": "/data/users/user-123.json",
    "type": "file",
    "permissions": "rw-",
    "size": 256,
    "modified_time": "20241201120000",
    "content_type": "application/json"
  }
}
```

**Note**: Response now uses standardized `file_metadata` structure instead of `content_info`.

### Error Response (400)
```json
{
  "success": false,
  "error": "NOT_A_FILE",
  "error_code": "NOT_A_FILE",
  "message": "SIZE command only works on files, not directories"
}
```

**Note**: Error responses now use standardized HttpErrors format with descriptive error codes suitable for FTP protocol translation.

---

## POST /api/file/modify-time

File modification timestamp query in filesystem format.

### Request Body
```json
{
  "path": "/data/users/user-123.json"
}
```

### Success Response (200)
```json
{
  "success": true,
  "modified_time": "20241201120000",
  "file_metadata": {
    "path": "/data/users/user-123.json",
    "type": "file",
    "permissions": "rw-",
    "size": 0,
    "modified_time": "20241201120000"
  },
  "timestamp_info": {
    "source": "updated_at",
    "iso_timestamp": "2024-12-01T12:00:00Z",
    "timezone": "UTC"
  }
}
```

**Note**: Response now includes standardized `file_metadata` structure for consistency across all File API endpoints.

---

## Authentication & Permissions

### Permission Levels

| Level | Description | File Permissions |
|-------|-------------|------------------|
| **None** | No access | `---` |
| **Read** | View records and fields | `r--` |
| **Edit** | Read and modify records | `rw-` |
| **Full** | Complete access including delete | `rwx` |

### Access Control
- All endpoints validate JWT tokens and user permissions
- Record-level ACL enforcement through `access_read`, `access_edit`, `access_full` arrays
- Field-level operations inherit record permissions
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
  "message": "User lacks edit permission for record deletion"
}
```

**Note**: Error responses now use standardized HttpErrors format. Error codes are descriptive and suitable for FTP protocol translation.

### Common Error Codes

| Status | Error Code | Description |
|--------|------------|-------------|
| 401 | `TOKEN_INVALID` | Invalid or expired JWT token |
| 403 | `PERMISSION_DENIED` | Insufficient access permissions |
| 404 | `RECORD_NOT_FOUND` | Record or field does not exist |
| 404 | `SCHEMA_NOT_FOUND` | Invalid schema name |
| 404 | `FIELD_NOT_FOUND` | Field does not exist in record |
| 400 | `INVALID_PATH` | Malformed filesystem path |
| 400 | `NOT_A_FILE` | Operation requires file, not directory |
| 400 | `WILDCARDS_NOT_ALLOWED` | Wildcards not supported for operation |
| 400 | `CROSS_SCHEMA_REQUIRES_FORCE` | Cross-schema operations require force flag |
| 409 | `RECORD_EXISTS` | Record already exists and overwrite disabled |

---

## Practical Usage Scenarios

### When to Use File API vs Data API

**Use File API when:**
- Building filesystem-like interfaces or FTP servers
- Need hierarchical navigation of data
- Working with individual fields frequently
- Implementing file-based workflows
- Building tools that benefit from path-based addressing

**Use Data API when:**
- Building traditional web applications
- Need bulk operations on multiple records
- Working primarily with complete records
- Implementing REST-based client applications

### Common Workflows

#### 1. Browsing Data Structure
```javascript
// Start from root
const root = await fetch('/api/file/list', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ path: '/' })
});

// Browse schemas
const schemas = await fetch('/api/file/list', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ path: '/data/' })
});

// Browse records in a schema
const users = await fetch('/api/file/list', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ path: '/data/users/' })
});
```

#### 2. Record Manipulation
```javascript
// Get complete record
const user = await fetch('/api/file/retrieve', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/user-123.json',
    file_options: { format: 'json' }
  })
});

// Update specific field
await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/user-123/email',
    content: 'newemail@example.com',
    file_options: { atomic: true }
  })
});
```

#### 3. Advanced Pattern Matching
```javascript
// Find all admin users in engineering departments
const results = await fetch('/api/file/list', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/*admin*/department/eng*/',
    file_options: {
      pattern_optimization: true,
      use_pattern_cache: true
    }
  })
});
```

#### 4. Batch Operations with Transactions
```javascript
// Create multiple records atomically
const transaction = await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/batch-user-1.json',
    content: { name: 'User 1', email: 'user1@example.com' },
    file_options: { atomic: true }
  })
});

// Use same transaction for related operations
await fetch('/api/file/store', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    path: '/data/users/batch-user-2.json',
    content: { name: 'User 2', email: 'user2@example.com' },
    file_options: { atomic: true },
    metadata: {
      transaction_id: transaction.transaction_info.transaction_id
    }
  })
});
```

### Integration Examples

#### FTP Server Integration
The File API is designed to work seamlessly with FTP servers:

```javascript
// FTP LIST command
ftpServer.on('LIST', async (path, callback) => {
  const response = await fetch('/api/file/list', {
    method: 'POST',
    body: JSON.stringify({
      path: path,
      file_options: { long_format: true }
    })
  });

  const listing = response.entries.map(entry =>
    `${entry.file_permissions} ${entry.file_size} ${entry.file_modified} ${entry.name}`
  );

  callback(listing.join('\n'));
});

// FTP RETR command
ftpServer.on('RETR', async (path, callback) => {
  const response = await fetch('/api/file/retrieve', {
    method: 'POST',
    body: JSON.stringify({
      path: path,
      file_options: { format: 'raw' }
    })
  });

  callback(response.content);
});
```

#### Web File Manager
```html
<!-- File browser interface -->
<div id="file-browser">
  <div class="path-breadcrumb">/data/users/</div>
  <div class="file-list">
    <!-- Dynamically populated from /api/file/list -->
  </div>
</div>

<script>
async function loadDirectory(path) {
  const response = await fetch('/api/file/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });

  const data = await response.json();
  displayFiles(data.entries);
}
</script>
```

The File API provides a powerful and intuitive interface for accessing structured data through filesystem metaphors, making it ideal for building file-based tools, FTP servers, and hierarchical data browsers while maintaining full compatibility with the underlying database structure and access control systems.
