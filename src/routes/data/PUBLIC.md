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

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/data/:schema`](#post-apidataschema) | Bulk-insert records into a schema while running the full observer pipeline. |
| GET | [`/api/data/:schema`](#get-apidataschema) | Query collections with filtering, pagination, and soft-delete aware options. |
| PUT | [`/api/data/:schema`](#put-apidataschema) | Apply updates or patches to all records matching a filter in one request. |
| DELETE | [`/api/data/:schema`](#delete-apidataschema) | Soft-delete or permanently remove many records based on filter criteria. |
| GET | [`/api/data/:schema/:id`](#get-apidataschemaid) | Retrieve a single record (optionally including trashed metadata) by its UUID. |
| PUT | [`/api/data/:schema/:id`](#put-apidataschemaid) | Replace or patch one record while preserving audit metadata. |
| DELETE | [`/api/data/:schema/:id`](#delete-apidataschemaid) | Soft-delete, permanently delete, or revert a specific record. |
| GET | [`/api/data/:schema/:record/:relationship`](#get-apidataschemarecordrelationship) | List related child records for a relationship field. |
| POST | [`/api/data/:schema/:record/:relationship`](#post-apidataschemarecordrelationship) | Create or attach related child records for the parent. |
| DELETE | [`/api/data/:schema/:record/:relationship`](#delete-apidataschemarecordrelationship) | Remove or detach multiple related records from the parent. |
| GET | [`/api/data/:schema/:record/:relationship/:child`](#get-apidataschemarecordrelationshipchild) | Fetch a specific related child record by ID. |
| PUT | [`/api/data/:schema/:record/:relationship/:child`](#put-apidataschemarecordrelationshipchild) | Update a related child record in-place through the relationship route. |
| DELETE | [`/api/data/:schema/:record/:relationship/:child`](#delete-apidataschemarecordrelationshipchild) | Delete or detach a specific related child record. |

## Query Parameters

### Global Query Parameters
- `include_trashed=true` - Include soft-deleted records in results
- `include_deleted=true` - Include permanently deleted records (root access only)
- `permanent=true` - Perform permanent delete operations (root access only)

---

## POST /api/data/:schema

Create one or more records in the specified schema while automatically invoking the observer rings for validation, security, and enrichment. The request executes inside a transaction, ensuring every record is either persisted together or the entire batch rolls back if a single record fails.

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

Query the schema with flexible filtering, sorting, and pagination controls. This endpoint backs list views, exports, and analytics screens by letting clients decide which fields to select, whether to include trashed rows, and how to order the results.

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

Apply updates to every record in the payload, using the provided `id` fields to target rows. Use this endpoint for bulk edits, schema migrations, or cross-record data fixes—observers ensure validation and audit hooks run for each updated record, and omitting an `id` immediately rejects the request.

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

Remove many records at once—either by moving them to the trash (default) or, for root users, permanently erasing them with `permanent=true`. The operation accepts a list of IDs or filter criteria, making it ideal for scheduled cleanups or administrator-driven maintenance tasks.

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

Fetch a single record by UUID, including system metadata and optional trashed/permanent states. Ideal for detail pages or edit forms that need the authoritative row straight from the tenant database.

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

Perform a full replacement or partial patch against a single record. The operation enforces schema validation, applies observers, and returns the updated record so clients can refresh their view without issuing a follow-up GET.

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

Delete an individual record, defaulting to a reversible soft delete while supporting permanent removal for root users. Use this when handling record-specific actions in the UI; the response echoes the record metadata so you can update local caches immediately.

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

---

# Nested Relationship Routes

The Data API also provides complete CRUD operations for managing nested resources through parent-child relationships. These routes work with schemas that define `x-monk-relationship` extensions to establish owned relationships between entities.

## Relationship Routes Overview

All relationship routes follow the pattern `/api/data/:parent_schema/:parent_id/:relationship_name` and automatically enforce parent-child constraints.

---

## GET /api/data/:schema/:record/:relationship

List every child record tied to the specified parent through a relationship defined in JSON Schema extensions. The route automatically applies the parent filter, enforces ACL inheritance, and supports the same trashed/deleted flags as top-level queries.

### Path Parameters
- `:schema` - Parent schema name
- `:record` - Parent record ID
- `:relationship` - Relationship name defined in child schema

### Query Parameters
- `include_trashed=true` - Include soft-deleted child records
- `include_deleted=true` - Include permanently deleted child records (root access only)

### Request Body
None - GET request with no body.

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "comment-1",
      "text": "Great post!",
      "post_id": "post-123",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "trashed_at": null,
      "deleted_at": null
    },
    {
      "id": "comment-2", 
      "text": "Thanks for sharing",
      "post_id": "post-123",
      "created_at": "2024-01-15T10:31:00Z",
      "updated_at": "2024-01-15T10:31:00Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ]
}
```

### Example
```bash
GET /api/data/posts/post-123/comments
```
Returns all comments belonging to post "post-123".

---

## POST /api/data/:schema/:record/:relationship

Create new child records that automatically inherit the parent foreign key and observer context. This route keeps relationship logic server-side—clients only send the child payload, and the API links it to the parent atomically.

### Path Parameters
- `:schema` - Parent schema name
- `:record` - Parent record ID
- `:relationship` - Relationship name defined in child schema

### Request Body
Single child record object (foreign key automatically set):
```json
{
  "text": "This is a new comment",
  "status": "published"
}
```

