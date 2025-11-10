# 37-File API Documentation

> **Virtual File System Interface**
>
> The File API provides a virtual file system interface that maps database records and schemas to a hierarchical file structure. It supports file-like operations including storage, retrieval, metadata access, and directory listing with full integration to the observer pipeline.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoints](#core-endpoints)
4. [File System Structure](#file-system-structure)
5. [File Operations](#file-operations)
6. [Directory Operations](#directory-operations)
7. [Metadata and Access Control](#metadata-and-access-control)
8. [Content Type Handling](#content-type-handling)
9. [Error Handling](#error-handling)
10. [Testing](#testing)
11. [Common Use Cases](#common-use-cases)

## Overview

The File API provides a unique virtual file system interface that treats database records as files and schemas as directories. This enables file-like operations on data while maintaining full database integrity and observer pipeline integration.

### Key Capabilities
- **Virtual File System**: Map database records to file paths
- **Content Type Support**: JSON, CSV, binary, and custom formats
- **Metadata Access**: File-like stat operations with database integration
- **Directory Listing**: Browse schemas and records hierarchically
- **Observer Pipeline**: Full validation, security, audit, and integration processing
- **Access Control**: Schema and record-level permissions with file semantics

### Base URLs
```
POST /api/file/store     # Store/create files and records
POST /api/file/retrieve  # Retrieve file content and metadata
POST /api/file/stat      # Get file/directory metadata
POST /api/file/list      # List directory contents
POST /api/file/delete    # Delete files and records
POST /api/file/size      # Get file sizes and storage info
POST /api/file/modify-time # Get/set modification times
```

## Authentication

All File API endpoints require valid JWT authentication. The API respects tenant isolation and applies appropriate permissions based on the underlying schema operations.

```bash
Authorization: Bearer <jwt>
```

### Required Permissions
Permissions are determined by the underlying schema operations:
- **File Storage**: `create_data` or `update_data` permission
- **File Retrieval**: `read_data` permission
- **File Deletion**: `delete_data` permission
- **Directory Listing**: `read_data` permission for schemas

## Core Endpoints

### POST /api/file/store

Stores or creates files and records with automatic content type detection.

```bash
POST /api/file/store
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "path": "/data/users/john_doe.json",
  "content": {
    "name": "John Doe",
    "email": "john@example.com",
    "role": "developer"
  },
  "file_options": {
    "create_parents": true,
    "overwrite": false,
    "content_type": "application/json"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "operation": "create",
    "path": "/data/users/john_doe.json",
    "result": {
      "id": "user_123456",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "developer",
      "created_at": "2025-01-01T12:00:00.000Z"
    },
    "file_metadata": {
      "size": 256,
      "content_type": "application/json",
      "created_at": "2025-01-01T12:00:00.000Z",
      "modified_at": "2025-01-01T12:00:00.000Z"
    }
  }
}
```

### POST /api/file/retrieve

Retrieves file content and metadata with format options.

```bash
POST /api/file/retrieve
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "path": "/data/users/john_doe.json",
  "file_options": {
    "format": "json",
    "include_metadata": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "content": {
      "id": "user_123456",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "developer",
      "created_at": "2025-01-01T12:00:00.000Z",
      "updated_at": "2025-01-01T12:00:00.000Z"
    },
    "file_metadata": {
      "size": 256,
      "content_type": "application/json",
      "created_at": "2025-01-01T12:00:00.000Z",
      "modified_at": "2025-01-01T12:00:00.000Z",
      "access_level": "read-write"
    }
  }
}
```

### POST /api/file/stat

Gets detailed metadata for files and directories.

```bash
POST /api/file/stat
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "path": "/data/users"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/data/users",
    "type": "directory",
    "name": "users",
    "size": 0,
    "children_count": 150,
    "access_level": "read-write",
    "created_at": "2024-01-01T00:00:00.000Z",
    "modified_at": "2025-01-01T12:00:00.000Z",
    "permissions": {
      "read": true,
      "write": true,
      "delete": false
    },
    "schema_info": {
      "name": "users",
      "type": "object",
      "description": "User management schema"
    }
  }
}
```

## File System Structure

### Hierarchical Mapping

The File API maps database structure to a hierarchical file system:

```
/                          # Root directory
├── data/                  # Data namespace (schemas as directories)
│   ├── users/             # Users schema directory
│   │   ├── user_123.json  # Individual user record
│   │   ├── user_456.json  # Individual user record
│   │   └── index.json     # Schema metadata
│   ├── accounts/          # Accounts schema directory
│   │   ├── acc_789.json  # Individual account record
│   │   └── index.json    # Schema metadata
│   └── describe/         # Schema definitions
│       ├── users.json    # Users schema definition
│       └── accounts.json # Accounts schema definition
└── system/               # System files and configuration
    ├── config.json       # System configuration
    └── logs/             # Log files
```

### Path Conventions
- **Schema Directories**: `/data/:schema/`
- **Record Files**: `/data/:schema/:id.json`
- **Schema Metadata**: `/data/:schema/index.json`
- **Schema Definitions**: `/describe/:schema.json`

## File Operations

### Record Creation
Create new database records through file storage:

```json
{
  "path": "/data/products/new_product.json",
  "content": {
    "name": "New Product",
    "price": 99.99,
    "category": "electronics",
    "in_stock": true
  },
  "file_options": {
    "create_parents": true,
    "content_type": "application/json"
  }
}
```

### Record Updates
Update existing records with file semantics:

```json
{
  "path": "/data/products/prod_123.json",
  "content": {
    "price": 79.99,
    "in_stock": false,
    "updated_at": "2025-01-01T12:00:00Z"
  },
  "file_options": {
    "overwrite": true,
    "content_type": "application/json"
  }
}
```

### Binary File Support
Store binary data with appropriate content types:

```json
{
  "path": "/data/documents/report_2024.pdf",
  "content": "JVBERi0xLjQKJcOkw7zDtsO8CjIgMCBvYmoKPDwKL0xlbmd0aCAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQo+PgpzdHJlYW0KeJzLSMxLLUmNzNFLzs8rzi9KycxLt4IDAIvJBw4KZW5kc3RyZWFtCmVuZG9iago=",
  "file_options": {
    "content_type": "application/pdf",
    "encoding": "base64"
  }
}
```

## Directory Operations

### Directory Listing
List contents of schema directories:

```bash
POST /api/file/list
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "path": "/data/users",
  "file_options": {
    "recursive": false,
    "include_hidden": false,
    "sort_by": "name"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/data/users",
    "contents": [
      {
        "name": "index.json",
        "type": "file",
        "size": 1024,
        "modified_at": "2025-01-01T00:00:00.000Z"
      },
      {
        "name": "user_123.json",
        "type": "file", 
        "size": 256,
        "modified_at": "2025-01-01T12:00:00.000Z"
      },
      {
        "name": "user_456.json",
        "type": "file",
        "size": 256,
        "modified_at": "2025-01-01T11:00:00.000Z"
      }
    ],
    "total_count": 150,
    "page": 1,
    "page_size": 50
  }
}
```

### Recursive Listing
Get complete directory tree structure:

```json
{
  "path": "/data",
  "file_options": {
    "recursive": true,
    "max_depth": 3
  }
}
```

## Metadata and Access Control

### File Metadata
Access detailed metadata for any file or directory:

```json
{
  "path": "/data/users/user_123.json",
  "file_options": {
    "include_schema": true,
    "include_permissions": true
  }
}
```

### Access Level Integration
The File API respects database access control through file semantics:

```json
{
  "success": true,
  "data": {
    "path": "/data/users/user_123.json",
    "access_level": "read-only",
    "permissions": {
      "read": true,
      "write": false,
      "delete": false,
      "execute": false
    },
    "owner": "user_456",
    "group": "administrators",
    "acl": {
      "user:user_456": ["read", "write"],
      "group:administrators": ["read", "write", "delete"],
      "public": ["read"]
    }
  }
}
```

## Content Type Handling

### Automatic Detection
The File API automatically detects content types based on file extensions and content:

- **.json** → `application/json`
- **.csv** → `text/csv`
- **.pdf** → `application/pdf`
- **.txt** → `text/plain`
- **.xml** → `application/xml`

### Custom Content Types
Specify custom content types for specialized data:

```json
{
  "path": "/data/config/app_settings.conf",
  "content": "max_connections=1000\ntimeout=30\nretry_attempts=3",
  "file_options": {
    "content_type": "text/x-config",
    "encoding": "utf-8"
  }
}
```

### Format Conversion
Convert between different formats on retrieval:

```json
{
  "path": "/data/users/user_123.json",
  "file_options": {
    "format": "csv",
    "csv_options": {
      "delimiter": ",",
      "header": true
    }
  }
}
```

## Error Handling

### Common Error Responses

#### File Not Found
```json
{
  "success": false,
  "error": {
    "type": "FileNotFoundError",
    "message": "File '/data/users/nonexistent.json' not found",
    "code": "FILE_NOT_FOUND",
    "path": "/data/users/nonexistent.json"
  }
}
```

#### Permission Denied
```json
{
  "success": false,
  "error": {
    "type": "PermissionError",
    "message": "Write permission denied for '/data/users/user_123.json'",
    "code": "PERMISSION_DENIED",
    "path": "/data/users/user_123.json",
    "required_permission": "write"
  }
}
```

#### Invalid Path
```json
{
  "success": false,
  "error": {
    "type": "InvalidPathError",
    "message": "Invalid file path format: 'users/invalid/path'",
    "code": "INVALID_PATH",
    "path": "users/invalid/path"
  }
}
```

#### Content Type Mismatch
```json
{
  "success": false,
  "error": {
    "type": "ContentTypeError",
    "message": "Content type 'application/xml' not supported for path '/data/users/user_123.json'",
    "code": "CONTENT_TYPE_MISMATCH",
    "expected_type": "application/json",
    "actual_type": "application/xml"
  }
}
```

## Testing

The File API includes comprehensive test coverage for all file operations. Test files include:

- **store-basic.test.sh** - File storage and record creation
- **retrieve-basic.test.sh** - File retrieval and content access
- **stat-basic.test.sh** - File and directory metadata
- **list-basic.test.sh** - Directory listing operations
- **delete-basic.test.sh** - File deletion operations
- **size-basic.test.sh** - File size and storage information
- **modify-time-basic.test.sh** - File modification time operations
- **stat-access-levels.test.sh** - Access control and permission testing

**Note**: File API tests are currently disabled pending implementation review.

## Common Use Cases

### Data Export
Export database records as files for external processing:

```json
{
  "path": "/data/users/export_2024.json",
  "content": {
    "export_date": "2024-12-31",
    "users": [],
    "total_count": 1500
  },
  "file_options": {
    "content_type": "application/json",
    "pretty_print": true
  }
}
```

### Configuration Management
Store and retrieve application configuration:

```json
{
  "path": "/system/config/app_settings.json",
  "content": {
    "api_version": "2.0",
    "features": {
      "file_api": true,
      "bulk_operations": true,
      "advanced_filtering": true
    },
    "limits": {
      "max_file_size": 10485760,
      "max_operations": 50
    }
  }
}
```

### Report Generation
Create and access generated reports:

```json
{
  "path": "/data/reports/monthly_sales_2024_12.csv",
  "content": "Month,Product,Quantity,Revenue\n2024-12,Product A,150,15000\n2024-12,Product B,200,25000",
  "file_options": {
    "content_type": "text/csv",
    "encoding": "utf-8"
  }
}
```

### Schema Documentation
Access schema information through file interface:

```bash
# Get users schema definition
curl -X POST https://api.example.com/api/file/retrieve \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"path": "/describe/users.json"}'

# List all available schemas
curl -X POST https://api.example.com/api/file/list \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"path": "/describe"}'
```

### Backup and Archive
Create backups through file storage interface:

```json
{
  "path": "/system/backups/users_2024_12_31.json",
  "content": {
    "backup_date": "2024-12-31T23:59:59Z",
    "schema": "users",
    "record_count": 1500,
    "records": [],
    "checksum": "sha256:abc123..."
  },
  "file_options": {
    "content_type": "application/json",
    "compress": true
  }
}
```

---

**Next: [38-ACLs API Documentation](38-acls-api.md)** - Access control lists management

**Previous: [35-Bulk API Documentation](35-bulk-api.md)** - Transaction-safe bulk operations