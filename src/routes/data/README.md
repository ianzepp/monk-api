# 32-Data API Documentation

> **Core CRUD Operations and Data Management**
>
> The Data API provides comprehensive data operations including Create, Read, Update, Delete (CRUD) functionality, relationship management, and bulk operations. All operations automatically run through the observer pipeline for validation, security, audit, and integration.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core CRUD Operations](#core-crud-operations)
4. [Relationship Management](#relationship-management)
5. [Bulk Operations](#bulk-operations)
6. [Soft Delete System](#soft-delete-system)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [Common Use Cases](#common-use-cases)

## Overview

The Data API provides a complete data management system with support for both single record and bulk operations. It implements a consistent array/object pattern where collection endpoints handle arrays and individual record endpoints handle objects.

### Key Capabilities
- **Complete CRUD Operations**: Create, Read, Update, Delete with full validation
- **Relationship Management**: Support for belongs_to, has_many, and many_to_many relationships
- **Bulk Operations**: Efficient array-based operations for multiple records
- **Observer Pipeline**: Automatic validation, security, audit, and integration processing
- **Soft Delete System**: Three-tier access pattern for data lifecycle management
- **Advanced Filtering**: Enterprise-grade filtering with 25+ operators (see [33-Find API](33-find-api.md))

### Base URL
```
/api/data/:schema
/api/data/:schema/:id
/api/data/:schema/:id/:relationship
```

## Authentication

All Data API endpoints require valid JWT authentication. The API respects tenant isolation and record-level permissions.

```bash
Authorization: Bearer <jwt>
```

### Required Permissions
- **Create Records**: `create_data` permission
- **Read Records**: `read_data` permission
- **Update Records**: `update_data` permission
- **Delete Records**: `delete_data` permission

## Schema Protection

Data operations automatically respect schema-level and field-level protection configured via the Describe API. These protections are enforced through the observer pipeline (Ring 1 validators) before any database operations occur.

### Frozen Schemas (`freeze=true`)

Schemas marked as frozen **block all write operations** while allowing read access:

| Operation | Allowed | Blocked |
|-----------|---------|---------|
| GET (read) | ✅ | |
| POST (create) | | ❌ |
| PUT (update) | | ❌ |
| DELETE (delete) | | ❌ |

**Use cases**:
- Emergency lockdowns during security incidents
- Maintenance windows requiring read-only access
- Regulatory compliance freeze periods
- Preventing modifications during audits

**Error Response**:
```json
{
  "success": false,
  "error": "Schema 'audit_log' is frozen. All data operations are temporarily disabled. Contact your administrator to unfreeze this schema.",
  "error_code": "SCHEMA_FROZEN"
}
```

### Sudo-Protected Schemas (`sudo=true`)

Schemas requiring sudo access need a short-lived sudo token from `POST /api/auth/sudo` (typically 15 minutes):

```bash
# Step 1: Obtain sudo token
POST /api/auth/sudo
Content-Type: application/json
Authorization: Bearer <regular_jwt>

{
  "reason": "Update financial records for Q4 audit"
}

# Response includes sudo token
{
  "success": true,
  "data": {
    "token": "<sudo_jwt>",
    "expires_in": 900
  }
}

# Step 2: Use sudo token for protected operations
POST /api/data/financial_accounts
Authorization: Bearer <sudo_jwt>

[{"account_number": "12345", "balance": 100000}]
```

**Error without sudo**:
```json
{
  "success": false,
  "error": "Schema 'financial_accounts' requires sudo access. Use POST /api/auth/sudo to get short-lived sudo token.",
  "error_code": "SUDO_REQUIRED"
}
```

### Sudo-Protected Fields (`columns.sudo=true`)

Individual fields can require sudo access while allowing normal operations on other fields:

```bash
# Allowed without sudo - updating non-protected fields
PUT /api/data/employees/user_123
Authorization: Bearer <regular_jwt>

{
  "title": "Senior Engineer",
  "department": "Platform"
}
# ✅ Success

# Blocked without sudo - updating salary field
PUT /api/data/employees/user_123
Authorization: Bearer <regular_jwt>

{
  "salary": 150000
}
# ❌ Error: Cannot modify sudo-protected fields [salary] without sudo access
```

**Use cases**:
- Salary/compensation fields in HR systems
- Pricing/discount fields in e-commerce
- Credit limit fields in financial systems
- Security settings (2FA, API keys)

### Immutable Fields (`columns.immutable=true`)

Fields marked as immutable can be set once but never changed (write-once semantics):

```bash
# First write - allowed
POST /api/data/audit_log
Authorization: Bearer <jwt>

[{
  "transaction_id": "TX-2025-001",
  "created_by": "user_123",
  "original_amount": 1000.00
}]
# ✅ Success

# Subsequent change attempt - blocked
PUT /api/data/audit_log/log_abc
Authorization: Bearer <jwt>

{
  "transaction_id": "TX-2025-002"
}
# ❌ Error: Cannot modify immutable fields: transaction_id
```

**Behavior**:
- Setting immutable field when `null` or `undefined`: ✅ Allowed (first write)
- Changing immutable field value: ❌ Blocked
- Setting immutable field to same value: ✅ Allowed (no-op)
- Update without immutable fields: ✅ Allowed

**Use cases**:
- Audit trail fields (`created_by`, `original_amount`, `transaction_id`)
- Regulatory identifiers (SSN, tax ID, account numbers)
- Historical data preservation (`initial_price`, `original_status`)
- Blockchain-style immutability for critical fields

**Error Response**:
```json
{
  "success": false,
  "error": "Cannot modify immutable fields: transaction_id on record log_abc (was: TX-2025-001, attempted: TX-2025-002)",
  "error_code": "VALIDATION_ERROR"
}
```

## Query Parameters

### System Field Filtering

Control which system metadata fields are included in API responses using query parameters. By default, all system fields are included for backward compatibility.

#### ?stat Parameter

Controls inclusion of timestamp fields in responses.

**Values:**
- `?stat=true` (default): Include created_at, updated_at, trashed_at, deleted_at
- `?stat=false`: Exclude all timestamp fields

**Example:**
```bash
GET /api/data/users?stat=false
POST /api/data/users?stat=false
PUT /api/data/users/:id?stat=false
```

**Response without stat fields:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "access_read": [...],
    "access_edit": [...]
    // No created_at, updated_at, trashed_at, deleted_at
  }
}
```

**Use cases:**
- Reduce response size when timestamps aren't needed
- Simplify client-side data models
- Bandwidth optimization for mobile apps

#### ?access Parameter

Controls inclusion of ACL (Access Control List) fields in responses.

**Values:**
- `?access=true` (default): Include access_read, access_edit, access_full, access_deny
- `?access=false`: Exclude all ACL fields

**Example:**
```bash
GET /api/data/users?access=false
POST /api/data/users?access=false
PUT /api/data/users/:id?access=false
```

**Response without access fields:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "created_at": "2025-01-01T12:00:00.000Z",
    "updated_at": "2025-01-01T12:00:00.000Z"
    // No access_read, access_edit, access_full, access_deny
  }
}
```

**Use cases:**
- Reduce response size (ACL arrays can be large)
- Exclude permissions data when not needed
- Bandwidth optimization (can save 200+ bytes per record)

#### Combined Filtering

Use both parameters together for data-only responses:

```bash
GET /api/data/users?stat=false&access=false
```

**Response with only user data:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "status": "active"
    // Only user-defined fields, no system metadata
  }
}
```

**Bandwidth savings:**
- Typical record with ACLs: ~800-1500 bytes
- With `?stat=false&access=false`: ~300-500 bytes
- Savings: 60-75% reduction per record

#### Interaction with ?select Parameter

System field filtering runs **before** field extraction with `?select=`:

```bash
GET /api/data/users?access=false&select=id,name
```

1. First: ACL fields are filtered out
2. Then: Only id and name are extracted
3. Result: Extracted fields will never include access_* (already filtered)

This ensures `?select=` operates on already-filtered data.

## Core CRUD Operations

### Create Records

Creates new records in the specified schema. Supports both single record and bulk array operations.

#### Single Record Creation
```bash
POST /api/data/:schema
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "name": "Test User",
  "email": "test@example.com",
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123456",
    "name": "Test User",
    "email": "test@example.com",
    "status": "active",
    "created_at": "2025-01-01T12:00:00.000Z",
    "updated_at": "2025-01-01T12:00:00.000Z"
  }
}
```

#### Bulk Record Creation
```bash
POST /api/data/:schema
Content-Type: application/json
Authorization: Bearer <jwt>