### Success Response (201)
```json
{
  "success": true,
  "data": {
    "id": "comment-3",
    "text": "This is a new comment", 
    "status": "published",
    "post_id": "post-123",
    "created_at": "2024-01-15T10:32:00Z",
    "updated_at": "2024-01-15T10:32:00Z",
    "trashed_at": null,
    "deleted_at": null
  }
}
```

### Example
```bash
POST /api/data/posts/post-123/comments
```
Creates a new comment for post "post-123" with `post_id` automatically set.

---

## DELETE /api/data/:schema/:record/:relationship

Remove or detach multiple child records for a given parent relationship in one request. Combine it with query filters to target only a subset of children (for example, orphaning draft comments while leaving published ones untouched).

### Path Parameters
- `:schema` - Parent schema name  
- `:record` - Parent record ID
- `:relationship` - Relationship name defined in child schema

### Query Parameters
- `permanent=true` - Perform permanent delete (requires root access)

### Request Body
None - DELETE request with no body.

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "comment-1",
      "text": "Great post!",
      "post_id": "post-123", 
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "trashed_at": "2024-01-15T12:00:00Z",
      "deleted_at": null
    }
  ]
}
```

### Example
```bash
DELETE /api/data/posts/post-123/comments
```
Soft deletes all comments belonging to post "post-123".

---

## GET /api/data/:schema/:record/:relationship/:child

Fetch a specific child resource while guaranteeing it belongs to the parent referenced in the URL. This prevents leaking related records between parents and exposes trashed/permanent flags for child-level recovery flows.

### Path Parameters
- `:schema` - Parent schema name
- `:record` - Parent record ID  
- `:relationship` - Relationship name defined in child schema
- `:child` - Child record ID

### Query Parameters
- `include_trashed=true` - Include soft-deleted records
- `include_deleted=true` - Include permanently deleted records (root access only)

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "comment-1",
    "text": "Great post!",
    "post_id": "post-123",
    "created_at": "2024-01-15T10:30:00Z", 
    "updated_at": "2024-01-15T10:30:00Z",
    "trashed_at": null,
    "deleted_at": null
  }
}
```

### Example
```bash
GET /api/data/posts/post-123/comments/comment-1
```
Returns comment "comment-1" if it belongs to post "post-123".

---

## PUT /api/data/:schema/:record/:relationship/:child

Modify a child resource in place while preserving the parent relationship. The server prevents reassignment to a different parent and ensures only allowed fields per the relationship schema are updated.

### Path Parameters
- `:schema` - Parent schema name
- `:record` - Parent record ID
- `:relationship` - Relationship name defined in child schema  
- `:child` - Child record ID

### Request Body
Child record update object (foreign key preserved automatically):
```json
{
  "text": "Updated comment text",
  "status": "edited"
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "comment-1",
    "text": "Updated comment text",
    "status": "edited", 
    "post_id": "post-123",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T11:00:00Z",
    "trashed_at": null,
    "deleted_at": null
  }
}
```

### Example
```bash  
PUT /api/data/posts/post-123/comments/comment-1
```
Updates comment "comment-1" while preserving its relationship to post "post-123".

---

## DELETE /api/data/:schema/:record/:relationship/:child

Soft-delete or permanently remove an individual child while ensuring it belongs to the provided parent. Useful for UI actions that remove a single attachment/comment without touching the rest of the relationship set.

### Path Parameters
- `:schema` - Parent schema name
- `:record` - Parent record ID
- `:relationship` - Relationship name defined in child schema
- `:child` - Child record ID

### Query Parameters
- `permanent=true` - Perform permanent delete (requires root access)

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "comment-1",
    "text": "Great post!",
    "post_id": "post-123",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z", 
    "trashed_at": "2024-01-15T12:00:00Z",
    "deleted_at": null
  }
}
```

### Example
```bash
DELETE /api/data/posts/post-123/comments/comment-1  
```
Soft deletes comment "comment-1" if it belongs to post "post-123".

---

## Relationship Error Responses

All relationship routes include these additional error conditions:

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `RELATIONSHIP_NOT_FOUND` | "Relationship 'name' not found for schema 'schema'" | Invalid relationship name |
| 404 | `RECORD_NOT_FOUND` | "Record not found" | Parent or child record doesn't exist |
| 400 | `INVALID_BODY_FORMAT` | "Request body must be a single object" | Array sent instead of object |

## Relationship Schema Requirements

To use nested relationship routes, child schemas must define relationships using the `x-monk-relationship` extension:

```json
{
  "title": "Comments",
  "type": "object",
  "properties": {
    "text": {"type": "string"},
    "post_id": {
      "type": "string",
      "x-monk-relationship": {
        "type": "owned",
        "schema": "posts", 
        "name": "comments"
      }
    }
  }
}
```

### Relationship Types
- **`owned`** - Child belongs to parent, enables nested routes
- **`referenced`** - Loose reference, no nested route support

## Relationship Usage Examples

### Creating Related Records
```javascript
// Create a comment for a specific post
const response = await fetch('/api/data/posts/post-123/comments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    text: 'Great article!',
    status: 'published'
  })
});
```

### Updating Nested Resources
```javascript
// Update a specific comment
const response = await fetch('/api/data/posts/post-123/comments/comment-1', {
  method: 'PUT', 
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    text: 'Updated comment text',
    status: 'edited'
  })
});
```

### Bulk Operations on Relationships
```javascript
// Delete all comments for a post
const response = await fetch('/api/data/posts/post-123/comments', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

// Get all comments including trashed ones
const comments = await fetch('/api/data/posts/post-123/comments?include_trashed=true', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```
