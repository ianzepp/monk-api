# File Middleware Documentation

## Overview

The File Middleware provides filesystem-like access to Monk API data through HTTP endpoints that simulate File operations. This enables developers to interact with API data using familiar file/directory patterns while leveraging the full power of the observer pipeline and database backend.

## File Path Structure

File middleware provides filesystem-like access to API data with intuitive path mapping:

```
/data/                                → List all schemas
/data/accounts/                       → List all account records
/data/accounts/account-123/           → List record fields + .json file
/data/accounts/account-123.json       → Complete record as JSON
/data/accounts/account-123/email      → Individual field access
/meta/accounts                        → Schema definitions
```

## Core File Operations

### Directory Listing - POST /api/file/list

Advanced directory listing with wildcard support and performance optimization:

```bash
# Basic listing
curl -X POST http://localhost:9001/api/file/list \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/",
    "file_options": {
      "show_hidden": false,
      "long_format": true,
      "recursive": false
    }
  }'

# Wildcard patterns (Phase 2)
curl -X POST http://localhost:9001/api/file/list \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/admin*",
    "file_options": {
      "pattern_optimization": true,
      "use_pattern_cache": true
    }
  }'
```

### File Storage - POST /api/file/store

Atomic file storage with transaction management and schema validation:

```bash
# Create new record
curl -X POST http://localhost:9001/api/file/store \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/new-account.json",
    "content": {
      "name": "New Account",
      "email": "account@example.com"
    },
    "file_options": {
      "atomic": true,
      "overwrite": true,
      "validate_schema": true
    }
  }'

# Update specific field
curl -X POST http://localhost:9001/api/file/store \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/account-123/email",
    "content": "newemail@example.com",
    "file_options": {
      "atomic": true,
      "append_mode": false
    }
  }'
```

### File Deletion - POST /api/file/delete

Safe deletion with soft-delete support and comprehensive safety checks:

```bash
# Soft delete (recoverable)
curl -X POST http://localhost:9001/api/file/delete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/account-123",
    "file_options": {
      "permanent": false,
      "atomic": true,
      "force": false
    }
  }'

# Permanent deletion
curl -X POST http://localhost:9001/api/file/delete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/old-account",
    "file_options": {
      "permanent": true,
      "atomic": true,
      "force": true
    }
  }'

# Field clearing
curl -X POST http://localhost:9001/api/file/delete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/account-123/temp_field",
    "file_options": {
      "atomic": true
    }
  }'
```

### File Status Information - POST /api/file/stat

Enhanced status information with schema introspection for comprehensive File STAT command support:

```bash
# Basic file/directory status
curl -X POST http://localhost:9001/api/file/stat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/accounts/"
  }'

# Response with enhanced schema information
{
  "success": true,
  "path": "/data/accounts/",
  "type": "directory",
  "permissions": "rwx",
  "size": 0,
  "modified_time": "20250826143022",
  "created_time": "20250826143022",
  "access_time": "20250826143022",
  "record_info": {
    "schema": "account",
    "soft_deleted": false,
    "access_permissions": ["read", "edit"]
  },
  "children_count": 247,
  "total_size": 0,

  // NEW: Enhanced schema introspection (Issue #165)
  "schema_info": {
    "description": "Account management and authentication",
    "record_count": 0,         // TODO: Would require database query
    "recent_changes": 0,       // TODO: Would require database query
    "last_modified": null,     // TODO: Would require database query
    "field_definitions": [
      {
        "name": "name",
        "type": "string",
        "required": true,
        "constraints": "min 1 chars, max 100 chars",
        "description": "Account holder display name",
        "usage_percentage": null,    // TODO: Would require database analysis
        "common_values": null        // TODO: Would require database analysis
      },
      {
        "name": "email",
        "type": "string",
        "required": true,
        "constraints": "email format",
        "description": "Login identifier",
        "usage_percentage": null,
        "common_values": null
      },
      {
        "name": "role",
        "type": "string",
        "required": true,
        "constraints": "account|admin|moderator",
        "description": "Access level",
        "usage_percentage": null,
        "common_values": null
      }
    ],
    "common_operations": null    // TODO: Could infer from schema patterns
  }
}
```

#### Schema Introspection Features

- **Field Definitions**: Complete field structure from cached JSON Schema
- **Type Information**: Field types, required status, validation constraints
- **Human-Readable Constraints**: Min/max length, format rules, enum values
- **Performance Optimized**: Uses existing SchemaCache (no database queries)
- **Future-Ready**: Interface prepared for database statistics when needed

#### File STAT Command Integration

The enhanced response enables rich File STAT command output:

```
213-File status: /data/account
213-Type: directory (Account management and authentication)
213-Schema: account
213-
213-Required Fields:
213-  name (string, min 1 chars, max 100 chars) - Account holder display name
213-  email (string, email format) - Login identifier
213-  role (string, account|admin|moderator) - Access level
213-
213-Optional Fields:
213-  department (string, min 1 chars, max 50 chars) - Organizational unit
213-  last_login (string, date-time format) - Most recent authentication
213-
213-Permissions: rwx
213-Size: 0 bytes across 247 entries
213-Modified: Aug 26 2025 14:30:22
213 End of status information
```

