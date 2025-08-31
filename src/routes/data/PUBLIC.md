# Data API Routes

The Data API provides CRUD operations for schema records, supporting both bulk operations and single record manipulation. All operations support soft delete functionality with optional permanent delete capabilities.

## Base Path
All Data API routes are prefixed with `/api/data`

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication
All Data API routes require authentication via JWT token in the Authorization header.
- **Header**: `Authorization: Bearer <jwt_token>`

## Query Parameters

### Global Query Parameters
- `include_trashed=true` - Include soft-deleted records in results
- `include_deleted=true` - Include permanently deleted records (root access only)
- `permanent=true` - Perform permanent delete operations (root access only)

---

## POST /api/data/:schema

Create multiple records in the specified schema.

### Request Body
Always expects an array of record objects:
```json
[
  {
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering"
  },
  {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "department": "Marketing"
  }
]
```

### Success Response (201)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john@example.com",
      "department": "Engineering",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "trashed_at": null,
      "deleted_at": null
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "department": "Marketing",
      "created_at": "2024-01-15T10:30:01Z",
      "updated_at": "2024-01-15T10:30:01Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ]
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `REQUEST_INVALID_FORMAT` | "Request body must be an array of records" | Body is not an array |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## GET /api/data/:schema

Retrieve all records from the specified schema.

### Query Parameters
- `include_trashed=true` - Include soft-deleted records
- `include_deleted=true` - Include permanently deleted records (root access only)

### Request Body
None - GET request with no body.

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john@example.com",
      "department": "Engineering",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ]
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## PUT /api/data/:schema

Update multiple records in the specified schema. Records must include `id` fields to identify which records to update.

### Query Parameters
- `include_trashed=true` - When combined with PATCH method, performs revert operation

### Request Body
Always expects an array of record objects with `id` fields:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Updated",
    "department": "Senior Engineering"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "email": "jane.smith@example.com"
  }
]
```

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Updated",
      "email": "john@example.com",
      "department": "Senior Engineering",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T11:00:00Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ]
}
```

### Smart Routing: PATCH + include_trashed=true
When using PATCH method with `include_trashed=true`, performs revert operation instead of update:
```bash
PATCH /api/data/users?include_trashed=true
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `REQUEST_INVALID_FORMAT` | "Request body must be an array of update records with id fields" | Body is not an array or missing id fields |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## DELETE /api/data/:schema

Soft delete or permanently delete multiple records in the specified schema.

### Query Parameters
- `permanent=true` - Perform permanent delete (requires root access)

### Request Body
Always expects an array of record objects with `id` fields:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001"
  }
]
```

### Success Response (200)

#### Soft Delete Response
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john@example.com",
      "department": "Engineering",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "trashed_at": "2024-01-15T12:00:00Z",
      "deleted_at": null
    }
  ]
}
```

#### Permanent Delete Response (permanent=true)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john@example.com",
      "department": "Engineering",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T12:00:00Z",
      "trashed_at": "2024-01-15T12:00:00Z",
      "deleted_at": "2024-01-15T12:00:00Z"
    }
  ]
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `REQUEST_INVALID_FORMAT` | "Request body must be an array of records with id fields" | Body is not an array or missing id fields |
| 403 | `ACCESS_DENIED` | "Insufficient permissions for permanent delete" | permanent=true without root access |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## GET /api/data/:schema/:id

Retrieve a single record by ID from the specified schema.

### Query Parameters
- `include_trashed=true` - Include soft-deleted records
- `include_deleted=true` - Include permanently deleted records (root access only)

### Request Body
None - GET request with no body.

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "trashed_at": null,
    "deleted_at": null
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `RECORD_NOT_FOUND` | "Record not found" | Record ID does not exist |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## PUT /api/data/:schema/:id

Update a single record by ID in the specified schema.

### Query Parameters
- `include_trashed=true` - When combined with PATCH method, performs revert operation

### Request Body
Record update object:
```json
{
  "name": "John Updated",
  "department": "Senior Engineering"
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Updated",
    "email": "john@example.com",
    "department": "Senior Engineering",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z",
    "trashed_at": null,
    "deleted_at": null
  }
}
```

### Smart Routing: PATCH + include_trashed=true
When using PATCH method with `include_trashed=true`, performs revert operation instead of update:
```bash
PATCH /api/data/users/550e8400-e29b-41d4-a716-446655440000?include_trashed=true
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `RECORD_NOT_FOUND` | "Record not found" | Record ID does not exist |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## DELETE /api/data/:schema/:id

