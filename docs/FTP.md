# FTP Middleware Documentation

## Overview

The FTP Middleware provides filesystem-like access to Monk API data through HTTP endpoints that simulate FTP operations. This enables developers to interact with API data using familiar file/directory patterns while leveraging the full power of the observer pipeline and database backend.

## FTP Path Structure

FTP middleware provides filesystem-like access to API data with intuitive path mapping:

```
/data/                          → List all schemas
/data/users/                    → List all user records
/data/users/user-123/           → List record fields + .json file
/data/users/user-123.json       → Complete record as JSON
/data/users/user-123/email      → Individual field access
/meta/schema/                   → Schema definitions
```

## Core FTP Operations

### Directory Listing - POST /ftp/list

Advanced directory listing with wildcard support and performance optimization:

```bash
# Basic listing
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/",
    "ftp_options": {
      "show_hidden": false,
      "long_format": true,
      "recursive": false
    }
  }'

# Wildcard patterns (Phase 2)
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/admin*",
    "ftp_options": {
      "pattern_optimization": true,
      "use_pattern_cache": true
    }
  }'
```

### File Storage - POST /ftp/store

Atomic file storage with transaction management and schema validation:

```bash
# Create new record
curl -X POST http://localhost:9001/ftp/store \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/new-user.json",
    "content": {
      "name": "New User",
      "email": "user@example.com"
    },
    "ftp_options": {
      "atomic": true,
      "overwrite": true,
      "validate_schema": true
    }
  }'

# Update specific field
curl -X POST http://localhost:9001/ftp/store \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/user-123/email",
    "content": "newemail@example.com",
    "ftp_options": {
      "atomic": true,
      "append_mode": false
    }
  }'
```

### File Deletion - POST /ftp/delete

Safe deletion with soft-delete support and comprehensive safety checks:

```bash
# Soft delete (recoverable)
curl -X POST http://localhost:9001/ftp/delete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/user-123",
    "ftp_options": {
      "permanent": false,
      "atomic": true,
      "force": false
    }
  }'

# Permanent deletion
curl -X POST http://localhost:9001/ftp/delete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/old-user",
    "ftp_options": {
      "permanent": true,
      "atomic": true,
      "force": true
    }
  }'

# Field clearing
curl -X POST http://localhost:9001/ftp/delete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "path": "/data/users/user-123/temp_field",
    "ftp_options": {
      "atomic": true
    }
  }'
```

## Advanced FTP Features

### Transaction Management

All FTP operations support atomic transactions with automatic rollback:

```typescript
// Automatic transaction (default)
{
  "ftp_options": {
    "atomic": true  // Creates transaction automatically
  }
}

// Join existing transaction
{
  "metadata": {
    "transaction_id": "ftp-store-1703123456789-abc123"
  },
  "ftp_options": {
    "atomic": true
  }
}
```

### Content Processing

Intelligent content type detection and processing:

```bash
# JSON content (auto-detected)
{
  "content": {"name": "User"},
  "metadata": {"content_type": "application/json"}
}

# Binary content  
{
  "content": "base64-encoded-data",
  "ftp_options": {"binary_mode": true},
  "metadata": {"content_type": "application/octet-stream"}
}

# String append mode
{
  "path": "/data/users/user-123/description",
  "content": " - Additional info",
  "ftp_options": {"append_mode": true}
}
```

### Wildcard Pattern Support (Phase 2)

Complex pattern matching with performance optimization:

```bash
# Multiple wildcards
"/data/users/*admin*/department/eng*/"

# Alternative patterns  
"/data/orders/status/(pending|active|shipped)/"

# Range patterns
"/data/logs/2024-[01-12]*/level/error/"

# Cross-schema patterns
"/data/*/recent_activity/"
```

#### FTP Wildcard Translation

```bash
# FTP Path: /data/users/*admin*/department/*eng*/created/2024-*
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
  "ftp_options": {
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

## FTP Response Format

Consistent response structure across all FTP operations:

### LIST Response

```typescript
{
  "success": true,
  "entries": [
    {
      "name": "user-123",
      "ftp_type": "d",           // Directory, File, Link
      "ftp_size": 1024,
      "ftp_permissions": "rwx",
      "ftp_modified": "20241201120000",
      "path": "/data/users/user-123/",
      "api_context": {
        "schema": "users",
        "record_id": "user-123",
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
    "record_id": "user-123",
    "size": 256,
    "created": true,
    "validation_passed": true
  },
  "ftp_metadata": {
    "modified_time": "20241201120000",
    "permissions": "rwx",
    "etag": "abc123def456",
    "content_type": "application/json"
  },
  "transaction_info": {
    "transaction_id": "ftp-store-...",
    "can_rollback": false,
    "timeout_ms": 30000
  }
}
```

## Security & Permissions

FTP operations integrate with the ACL system:

### Permission Requirements
- **Record creation**: Any schema access
- **Record updates**: access_edit or access_full
- **Record deletion**: access_full required
- **Field operations**: access_edit or access_full

### Permission Validation
- **Root user**: All operations allowed
- **Regular users**: ACL-based validation  
- **Cross-tenant**: Blocked automatically
- **Dangerous operations**: Require force=true

## Testing Examples

### Unit Testing
```bash
# FTP middleware unit tests
npm run spec:all unit/ftp

# File operations unit tests
npm run spec:one spec/unit/ftp/file-operations.test.ts

# Path parsing validation
npm run spec:one spec/unit/ftp/ftp-path-parsing.test.ts
```

### Integration Testing
```bash
# FTP endpoint integration tests (database required)
npm run spec:all integration/ftp

# HTTP integration testing
npm run spec:one spec/integration/ftp/file-operations-integration.test.ts
```

### Manual Testing Examples
```bash
# Store operation
curl -X POST http://localhost:9001/ftp/store -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/users/test.json", "content": {"name": "Test"}, "ftp_options": {"atomic": true}}'

# Delete operation
curl -X POST http://localhost:9001/ftp/delete -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/users/test", "ftp_options": {"permanent": false, "atomic": true}}'
```

## Implementation Status

- ✅ **Phase 1**: Basic FTP endpoints (Issue #123)
- ✅ **Phase 2**: Advanced wildcard translation (Issue #124)  
- ✅ **Phase 3**: File Operations and Storage (Issue #125)
- 🔄 **Future**: Real FTP server integration with monk-ftp project

For the actual FTP server implementation, see: https://github.com/ianzepp/monk-ftp