[
  {"name": "User 1", "email": "user1@example.com", "status": "active"},
  {"name": "User 2", "email": "user2@example.com", "status": "pending"},
  {"name": "User 3", "email": "user3@example.com", "status": "active"}
]
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user_123457",
      "name": "User 1",
      "email": "user1@example.com",
      "status": "active",
      "created_at": "2025-01-01T12:00:00.000Z"
    },
    {
      "id": "user_123458",
      "name": "User 2",
      "email": "user2@example.com",
      "status": "pending",
      "created_at": "2025-01-01T12:00:00.000Z"
    },
    {
      "id": "user_123459",
      "name": "User 3",
      "email": "user3@example.com",
      "status": "active",
      "created_at": "2025-01-01T12:00:00.000Z"
    }
  ]
}
```

### Read Records

Retrieves records with support for filtering, pagination, and specific record access.

#### List Records (with filtering)
```bash
GET /api/data/:schema?where={"status":"active"}&limit=10&order=["created_at desc"]
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user_123456",
      "name": "Active User 1",
      "email": "active1@example.com",
      "status": "active",
      "created_at": "2025-01-01T12:00:00.000Z"
    },
    {
      "id": "user_123457",
      "name": "Active User 2",
      "email": "active2@example.com",
      "status": "active",
      "created_at": "2025-01-01T11:00:00.000Z"
    }
  ],
  "count": 2
}
```

#### Get Specific Record
```bash
GET /api/data/:schema/:id
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123456",
    "name": "Test User",
    "email": "test@example.com",
    "status": "active",
    "created_at": "2025-01-01T12:00:00.000Z",
    "updated_at": "2025-01-01T12:00:00.000Z"
  }
}
```

### Update Records

Updates existing records with support for both single record and bulk operations.

#### Update Specific Record
```bash
PUT /api/data/:schema/:id
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "name": "Updated Name",
  "email": "updated@example.com",
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123456",
    "name": "Updated Name",
    "email": "updated@example.com",
    "status": "active",
    "created_at": "2025-01-01T12:00:00.000Z",
    "updated_at": "2025-01-01T13:00:00.000Z"
  }
}
```

#### Bulk Update (with filtering)
```bash
PUT /api/data/:schema?where={"status":"pending"}
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "status": "active",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "updated": 5,
    "matched": 5
  }
}
```

### Delete Records

Implements soft delete functionality with support for both single record and bulk operations.

#### Delete Specific Record
```bash
DELETE /api/data/:schema/:id
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123456",
    "deleted": true,
    "trashed_at": "2025-01-01T14:00:00.000Z"
  }
}
```

#### Bulk Delete (with filtering)
```bash
DELETE /api/data/:schema?where={"status":"inactive"}
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": 3,
    "matched": 3
  }
}
```

## Relationship Management

The Data API provides comprehensive relationship support for managing connections between different schemas.

### Relationship Types

#### Belongs To (Many-to-One)
```bash
# Create record with relationship
POST /api/data/posts
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "title": "My Blog Post",
  "content": "Post content here",
  "author_id": "user_123456"
}
```

#### Has Many (One-to-Many)
```bash
# Get related records
GET /api/data/users/user_123456/posts
Authorization: Bearer <jwt>
```

#### Many-to-Many
```bash
# Create many-to-many relationship
POST /api/data/posts/post_789/comments
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "content": "Great post!",
  "user_id": "user_123456"
}
```

### Relationship Operations

#### Create Relationship
```bash
POST /api/data/:schema/:id/:relationship
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "related_field": "related_value"
}
```

#### Read Relationships
```bash
GET /api/data/:schema/:id/:relationship
Authorization: Bearer <jwt>
```

#### Update Relationship
```bash
PUT /api/data/:schema/:id/:relationship/:related_id
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "updated_field": "updated_value"
}
```

#### Delete Relationship
```bash
DELETE /api/data/:schema/:id/:relationship/:related_id
Authorization: Bearer <jwt>
```

## Bulk Operations

The Data API supports efficient bulk operations for processing multiple records simultaneously.

### Bulk Create
```bash
POST /api/data/:schema
Content-Type: application/json
Authorization: Bearer <jwt>

