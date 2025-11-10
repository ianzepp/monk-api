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
7. [Additional Resources](#additional-resources)

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
- **38-ACLs API**: `admin` or `root` access level required
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
  "username": "admin",
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

## Additional Resources

### Related Documentation
- [DEVELOPER.md](DEVELOPER.md) - Development setup and architecture
- [ERRORS.md](ERRORS.md) - Error handling and troubleshooting
- [FILE.md](FILE.md) - File system interface details
- [FILTER.md](FILTER.md) - Advanced filtering and query capabilities
- [OBSERVERS.md](OBSERVERS.md) - Observer system integration
- [TEST.md](TEST.md) - Testing framework and best practices
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions

### API Testing
Each API section includes comprehensive test coverage. Test files are located in:
```
spec/{api-section}/
├── README.md           # Test coverage details
├── *.test.sh          # Individual test files
└── test-helpers.sh    # Shared test utilities
```

### CLI Integration
The platform includes CLI tools that wrap these APIs:
```bash
# Authentication
monk auth login my-tenant admin

# Schema operations
monk describe create users < users.json

# Data operations
monk data create users '{"name": "Test User"}'

# Advanced queries
monk data select users --where '{"status": "active"}' --limit 10
```

### Support and Community
- **Issues**: Report bugs and feature requests via GitHub issues
- **Discussions**: Join community discussions for questions and best practices
- **Contributing**: See [DEVELOPER.md](DEVELOPER.md) for contribution guidelines

---

**Next Steps**: Choose an API section from the list above to explore detailed documentation, examples, and implementation guides for specific use cases.