#### Benefits

- **Rich Documentation**: Complete schema structure through File protocol
- **Developer Experience**: Schema discovery using familiar STAT command
- **AI Integration**: Full field context available for automated operations
- **Performance**: Fast response using cached schema definitions

## Advanced File Features

### Transaction Management

All File operations support atomic transactions with automatic rollback:

```typescript
// Automatic transaction (default)
{
  "file_options": {
    "atomic": true  // Creates transaction automatically
  }
}

// Join existing transaction
{
  "metadata": {
    "transaction_id": "file-store-1703123456789-abc123"
  },
  "file_options": {
    "atomic": true
  }
}
```

### Content Processing

Intelligent content type detection and processing:

```bash
# JSON content (auto-detected)
{
  "content": {"name": "Account"},
  "metadata": {"content_type": "application/json"}
}

# Binary content
{
  "content": "base64-encoded-data",
  "file_options": {"binary_mode": true},
  "metadata": {"content_type": "application/octet-stream"}
}

# String append mode
{
  "path": "/data/accounts/account-123/description",
  "content": " - Additional info",
  "file_options": {"append_mode": true}
}
```

### Wildcard Pattern Support (Phase 2)

Complex pattern matching with performance optimization:

```bash
# Multiple wildcards
"/data/accounts/*admin*/department/eng*/"

# Alternative patterns
"/data/orders/status/(pending|active|shipped)/"

# Range patterns
"/data/logs/2024-[01-12]*/level/error/"

# Cross-schema patterns
"/data/*/recent_activity/"
```

#### File Wildcard Translation

```bash
# File Path: /data/accounts/*admin*/department/*eng*/created/2024-*
# Translates to Filter:
{
  "where": {
    "$and": [
      { "id": { "$like": "%admin%" } },
      { "department": { "$like": "%eng%" } },
      { "created_at": { "$like": "2024-%" } }
    ]
  }
}
```

### Performance & Caching

Built-in optimization and caching systems:

```bash
# Pattern caching (automatic)
{
  "file_options": {
    "use_pattern_cache": true,
    "pattern_optimization": true
  }
}

# Performance hints
{
  "performance_hints": {
    "expected_result_count": 100,
    "priority": "speed",
    "timeout_ms": 15000
  }
}
```

## File Response Format

Consistent response structure across all File operations:

### LIST Response

```typescript
{
  "success": true,
  "entries": [
    {
      "name": "account-123",
      "file_type": "d",           // Directory, File, Link
      "file_size": 1024,
      "file_permissions": "rwx",
      "file_modified": "20241201120000",
      "path": "/data/accounts/account-123/",
      "api_context": {
        "schema": "accounts",
        "record_id": "account-123",
        "access_level": "full"
      }
    }
  ],
  "pattern_info": {
    "complexity": "complex",
    "cache_hit": true,
    "query_time_ms": 45.67
  }
}
```

### STORE Response

```typescript
{
  "success": true,
  "operation": "create",
  "result": {
    "record_id": "account-123",
    "size": 256,
    "created": true,
    "validation_passed": true
  },
  "file_metadata": {
    "modified_time": "20241201120000",
    "permissions": "rwx",
    "etag": "abc123def456",
    "content_type": "application/json"
  },
  "transaction_info": {
    "transaction_id": "file-store-...",
    "can_rollback": false,
    "timeout_ms": 30000
  }
}
```

## Security & Permissions

File operations integrate with the ACL system:

### Permission Requirements
- **Record creation**: Any schema access
- **Record updates**: access_edit or access_full
- **Record deletion**: access_full required
- **Field operations**: access_edit or access_full

### Permission Validation
- **Root account**: All operations allowed
- **Regular accounts**: ACL-based validation
- **Cross-tenant**: Blocked automatically
- **Dangerous operations**: Require force=true

## Testing Examples

### Unit Testing
```bash
# File middleware unit tests
npm run spec:all unit/file

# File operations unit tests
npm run spec:one spec/unit/file/file-operations.test.ts

# Path parsing validation
npm run spec:one spec/unit/file/file-path-parsing.test.ts
```

### Integration Testing
```bash
# File endpoint integration tests (database required)
npm run spec:all integration/file

# HTTP integration testing
npm run spec:one spec/integration/file/file-operations-integration.test.ts
```

### Manual Testing Examples
```bash
# Store operation
curl -X POST http://localhost:9001/api/file/store -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/accounts/test.json", "content": {"name": "Test"}, "file_options": {"atomic": true}}'

# Delete operation
curl -X POST http://localhost:9001/api/file/delete -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/accounts/test", "file_options": {"permanent": false, "atomic": true}}'
```
