# Find API

The Find API provides advanced search and filtering capabilities for records across schemas. Execute complex queries with sophisticated filtering, sorting, and aggregation operations.

## Base Path
All Find API operations use: `POST /api/find/:schema`

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
Requires valid JWT token in Authorization header: `Bearer <token>`

---

## POST /api/find/:schema

Execute advanced search queries against a specific schema with complex filtering and sorting capabilities.

### Request Body
```json
{
  "where": {
    // Complex filter conditions (see Filter Operations below)
  },
  "order": [
    "created_at desc",
    "name asc"
  ],
  "limit": 100,
  "offset": 0
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "admin",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T14:22:00Z"
    }
  ]
}
```

## Advanced Filter Operations

### Basic Comparison Operators
```json
{
  "where": {
    "name": "John Doe",                    // Exact match
    "age": {"$gte": 18},                   // Greater than or equal
    "salary": {"$between": [50000, 100000]}, // Range
    "status": {"$in": ["active", "pending"]}, // One of values
    "email": {"$like": "%@company.com"}     // Pattern matching
  }
}
```

### Logical Operators
```json
{
  "where": {
    "$and": [
      {"department": "engineering"},
      {"$or": [
        {"role": "senior"},
        {"experience": {"$gte": 5}}
      ]}
    ]
  }
}
```

### Array Operations (ACL Support)
```json
{
  "where": {
    "access_read": {"$any": ["user-123"]},     // User has read access
    "tags": {"$all": ["urgent", "review"]},    // Contains all tags
    "permissions": {"$size": {"$gte": 3}}      // Array length >= 3
  }
}
```

### Advanced Patterns
```json
{
  "where": {
    "metadata": {
      "preferences": {
        "theme": "dark"                        // Nested object queries
      }
    },
    "created_at": {
      "$between": ["2024-01-01", "2024-01-31"] // Date range
    },
    "$not": {
      "status": "archived"                     // Negation
    }
  }
}
```

## Sorting and Pagination

### Multiple Sort Fields
```json
{
  "order": [
    "priority desc",
    "created_at asc", 
    "name asc"
  ]
}
```

### Pagination
```json
{
  "limit": 50,        // Maximum records to return
  "offset": 100       // Skip first 100 records (for page 3 of 50-record pages)
}
```

## Usage Examples

### User Search with Complex Criteria
```bash
curl -X POST http://localhost:9001/api/find/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {
      "$and": [
        {"department": "engineering"},
        {"status": {"$in": ["active", "probation"]}},
        {"created_at": {"$gte": "2024-01-01T00:00:00Z"}},
        {"access_read": {"$any": ["project-alpha"]}}
      ]
    },
    "order": [
      "last_login desc"
    ],
    "limit": 25
  }'
```

### Product Catalog Search
```bash
curl -X POST http://localhost:9001/api/find/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {
      "$or": [
        {"category": "electronics"},
        {"tags": {"$any": ["featured", "sale"]}}
      ],
      "price": {"$between": [10, 500]},
      "in_stock": true
    },
    "order": [
      "popularity desc",
      "price asc"
    ]
  }'
```

### Access Control Queries
```bash
curl -X POST http://localhost:9001/api/find/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "where": {
      "$and": [
        {"access_read": {"$any": ["current-user-id"]}},
        {"trashed_at": null},
        {"$or": [
          {"tags": {"$any": ["urgent"]}},
          {"priority": {"$gte": 8}}
        ]}
      ]
    }
  }'
```

## Filter Operators Reference

### Comparison Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `$eq` | Equals | `{"age": {"$eq": 25}}` |
| `$ne` | Not equals | `{"status": {"$ne": "deleted"}}` |
| `$gt` | Greater than | `{"score": {"$gt": 90}}` |
| `$gte` | Greater than or equal | `{"age": {"$gte": 18}}` |
| `$lt` | Less than | `{"price": {"$lt": 100}}` |
| `$lte` | Less than or equal | `{"quantity": {"$lte": 10}}` |
| `$between` | Value between range | `{"salary": {"$between": [40000, 80000]}}` |

### Array Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `$in` | Value in array | `{"status": {"$in": ["active", "pending"]}}` |
| `$nin` | Value not in array | `{"role": {"$nin": ["guest", "banned"]}}` |
| `$any` | Array contains any value | `{"tags": {"$any": ["urgent", "review"]}}` |
| `$all` | Array contains all values | `{"skills": {"$all": ["javascript", "typescript"]}}` |
| `$size` | Array size comparison | `{"permissions": {"$size": {"$gte": 3}}}` |

### Text Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `$like` | SQL LIKE pattern | `{"email": {"$like": "%@company.com"}}` |
| `$ilike` | Case-insensitive LIKE | `{"name": {"$ilike": "%john%"}}` |
| `$regex` | Regular expression | `{"phone": {"$regex": "^\\+1"}}` |

### Logic Operators
| Operator | Description | Example |
|----------|-------------|---------|
| `$and` | All conditions must match | `{"$and": [{"age": {"$gte": 18}}, {"status": "active"}]}` |
| `$or` | Any condition must match | `{"$or": [{"role": "admin"}, {"permissions": {"$any": ["write"]}}]}` |
| `$not` | Condition must not match | `{"$not": {"status": "deleted"}}` |
| `$nand` | Not all conditions match | `{"$nand": [{"role": "guest"}, {"verified": false}]}` |
| `$nor` | No conditions match | `{"$nor": [{"banned": true}, {"suspended": true}]}` |

## Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `REQUEST_INVALID_FORMAT` | "Request body must be an array of operations" | Invalid request structure |
| 400 | `OPERATION_MISSING_FIELDS` | "Operation missing required fields" | Missing operation or schema |
| 400 | `OPERATION_MISSING_ID` | "ID required for operation" | Single-record operation without ID |
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Authentication failure |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Target schema doesn't exist |
| 422 | `OPERATION_UNSUPPORTED` | "Unsupported operation" | Invalid operation type |

## Performance Considerations

### Query Optimization
- **Index usage**: Ensure filtered fields have database indexes
- **Limit results**: Use pagination for large datasets
- **Selective fields**: Request only needed fields when possible
- **Filter early**: Apply most selective filters first

### Best Practices
```bash
# Good: Specific filters with limits
{"where": {"status": "active", "department": "sales"}, "limit": 100}

# Avoid: Broad queries without limits  
{"where": {"created_at": {"$gte": "2020-01-01"}}} # No limit - could return millions
```

## When to Use Find API

**Use Find API when:**
- Complex filtering across multiple fields and conditions
- Advanced sorting requirements with multiple criteria
- ACL-based queries requiring permission filtering
- Analytics queries requiring aggregation-style filtering

**Use Data API when:**
- Simple CRUD operations on known records
- Bulk operations across multiple schemas (use Bulk API)
- Real-time record updates
- File-like access patterns (use File API)

## Related Documentation

- **Data Operations**: `/docs/data` - Standard CRUD operations
- **Bulk Operations**: `/docs/bulk` - Multi-schema batch processing
- **Schema Management**: `/docs/meta` - Creating and managing data schemas
- **File Interface**: `/docs/file` - Filesystem-like data access

The Find API provides powerful search capabilities while maintaining full integration with the Monk platform's observer system and access control mechanisms.