Soft delete or permanently delete a single record by ID.

### Query Parameters
- `permanent=true` - Perform permanent delete (requires root access)

### Request Body
None - DELETE request with no body.

### Success Response (200)

#### Soft Delete Response
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "trashed_at": "2024-01-15T12:00:00Z",
    "deleted_at": null
  }
}
```

#### Permanent Delete Response (permanent=true)
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T12:00:00Z",
    "trashed_at": "2024-01-15T12:00:00Z",
    "deleted_at": "2024-01-15T12:00:00Z"
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 403 | `ACCESS_DENIED` | "Insufficient permissions for permanent delete" | permanent=true without root access |
| 404 | `RECORD_NOT_FOUND` | "Record not found" | Record ID does not exist |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Missing or invalid Authorization header |

---

## Delete Operations Explained

### Soft Delete (Default)
- Sets `trashed_at` timestamp to current time
- Record remains in database and can be recovered
- Excluded from normal queries unless `include_trashed=true`
- Available to all authenticated users

### Permanent Delete (permanent=true)
- Sets `deleted_at` timestamp to current time
- Record remains in database but marked as permanently deleted
- Requires root access level
- Only visible with `include_deleted=true` query parameter

## Revert Operations

Trashed records can be restored using the smart routing feature:

### Bulk Revert
```bash
PATCH /api/data/users?include_trashed=true
```
```json
[
  {"id": "550e8400-e29b-41d4-a716-446655440000"}
]
```

### Single Record Revert
```bash
PATCH /api/data/users/550e8400-e29b-41d4-a716-446655440000?include_trashed=true
```

## Error Response Format

All error responses follow the standardized format documented in [ERRORS.md](./ERRORS.md). In development mode, additional debugging information is included in the `data` field.

## Usage Examples

### Creating Multiple Records
```javascript
const response = await fetch('/api/data/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify([
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' }
  ])
});
```

### Bulk Update with Error Handling
```javascript
try {
  const response = await fetch('/api/data/users', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-jwt-token'
    },
    body: JSON.stringify([
      { id: 'user-1', department: 'Engineering' },
      { id: 'user-2', department: 'Marketing' }
    ])
  });

  const result = await response.json();

  if (!result.success) {
    switch (result.error_code) {
      case 'REQUEST_INVALID_FORMAT':
        console.error('Invalid request format');
        break;
      case 'SCHEMA_NOT_FOUND':
        console.error('Schema does not exist');
        break;
      default:
        console.error('Unknown error:', result.error);
        break;
    }
  }
} catch (error) {
  console.error('Network or parsing error:', error);
}
```

### Soft Delete and Recovery
```javascript
// Soft delete records
await fetch('/api/data/users', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify([
    { id: 'user-1' },
    { id: 'user-2' }
  ])
});

// Later, recover trashed records
await fetch('/api/data/users?include_trashed=true', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify([
    { id: 'user-1' },
    { id: 'user-2' }
  ])
});
```

### Permanent Delete (Root Access Required)
```javascript
await fetch('/api/data/users?permanent=true', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-root-jwt-token'
  },
  body: JSON.stringify([
    { id: 'user-to-delete-permanently' }
  ])
});
```

### Query with Trashed Records
```javascript
// Get all records including soft-deleted ones
const response = await fetch('/api/data/users?include_trashed=true', {
  headers: { 'Authorization': 'Bearer your-jwt-token' }
});
```
