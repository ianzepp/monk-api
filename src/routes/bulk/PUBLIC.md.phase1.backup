# Bulk API

The Bulk API enables batch operations across multiple schemas and records in a single request. Execute multiple create, read, update, delete, and access control operations efficiently with transaction support.

## Base Path
All Bulk API operations use: `POST /api/bulk`

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
Requires valid JWT token in Authorization header: `Bearer <token>`

---

## POST /api/bulk

Execute multiple operations across different schemas in a single atomic request.

### Request Body
```json
{
  "operations": [
    {
      "operation": "string",     // Required: Operation type (see supported operations)
      "schema": "string",        // Required: Target schema name
      "data": {},               // Operation data (varies by operation type)
      "id": "string",           // Required for single-record operations
      "filter": {},             // Optional: Filter criteria for bulk operations
      "message": "string"       // Optional: Custom error message for validation
    }
  ]
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "operation": "createOne",
      "schema": "users",
      "result": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "John Doe",
        "email": "john@example.com",
        "created_at": "2024-01-15T10:30:00Z"
      }
    },
    {
      "operation": "updateOne", 
      "schema": "accounts",
      "result": {
        "id": "660f9500-f39c-52e5-b827-557766551001",
        "status": "active",
        "updated_at": "2024-01-15T10:30:01Z"
      }
    }
  ]
}
```

## Supported Operations

### Record Operations
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `createOne` | Create single record | `schema`, `data` |
| `createAll` | Create multiple records | `schema`, `data` (array) |
| `selectOne` | Get single record | `schema`, `id` |
| `selectAll` | Get multiple records | `schema`, `filter` |
| `updateOne` | Update single record | `schema`, `id`, `data` |
| `updateAll` | Update multiple records | `schema`, `data` (array with ids) |
| `deleteOne` | Soft delete single record | `schema`, `id` |
| `deleteAll` | Soft delete multiple records | `schema`, `data` (array with ids) |
| `revertOne` | Restore soft-deleted record | `schema`, `id` |
| `revertAll` | Restore multiple records | `schema`, `data` (array with ids) |

### Access Control Operations
| Operation | Description | Required Fields |
|-----------|-------------|-----------------|
| `accessOne` | Update record ACL | `schema`, `id`, `data` (access arrays) |
| `accessAll` | Update multiple ACLs | `schema`, `data` (array with access) |

## Usage Examples

### Mixed Schema Operations
```bash
curl -X POST http://localhost:9001/api/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "createOne",
        "schema": "users",
        "data": {
          "name": "Jane Doe",
          "email": "jane@example.com",
          "role": "admin"
        }
      },
      {
        "operation": "updateOne",
        "schema": "accounts", 
        "id": "account-123",
        "data": {
          "status": "active",
          "last_login": "2024-01-15T10:30:00Z"
        }
      },
      {
        "operation": "selectAll",
        "schema": "logs",
        "filter": {
          "where": {
            "level": "error",
            "created_at": {"$gte": "2024-01-15T00:00:00Z"}
          }
        }
      }
    ]
  }'
```

### Batch Record Creation
```bash
curl -X POST http://localhost:9001/api/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "createAll",
        "schema": "products",
        "data": [
          {"name": "Product A", "price": 29.99, "category": "electronics"},
          {"name": "Product B", "price": 49.99, "category": "electronics"},
          {"name": "Product C", "price": 19.99, "category": "books"}
        ]
      }
    ]
  }'
```

### Access Control Updates
```bash
curl -X POST http://localhost:9001/api/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "operation": "accessOne",
        "schema": "documents",
        "id": "doc-123",
        "data": {
          "access_read": ["user-456", "user-789"],
          "access_edit": ["user-456"],
          "access_full": ["admin-user"]
        }
      }
    ]
  }'
```

## Error Responses

### Validation Errors

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `REQUEST_INVALID_FORMAT` | "Request body must be an array of operations" | Invalid request structure |
| 400 | `OPERATION_MISSING_FIELDS` | "Operation missing required fields" | Missing operation or schema |
| 400 | `OPERATION_MISSING_ID` | "ID required for operation" | Single-record operation without ID |
| 422 | `OPERATION_UNSUPPORTED` | "Unsupported operation" | Invalid operation type |

### Authentication Errors

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_MISSING` | "Authorization header required" | No Bearer token |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Bad JWT signature |
| 401 | `USER_NOT_FOUND` | "User not found or inactive" | User validation failed |

## Benefits and Use Cases

### Performance Advantages
- **Single HTTP request**: Multiple database operations in one call
- **Transaction safety**: All operations succeed or all fail atomically
- **Reduced latency**: Eliminates multiple round-trips for related operations
- **Observer pipeline**: Efficient execution through unified observer system

### Common Use Cases
- **Data migration**: Bulk create/update operations across multiple schemas
- **Batch processing**: Process multiple records with different operations
- **Access control updates**: Bulk permission changes across records
- **Cleanup operations**: Batch delete/restore operations with filters

### When to Use Bulk API vs Individual APIs
**Use Bulk API when:**
- Performing related operations that should succeed or fail together
- Processing multiple records across different schemas
- Requiring transaction atomicity across operations
- Optimizing for performance with many related operations

**Use individual APIs when:**
- Single schema operations
- Simple CRUD operations
- Real-time individual record updates
- Streaming or progressive data processing

## Transaction Behavior

> **Current Limitation**: Operations are executed sequentially without transaction rollback. If any operation fails, previously completed operations are NOT rolled back, potentially leaving the database in a partial state.

```javascript
// Current behavior: If user creation fails, account update is NOT rolled back
{
  "operations": [
    {"operation": "updateOne", "schema": "accounts", "id": "123", ...}, // Completes
    {"operation": "createOne", "schema": "users", "data": {...}}        // Fails - no rollback
  ]
}
```

**TODO**: Implement atomic transaction support for true all-or-nothing behavior.

## Related Documentation

- **Individual Operations**: See `/docs/data` for detailed CRUD operation documentation
- **Schema Management**: See `/docs/meta` for schema creation and management
- **Access Control**: See `/docs/auth` for user privilege management
- **Advanced Filtering**: See `/docs/find` for complex query operations

The Bulk API provides efficient batch processing capabilities while maintaining the full power and safety of the Monk platform's observer system and transaction management.