[
  {"name": "Record 1", "status": "active"},
  {"name": "Record 2", "status": "pending"},
  {"name": "Record 3", "status": "active"}
]
```

### Bulk Update
```bash
PUT /api/data/:schema?where={"status":"pending"}
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "status": "active",
  "processed_at": "2025-01-01T00:00:00Z"
}
```

### Bulk Delete
```bash
DELETE /api/data/:schema?where={"status":"archived"}
Authorization: Bearer <jwt>
```

## Soft Delete System

The Data API implements a sophisticated three-tier access pattern for soft delete functionality:

### Access Tiers

1. **List Operations** (`GET /api/data/:schema`)
   - Automatically excludes trashed records
   - Only shows active records by default
   - Maintains data integrity for active operations

2. **Direct Access** (`GET /api/data/:schema/:id`)
   - Allows retrieval of trashed records by ID
   - Useful for audit trails and data recovery
   - Preserves access to historical data

3. **Update Operations** (`PUT /api/data/:schema/:id`)
   - Blocks modifications to trashed records
   - Prevents accidental data corruption
   - Ensures data consistency

### Soft Delete Behavior
```bash
# Delete record (soft delete)
DELETE /api/data/users/user_123456
Authorization: Bearer <jwt>

# Response shows trashed status
{
  "success": true,
  "data": {
    "id": "user_123456",
    "deleted": true,
    "trashed_at": "2025-01-01T14:00:00.000Z"
  }
}

