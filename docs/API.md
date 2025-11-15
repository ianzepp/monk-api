# API Documentation

> **Complete API Reference for the Monk Platform**
>
> This document provides an executive overview of all available APIs with links to detailed documentation for each API section. For comprehensive implementation details, examples, and advanced usage patterns, refer to the individual API documentation linked below.

## Table of Contents

1. [API Architecture Overview](#api-architecture-overview)
2. [Authentication & Security](#authentication--security)
3. [Core API Sections](#core-api-sections)
4. [API Quick Reference](#api-quick-reference)
5. [Getting Started](#getting-started)
6. [Integration Examples](#integration-examples)
7. [Error Handling and HTTP Status Codes](#error-handling-and-http-status-codes)
8. [Additional Resources](#additional-resources)

## API Architecture Overview

The Monk platform provides a comprehensive suite of APIs organized into logical sections (30-39) that cover all aspects of data management, security, and system administration.

### Key Architectural Principles
- **Multi-tenant Architecture**: Each tenant gets isolated database and user management
- **Observer Pipeline**: All operations pass through validation, security, audit, and integration layers
- **RESTful Design**: Consistent endpoint patterns and HTTP methods
- **JWT Authentication**: Secure token-based authentication with tenant isolation
- **Soft Delete System**: Three-tier access pattern for data lifecycle management
- **Enterprise Filtering**: 25+ operators for complex query patterns

### Base URL Structure
```
https://api.example.com/{api-section}/{resource}
```

### Response Format
All APIs return consistent JSON responses:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

## Authentication & Security

### JWT Token Structure
```json
{
  "tenant": "tenant_name",
  "database": "tenant_12345678",
  "access": "user_access_level",
  "user": "username",
  "exp": 1234567890
}
```

### Authentication Header
```bash
Authorization: Bearer <jwt_token>
```

### Required Permissions by API Section
- **30-Auth API**: Public endpoints (login, whoami)
- **31-Meta API**: `read_data`, `create_data`, `update_data`, `delete_data`
- **32-Data API**: `create_data`, `read_data`, `update_data`, `delete_data`
- **33-Find API**: `read_data` (with advanced filtering)
- **35-Bulk API**: Corresponding permissions for each operation type
- **37-File API**: File operation permissions mapped to data permissions
- **38-ACLs API**: `full` or `root` access level required
- **39-Root API**: `root` access level required

## Core API Sections

### [30-Auth API](30-auth-api.md)
**Authentication and User Management**
- User login and authentication
- Session management
- User profile operations
- Public access endpoints

### [31-Meta API](31-meta-api.md)
**Schema Management and Metadata**
- Schema creation and updates
- Schema discovery and introspection
- DDL generation and migration
- Schema validation and constraints

### [32-Data API](32-data-api.md)
**Core CRUD Operations and Data Management**
- Create, Read, Update, Delete operations
- Relationship management (belongs_to, has_many, many_to_many)
- Bulk operations and soft delete system
- Advanced filtering and pagination

### [33-Find API](33-find-api.md)
**Advanced Search and Filtering**
- Enterprise-grade search with 25+ operators
- Complex logical expressions and nesting
- Full-text search and text operations
- Performance optimization and query planning

### [35-Bulk API](35-bulk-api.md)
**Transaction-Safe Bulk Operations**
- Atomic transaction processing
- Mixed operation types in single request
- Multi-schema operations
- Automatic rollback on failure

### [37-File API](37-file-api.md)
**Virtual File System Interface**
- File-like operations on database records
- Content type detection and conversion
- Directory listing and browsing
- Metadata access and access control

### [38-ACLs API](38-acls-api.md)
**Access Control Lists Management**
- Record-level permission management
- Four permission levels (read, edit, full, deny)
- User and group-based access control
- Bulk ACL operations with filtering

### [39-Root API](39-root-api.md)
**System Administration and Tenant Management**
- Tenant lifecycle management
- System health monitoring
- Database provisioning and cleanup
- Administrative operations and controls

## API Quick Reference

### Endpoint Patterns by Section

| API Section | Base Pattern | Primary Operations |
|-------------|--------------|-------------------|
| 30-Auth | `/auth/*` | Login, whoami, profile |
| 31-Meta | `/api/describe/:schema` | Schema CRUD operations |
| 32-Data | `/api/data/:schema[/:id]` | Record CRUD operations |
| 33-Find | `/api/find/:schema` | Advanced search and filtering |
| 35-Bulk | `/api/bulk` | Transaction-safe bulk operations |
| 37-File | `/api/file/*` | Virtual file system operations |
| 38-ACLs | `/api/acls/:schema[/:record]` | Access control management |
| 39-Root | `/api/root/tenant[/:name]` | Tenant administration |

### Common HTTP Methods
- **GET**: Retrieve data and metadata
- **POST**: Create resources and execute operations
- **PUT**: Update/replace existing resources
- **DELETE**: Remove resources (soft delete by default)

### Query Parameters
- `?where={}`: Filter results (Find API, Data API)
- `?limit=N`: Limit result count
- `?order=["field desc"]`: Sort results
- `?include_trashed=true`: Include soft-deleted records
- `?force=true`: Override safety checks

## Getting Started

### 1. Authentication
```bash
# Login to get JWT token
POST /auth/login
{
  "tenant": "my_tenant",
  "username": "full",
  "password": "secure_password"
}

# Response includes JWT token
{
  "success": true,
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

### 2. Schema Creation
```bash
# Create a new schema
POST /api/describe/users
Authorization: Bearer <token>
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "email": {"type": "string", "format": "email"}
  },
  "required": ["name", "email"]
}
```

### 3. Data Operations
```bash
# Create a record
POST /api/data/users
Authorization: Bearer <token>
{
  "name": "John Doe",
  "email": "john@example.com"
}

# Query with filtering
POST /api/find/users
Authorization: Bearer <token>
{
  "where": {"status": "active"},
  "limit": 10,
  "order": ["created_at desc"]
}
```

### 4. Bulk Operations
```bash
# Multiple operations in transaction
POST /api/bulk
Authorization: Bearer <token>
{
  "operations": [
    {
      "operation": "create-all",
      "schema": "users",
      "data": [{"name": "User 1"}, {"name": "User 2"}]
    },
    {
      "operation": "update-all",
      "schema": "accounts",
      "where": {"status": "pending"},
      "data": {"status": "active"}
    }
  ]
}
```

## Integration Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://api.example.com/api/data/users', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Jane Smith',
    email: 'jane@example.com'
  })
});

const result = await response.json();
```

### Python
```python
import requests

headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

data = {
    'where': {'status': 'active', 'age': {'$gte': 18}},
    'limit': 50,
    'order': ['created_at desc']
}

response = requests.post(
    'https://api.example.com/api/find/users',
    headers=headers,
    json=data
)

results = response.json()
```

### cURL
```bash
# Create schema
curl -X POST https://api.example.com/api/describe/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "object", "properties": {"name": {"type": "string"}}}'

# Bulk operations
curl -X POST https://api.example.com/api/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {"operation": "create-all", "schema": "products", "data": [{"name": "Product 1"}]}
    ]
  }'
```

## Error Handling and HTTP Status Codes

### Error Response Format

All API endpoints return consistent error responses following this standardized format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_ERROR_CODE",
  "data": {
    // Optional additional error context
  }
}
```

#### Response Fields

**`success`**
- **Type**: `boolean`
- **Value**: Always `false` for error responses
- **Purpose**: Distinguishes error responses from successful responses

**`error`**
- **Type**: `string`
- **Purpose**: Human-readable error message intended for display to end users
- **Language**: English
- **Format**: Clear, actionable description of what went wrong

**`error_code`**
- **Type**: `string`
- **Purpose**: Machine-readable error identifier for programmatic handling
- **Format**: `SUBJECT_FIRST` naming convention (e.g., `SCHEMA_NOT_FOUND`, `TENANT_MISSING`)
- **Stability**: Error codes are stable across API versions for reliable client handling

**`data`** (Optional)
- **Type**: `object`
- **Purpose**: Additional structured error context when relevant
- **Contents**: May include validation details, conflicting values, or other contextual information
- **Development Mode**: In `NODE_ENV=development`, includes additional debugging information such as stack traces

### HTTP Status Codes

Error responses use appropriate HTTP status codes that correspond to the type of error:

| Status Code | Category | Description | Common Error Codes |
|-------------|----------|-------------|-------------------|
| `400` | Bad Request | Client error - invalid input, missing required fields, malformed requests | `VALIDATION_ERROR`, `JSON_PARSE_ERROR`, `MISSING_CONTENT_TYPE`, `SCHEMA_ERROR` |
| `401` | Unauthorized | Authentication required or failed | `UNAUTHORIZED`, `TOKEN_EXPIRED` |
| `403` | Forbidden | Access denied - insufficient permissions for the requested operation | `FORBIDDEN`, `SCHEMA_PROTECTED`, `ACCESS_DENIED` |
| `404` | Not Found | Requested resource does not exist | `NOT_FOUND`, `SCHEMA_NOT_FOUND`, `RECORD_NOT_FOUND` |
| `405` | Method Not Allowed | HTTP method not supported for this endpoint | `UNSUPPORTED_METHOD` |
| `409` | Conflict | Request conflicts with current resource state | `CONFLICT`, `DEPENDENCY_ERROR` |
| `413` | Request Entity Too Large | Request body exceeds size limit | `REQUEST_BODY_TOO_LARGE` |
| `415` | Unsupported Media Type | Content-Type not supported | `UNSUPPORTED_CONTENT_TYPE` |
| `422` | Unprocessable Entity | Request is well-formed but semantically invalid | `UNPROCESSABLE_ENTITY` |
| `500` | Internal Server Error | Unexpected server error or system failure | `INTERNAL_ERROR`, `DATABASE_ERROR` |

### Error Code Reference

#### Schema Management Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `SCHEMA_NOT_FOUND` | Requested schema does not exist | 404 |
| `SCHEMA_PROTECTED` | Cannot modify system-protected schema | 403 |
| `SCHEMA_INVALID_FORMAT` | Schema definition has invalid format | 400 |
| `SCHEMA_MISSING_FIELDS` | Schema missing required fields (title, properties) | 400 |
| `SCHEMA_EXISTS` | Schema already exists (conflict) | 409 |

#### Authentication & Authorization Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `UNAUTHORIZED` | Missing or invalid authentication | 401 |
| `TOKEN_EXPIRED` | JWT token has expired | 401 |
| `FORBIDDEN` | Insufficient permissions for operation | 403 |
| `ACCESS_DENIED` | Access denied to resource | 403 |
| `TENANT_MISSING` | Tenant not found or invalid | 401 |
| `USERNAME_MISSING` | Username not provided | 401 |

#### Request Validation Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `VALIDATION_ERROR` | General validation failure | 400 |
| `JSON_PARSE_ERROR` | Invalid JSON format in request body | 400 |
| `MISSING_CONTENT_TYPE` | Content-Type header missing for POST/PUT/PATCH | 400 |
| `UNSUPPORTED_CONTENT_TYPE` | Content-Type not supported | 415 |
| `REQUEST_BODY_TOO_LARGE` | Request body exceeds 10MB limit | 413 |
| `UNSUPPORTED_METHOD` | HTTP method not supported | 405 |
| `INVALID_REQUEST_BODY` | Request body format is invalid | 400 |

#### Data Operation Errors
| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `RECORD_NOT_FOUND` | Requested record does not exist | 404 |
| `RECORD_ALREADY_EXISTS` | Record already exists (unique constraint) | 409 |
| `DEPENDENCY_ERROR` | Operation conflicts with existing dependencies | 409 |
| `DATABASE_ERROR` | Database operation failed | 500 |

### Error Code Naming Convention

Error codes follow a consistent `SUBJECT_FIRST` pattern for logical grouping and easy filtering:

- **Schema errors**: `SCHEMA_NOT_FOUND`, `SCHEMA_PROTECTED`, `SCHEMA_INVALID_FORMAT`
- **Record errors**: `RECORD_NOT_FOUND`, `RECORD_ALREADY_EXISTS`
- **Authentication errors**: `TENANT_MISSING`, `USERNAME_MISSING`, `TOKEN_EXPIRED`
- **Permission errors**: `ACCESS_DENIED`, `OPERATION_FORBIDDEN`
- **Request errors**: `JSON_PARSE_ERROR`, `MISSING_CONTENT_TYPE`, `UNSUPPORTED_METHOD`

This convention enables:
- **Logical grouping**: All schema-related errors start with `SCHEMA_*`
- **Easy filtering**: Client code can check `errorCode.startsWith('SCHEMA_')`
- **Consistent sorting**: Related errors group together alphabetically

### Environment-Specific Behavior

#### Production Mode
- Error messages are sanitized and generic
- No sensitive system information exposed
- Stack traces omitted from response

#### Development Mode (`NODE_ENV=development`)
- Detailed error information included in `data` field
- Stack traces provided for debugging
- Additional context about error source and cause
- JSON parsing errors include line, column, and position information

### Client Error Handling Best Practices

Clients should handle errors by:

1. **Check HTTP status code** for error category
2. **Use `error_code`** for specific error handling logic
3. **Display `error` message** to users when appropriate
4. **Process `data` field** for additional context when present
5. **Implement retry logic** for transient errors (5xx status codes)
6. **Log errors** with correlation IDs for debugging

### Example Error Handling Code

```javascript
try {
  const response = await fetch('/api/describe/users', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(schemaData)
  });
  
  const result = await response.json();
  
  if (!result.success) {
    // Handle specific error codes
    switch (result.error_code) {
      case 'SCHEMA_NOT_FOUND':
        console.error('Schema does not exist:', result.error);
        break;
      case 'JSON_PARSE_ERROR':
        console.error('Invalid JSON:', result.data?.details);
        console.error('Position:', result.data?.position);
        break;
      case 'SCHEMA_PROTECTED':
        console.error('Cannot modify protected schema:', result.error);
        break;
      default:
        console.error('API Error:', result.error, result.error_code);
    }
  }
} catch (error) {
  console.error('Network or parsing error:', error);
}
```

## Additional Resources

### API Testing
- **Test Suite**: Comprehensive test coverage with 200+ test cases
- **Test Patterns**: See [spec/](../spec/) directory for test examples
- **Test Execution**: `npm run test:sh` for shell tests, `npm run test:ts` for TypeScript tests
- **Coverage**: All API endpoints have corresponding test specifications

### CLI Integration
- **Authentication**: `monk auth login` for token acquisition
- **Schema Management**: `monk describe create users` for schema creation
- **Data Operations**: `monk data create users '{"name": "John"}'` for record creation
- **Bulk Operations**: `monk bulk create users data.json` for batch processing
- **File Operations**: `monk file store local-file.txt remote-path.txt` for file management

### Support and Community
- **GitHub Issues**: Report bugs and request features
- **Documentation**: Comprehensive guides and examples
- **Community**: Join discussions and share experiences

### Related Documentation
- [DEVELOPER.md](DEVELOPER.md) - Development setup and architecture
- [37-file-api.md](37-file-api.md) - File system interface details
- [33-find-api.md](33-find-api.md) - Advanced filtering and query capabilities
- [OBSERVERS.md](OBSERVERS.md) - Observer system integration
- [FIXTURES.md](FIXTURES.md) - Template-based database cloning system for testing
- [TEST.md](TEST.md) - Testing framework and best practices
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
