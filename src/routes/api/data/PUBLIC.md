# Data API

The Data API provides CRUD operations for model records, supporting both bulk operations and single-record manipulation. All operations support soft delete functionality with optional permanent delete capabilities.

## Base Path

`/api/data/*` (authentication required)

## Content Type

- **Request**: `application/json`
- **Response**: `application/json` (default), with support for CSV, MessagePack, and other formats

## Authentication

All Data API routes require authentication via JWT token in the Authorization header:
- **Header**: `Authorization: Bearer <jwt_token>`

## Query Parameters

### Global Parameters

- `include_trashed=true` - Include soft-deleted records in results (where `trashed_at IS NOT NULL`)
- `include_deleted=true` - Include permanently deleted records (where `deleted_at IS NOT NULL`) - requires root access
- `permanent=true` - Perform permanent delete operations (sets `deleted_at`) - requires root access

### GET Parameters

- `where={json}` - Filter criteria as JSON-encoded object (e.g., `?where={"status":"active"}`)

### POST Parameters

- `upsert=true` - Enable upsert mode: records with ID are updated, records without ID are created

### PATCH Parameters

- `where={json}` - Filter criteria for bulk update (body contains changes to apply to all matching records)

### Response Transformation Parameters

- `unwrap` - Remove envelope, return data array directly
- `select=field1,field2` - Return only specified fields (implies unwrap)
- `stat=false` - Exclude timestamp fields (created_at, updated_at, trashed_at, deleted_at)
- `access=false` - Exclude ACL fields (access_read, access_edit, access_full)
- `format=csv|msgpack|yaml|toon` - Return data in alternative formats

See individual endpoint documentation for detailed examples.

## Endpoints

### Bulk Operations (Model-Level)

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/data/:model`](:model/GET.md) | Query records with optional `?where` filter. |
| POST | [`/api/data/:model`](:model/POST.md) | Create records. Use `?upsert=true` to insert or update based on ID presence. |
| PUT | [`/api/data/:model`](:model/PUT.md) | Update multiple records by ID (body is array of `{id, ...changes}`). |
| PATCH | [`/api/data/:model`](:model/PUT.md) | Filter-based update via `?where` (body is changes object), or revert with `?include_trashed=true`. |
| DELETE | [`/api/data/:model`](:model/DELETE.md) | Soft delete or permanently remove multiple records (permanent=true requires root). |

### Single Record Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/data/:model/:record`](:model/:record/GET.md) | Retrieve a single record by UUID with optional trashed/deleted metadata. |
| PUT | [`/api/data/:model/:record`](:model/:record/PUT.md) | Update a single record (full replacement or partial patch). |
| DELETE | [`/api/data/:model/:record`](:model/:record/DELETE.md) | Soft delete or permanently remove a single record (permanent=true requires root). |

### Relationship Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/data/:model/:record/:relationship`](:model/:record/:relationship/GET.md) | List all child records for a parent relationship. |
| POST | [`/api/data/:model/:record/:relationship`](:model/:record/:relationship/POST.md) | Create a child record with automatic parent foreign key assignment. |
| PUT | [`/api/data/:model/:record/:relationship`](:model/:record/:relationship/PUT.md) | Bulk update child records (not yet implemented). |
| DELETE | [`/api/data/:model/:record/:relationship`](:model/:record/:relationship/DELETE.md) | Remove or detach multiple child records from parent. |
| GET | [`/api/data/:model/:record/:relationship/:child`](:model/:record/:relationship/:child/GET.md) | Fetch a specific child record through parent relationship. |
| PUT | [`/api/data/:model/:record/:relationship/:child`](:model/:record/:relationship/:child/PUT.md) | Update a specific child record while preserving parent relationship. |
| DELETE | [`/api/data/:model/:record/:relationship/:child`](:model/:record/:relationship/:child/DELETE.md) | Soft delete or permanently remove a specific child record. |

## Delete Operations

### Soft Delete (Default)

- Sets `trashed_at` to current timestamp
- Record remains in database and can be recovered
- Excluded from normal queries unless `include_trashed=true`
- Available to all authenticated users

### Permanent Delete (permanent=true)

- Sets `deleted_at` to current timestamp
- Record remains in database but marked as permanently deleted
- **Requires root access level**
- Only visible with `include_deleted=true` query parameter

### Revert Operations

Restore soft-deleted records using PATCH method with `include_trashed=true`:

```bash
# Revert multiple records
PATCH /api/data/users?include_trashed=true
[{"id": "user-1"}, {"id": "user-2"}]

# Revert single record
PATCH /api/data/users/user-1?include_trashed=true
```

## Model Protection

Data operations respect model-level and field-level protection:

- **Frozen models** (`frozen=true`) - Block all write operations (POST/PUT/DELETE), allow reads
- **Sudo-protected models** (`sudo=true`) - Require sudo token from `POST /api/user/sudo`
- **Sudo-protected fields** - Individual fields marked `sudo=true` require sudo token to modify
- **Immutable models** (`models.immutable=true`) - Records can be created once but never modified
- **Immutable fields** (`fields.immutable=true`) - Fields can be set once during creation but never modified

## Quick Start

### Basic CRUD Operations

```bash
# Create records
curl -X POST http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name": "Alice", "email": "alice@example.com"}]'

# Query all records
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Query with filter
curl -X GET 'http://localhost:9001/api/data/users?where={"status":"active"}' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Update records by ID
curl -X PUT http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"id": "user-1", "department": "Engineering"}]'

# Soft delete records
curl -X DELETE http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"id": "user-1"}]'
```

### Upsert Operations

```bash
# Upsert: insert new records OR update existing (by ID presence)
curl -X POST 'http://localhost:9001/api/data/users?upsert=true' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"name": "New User", "email": "new@example.com"},
    {"id": "existing-user-id", "name": "Updated Name"}
  ]'
```

### Filter-Based Updates

```bash
# Update all records matching a filter (PATCH + ?where)
curl -X PATCH 'http://localhost:9001/api/data/users?where={"department":"Sales"}' \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

### Response Transformation

```bash
# Get only specific fields (unwrapped)
curl -X GET "http://localhost:9001/api/data/users?select=id,name,email" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Export as CSV
curl -X GET "http://localhost:9001/api/data/users?format=csv" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get data without timestamps
curl -X GET "http://localhost:9001/api/data/users?stat=false" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Trash Management

```bash
# Query including trashed records
curl -X GET "http://localhost:9001/api/data/users?include_trashed=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Restore trashed records
curl -X PATCH "http://localhost:9001/api/data/users?include_trashed=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"id": "user-1"}]'

# Permanent delete (root only)
curl -X DELETE "http://localhost:9001/api/data/users?permanent=true" \
  -H "Authorization: Bearer ROOT_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"id": "user-1"}]'
```

## Related Documentation

- **Describe API**: [`../describe/PUBLIC.md`](../describe/PUBLIC.md) - Model management and metadata
- **Find API**: [`../find/PUBLIC.md`](../find/PUBLIC.md) - Advanced queries with filtering, sorting, and pagination
- **Bulk API**: [`../bulk/PUBLIC.md`](../bulk/PUBLIC.md) - Multi-model batch operations
- **User API**: `/docs/user` - User identity and sudo token management