# Trashed record excluded from list operations
GET /api/data/users
Authorization: Bearer <jwt>

# Response excludes trashed records
{
  "success": true,
  "data": [
    // user_123456 NOT included in results
    { "id": "user_123457", "name": "Active User" }
  ]
}

# But still accessible by ID
GET /api/data/users/user_123456
Authorization: Bearer <jwt>

# Response includes trashed record
{
  "success": true,
  "data": {
    "id": "user_123456",
    "name": "Test User",
    "trashed_at": "2025-01-01T14:00:00.000Z"
  }
}
```

## Error Handling

### Common Error Responses

#### Record Not Found
```json
{
  "success": false,
  "error": {
    "type": "NotFoundError",
    "message": "Record 'user_999999' not found in schema 'users'",
    "code": "RECORD_NOT_FOUND"
  }
}
```

#### Validation Error
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Field 'email' must be a valid email address",
    "field": "email",
    "code": "INVALID_EMAIL"
  }
}
```

#### Permission Error
```json
{
  "success": false,
  "error": {
    "type": "PermissionError",
    "message": "Insufficient permissions to delete record",
    "code": "INSUFFICIENT_PERMISSIONS"
  }
}
```

#### Relationship Error
```json
{
  "success": false,
  "error": {
    "type": "RelationshipError",
    "message": "Cannot delete record: existing relationships found",
    "code": "RELATIONSHIP_CONSTRAINT"
  }
}
```

## Testing

For comprehensive testing information and test coverage details, please refer to the test suite documentation:

**[spec/32-data-api/README.md](../spec/32-data-api/README.md)**

This includes test scope, focus areas, and testing strategies for the Data API endpoints.

## Common Use Cases

### Basic CRUD Operations
```bash
# 1. Create a new user
curl -X POST http://localhost:9001/api/data/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "status": "active"
  }'

# 2. Read the user
curl -X GET http://localhost:9001/api/data/users/user_123456 \
  -H "Authorization: Bearer $(monk auth token)"

# 3. Update the user
curl -X PUT http://localhost:9001/api/data/users/user_123456 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "name": "John Smith",
    "status": "inactive"
  }'

# 4. Delete the user (soft delete)
curl -X DELETE http://localhost:9001/api/data/users/user_123456 \
  -H "Authorization: Bearer $(monk auth token)"
```

### Bulk Operations
```bash
# Bulk create users
curl -X POST http://localhost:9001/api/data/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '[
    {"name": "User 1", "email": "user1@example.com"},
    {"name": "User 2", "email": "user2@example.com"},
    {"name": "User 3", "email": "user3@example.com"}
  ]'

# Bulk update pending users to active
curl -X PUT "http://localhost:9001/api/data/users?where={"status":"pending"}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "status": "active",
    "activated_at": "2025-01-01T00:00:00Z"
  }'
```

### Relationship Management
```bash
# Create a post with author relationship
curl -X POST http://localhost:9001/api/data/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "title": "My First Post",
    "content": "This is my first blog post",
    "author_id": "user_123456"
  }'

# Get all posts for a user (relationship)
curl -X GET http://localhost:localhost:9001/api/data/users/user_123456/posts \
  -H "Authorization: Bearer $(monk auth token)"

# Add a comment to a post (many-to-many relationship)
curl -X POST http://localhost:9001/api/data/posts/post_789/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "content": "Great post! Really enjoyed reading this.",
    "user_id": "user_123457"
  }'
```

### Advanced Filtering
```bash
# Complex filtering with multiple conditions
curl -X GET "http://localhost:9001/api/data/users?where={"status":"active"}" \
  -H "Authorization: Bearer $(monk auth token)"

# With ordering and pagination
curl -X GET "http://localhost:9001/api/data/users?where={"status":"active"}&order=["created_at desc"]&limit=10&offset=0" \
  -H "Authorization: Bearer $(monk auth token)"
```

---

**Next: [33-Find API Documentation](33-find-api.md)** - Advanced filtering and search capabilities

**Previous: [31-Meta API Documentation](31-meta-api.md)** - Schema management and metadata operations
