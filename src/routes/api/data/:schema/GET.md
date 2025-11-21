# GET /api/data/:schema

Query all records in a schema with optional filtering for soft-deleted and permanently deleted records. This endpoint backs list views, exports, and analytics screens by returning the complete dataset for a schema.

## Path Parameters

- `:schema` - Schema name (required)

## Query Parameters

- `include_trashed=true` - Include soft-deleted records (`trashed_at IS NOT NULL`)
- `include_deleted=true` - Include permanently deleted records (`deleted_at IS NOT NULL`) - requires root access

## Request Body

None - GET request with no body.

## Success Response (200)

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

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `AUTH_TOKEN_REQUIRED` | "Authorization token required" | No Bearer token in Authorization header |
| 401 | `AUTH_TOKEN_INVALID` | "Invalid token" | Token malformed or bad signature |
| 401 | `AUTH_TOKEN_EXPIRED` | "Token has expired" | Token well-formed but past expiration |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Invalid schema name |

## Default Behavior

By default, this endpoint:
- Returns only **active records** (where `trashed_at IS NULL` and `deleted_at IS NULL`)
- Returns **all fields** defined in the schema
- Returns records in **database order** (no explicit sorting)
- Returns **all matching records** (no pagination limit)

## Example Usage

### Get All Active Users

```bash
curl -X GET http://localhost:9001/api/data/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Include Soft-Deleted Records

```bash
curl -X GET "http://localhost:9001/api/data/users?include_trashed=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response includes records with `trashed_at` set:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-1",
      "name": "Active User",
      "trashed_at": null
    },
    {
      "id": "user-2",
      "name": "Deleted User",
      "trashed_at": "2024-01-15T12:00:00Z"
    }
  ]
}
```

### Include Permanently Deleted Records (Root Only)

```bash
curl -X GET "http://localhost:9001/api/data/users?include_deleted=true" \
  -H "Authorization: Bearer ROOT_JWT_TOKEN"
```

**Response includes records with `deleted_at` set:**
```json
{
  "success": true,
  "data": [
    {
      "id": "user-1",
      "name": "Active User",
      "trashed_at": null,
      "deleted_at": null
    },
    {
      "id": "user-2",
      "name": "Permanently Deleted User",
      "trashed_at": "2024-01-10T10:00:00Z",
      "deleted_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

## Use Cases

### Export All Records
```javascript
const response = await fetch('/api/data/products', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: products } = await response.json();

// Export to CSV, Excel, etc.
exportToCSV(products);
```

### Audit Trail with Deleted Records
```javascript
// Get complete history including deleted items
const response = await fetch('/api/data/audit_log?include_deleted=true', {
  headers: { 'Authorization': `Bearer ${rootToken}` }
});
const { data: auditRecords } = await response.json();

// Analyze deletion patterns
const deletedRecords = auditRecords.filter(r => r.deleted_at !== null);
```

### Trash Management
```javascript
// Show trash bin contents
const response = await fetch('/api/data/documents?include_trashed=true', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data: documents } = await response.json();

// Filter to show only trashed items
const trashedDocs = documents.filter(doc =>
  doc.trashed_at !== null && doc.deleted_at === null
);

// Render trash bin UI
renderTrashBin(trashedDocs);
```

## Advanced Queries

For more sophisticated filtering, sorting, and pagination, use the **Find API** instead:

```bash
# Use Find API for complex queries
POST /api/find/users
{
  "where": {
    "department": "Engineering",
    "created_at": { "$gte": "2024-01-01" }
  },
  "order": ["created_at desc"],
  "limit": 50
}
```

See [`POST /api/find/:schema`](../../find/:schema/POST.md) for details.

## Schema Protection

This endpoint respects schema-level protection:

- **Frozen schemas** (`freeze=true`): Read operations are allowed
- **Sudo-protected schemas** (`sudo=true`): No special requirements for read operations
- **ACL filtering**: Results automatically filtered based on user's `access_read` permissions

## Performance Considerations

⚠️ **Warning**: This endpoint returns **all records** in the schema without pagination. For large datasets:

- Use the **Find API** with `limit` and `offset` for pagination
- Consider caching responses for frequently accessed data
- Use field projection in Find API to reduce payload size

**Example of better approach for large datasets:**
```bash
# Instead of GET /api/data/users (returns all)
# Use Find API with pagination:
POST /api/find/users
{
  "select": ["id", "name", "email"],
  "limit": 100,
  "offset": 0
}
```

## Related Endpoints

- [`POST /api/data/:schema`](POST.md) - Create multiple records
- [`PUT /api/data/:schema`](PUT.md) - Update multiple records
- [`DELETE /api/data/:schema`](DELETE.md) - Delete multiple records
- [`POST /api/find/:schema`](../../find/:schema/POST.md) - Advanced filtering and pagination
