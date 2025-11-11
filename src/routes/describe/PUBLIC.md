# Describe API

The Describe API provides schema definition and management capabilities for the Monk platform. Create, update, and manage JSON Schema definitions that define the structure and validation rules for your data.

## Base Path
All Describe API routes are prefixed with `/api/describe`

## Endpoint Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/describe/:schema`](#post-apidescribeschema) | Create a new JSON Schema and generate its backing database table. |
| GET | [`/api/describe/:schema`](#get-apidescribeschema) | Retrieve the latest schema definition exactly as stored. |
| PUT | [`/api/describe/:schema`](#put-apidescribeschema) | Update a schema and apply matching database migrations. |
| DELETE | [`/api/describe/:schema`](#delete-apidescribeschema) | Soft-delete a schema definition so it can be restored later. |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
Requires valid JWT token in Authorization header: `Bearer <token>`

---

## POST /api/describe/:schema

Publish a new JSON Schema definition and let Monk automatically create the corresponding PostgreSQL table. The route validates the schema, enforces naming consistency, and seeds the describe cache for immediate use by the Data and File APIs.

### URL Parameters
- **schema**: Schema name (must match JSON title or use ?force=true)

### Request Body
```json
{
  "title": "users",
  "description": "User account management schema",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "User full name"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "User email address"
    },
    "role": {
      "type": "string",
      "enum": ["admin", "user", "moderator"],
      "description": "User access role"
    },
    "age": {
      "type": "integer",
      "minimum": 18,
      "maximum": 120
    },
    "preferences": {
      "type": "object",
      "description": "User preference settings"
    }
  },
  "required": ["name", "email", "role"]
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "name": "users",
    "table": "users",
    "created": true
  }
}
```

### Query Parameters
- **force=true**: Override schema name conflicts between URL and JSON title

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `SCHEMA_INVALID_FORMAT` | "Invalid schema definition format" | Malformed JSON |
| 400 | `SCHEMA_MISSING_FIELDS` | "Schema must have title and properties" | Missing required fields |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |
| 409 | `SCHEMA_NAME_CONFLICT` | "URL name conflicts with JSON title" | Name mismatch without force |

---

## GET /api/describe/:schema

Return the authoritative JSON Schema currently backing a schema. Use this endpoint to power design tools, generate forms, or confirm whether fields exist before writing data.

### URL Parameters
- **schema**: Schema name to retrieve

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "title": "users",
    "description": "User account management schema",
    "properties": {
      "name": {"type": "string", "minLength": 1},
      "email": {"type": "string", "format": "email"},
      "role": {"type": "string", "enum": ["admin", "user"]}
    },
    "required": ["name", "email", "role"]
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 401 | `TOKEN_INVALID` | "Invalid or expired token" | Authentication failure |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Schema doesn't exist |

---

## PUT /api/describe/:schema

Modify an existing schema and let the platform handle synchronized DDL changes. Whether you add fields, adjust constraints, or tweak metadata, the Describe service applies migrations safely and updates cache entries used by runtime validators.

### URL Parameters
- **schema**: Schema name to update

### Request Body
```json
{
  "title": "users",
  "description": "Updated user schema with new fields",
  "properties": {
    "name": {"type": "string", "minLength": 1},
    "email": {"type": "string", "format": "email"},
    "role": {"type": "string", "enum": ["admin", "user", "moderator"]},
    "department": {"type": "string", "description": "User department"},
    "active": {"type": "boolean", "default": true}
  },
  "required": ["name", "email", "role"]
}
```

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "name": "users",
    "updated": true
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `SCHEMA_INVALID_FORMAT` | "Invalid schema definition format" | Malformed JSON |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Schema doesn't exist |

---

## DELETE /api/describe/:schema

Soft-delete a schema definition so dependent data can no longer be mutated, while still allowing restoration if needed. Only system administrators should perform this operation because downstream routes will immediately block the schema once deleted.

### URL Parameters
- **schema**: Schema name to delete

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "name": "users",
    "deleted": true
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found or already deleted" | Schema doesn't exist |

---

## JSON Schema Support

### Supported Property Types
| Type | PostgreSQL Mapping | Example |
|------|-------------------|---------|
| `string` | TEXT or VARCHAR | `{"type": "string", "maxLength": 255}` |
| `integer` | INTEGER | `{"type": "integer", "minimum": 0}` |
| `number` | DECIMAL | `{"type": "number", "multipleOf": 0.01}` |
| `boolean` | BOOLEAN | `{"type": "boolean", "default": false}` |
| `array` | JSONB | `{"type": "array", "items": {"type": "string"}}` |
| `object` | JSONB | `{"type": "object", "properties": {...}}` |

### String Formats
| Format | Validation | PostgreSQL Type |
|--------|------------|-----------------|
| `email` | Email validation | TEXT |
| `uuid` | UUID format | UUID |
| `date-time` | ISO 8601 timestamp | TIMESTAMP |

### Validation Keywords
- **String**: `minLength`, `maxLength`, `pattern`, `enum`
- **Number**: `minimum`, `maximum`, `multipleOf`
- **Array**: `minItems`, `maxItems`, `uniqueItems`
- **All types**: `default`, `description`

## Usage Examples

### User Schema Definition
```bash
curl -X POST http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "users",
    "properties": {
      "name": {"type": "string", "minLength": 1},
      "email": {"type": "string", "format": "email"},
      "role": {"type": "string", "enum": ["admin", "user"]},
      "metadata": {"type": "object"}
    },
    "required": ["name", "email"]
  }'
```

### Product Catalog Schema
```bash
curl -X POST http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "products",
    "properties": {
      "name": {"type": "string", "minLength": 1},
      "price": {"type": "number", "minimum": 0},
      "category": {"type": "string", "enum": ["electronics", "books", "clothing"]},
      "in_stock": {"type": "boolean", "default": true},
      "tags": {"type": "array", "items": {"type": "string"}},
      "specifications": {"type": "object"}
    },
    "required": ["name", "price", "category"]
  }'
```

### Schema Retrieval
```bash
curl -X GET http://localhost:9001/api/describe/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## System Fields

All schemas automatically include system-managed fields that should not be defined in user schemas:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key (auto-generated) |
| `access_read` | UUID[] | Read access control list |
| `access_edit` | UUID[] | Edit access control list |
| `access_full` | UUID[] | Full access control list |
| `access_deny` | UUID[] | Deny access control list |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last modification time |
| `trashed_at` | TIMESTAMP | Soft delete timestamp |
| `deleted_at` | TIMESTAMP | Hard delete timestamp |

## Protected Schemas

System schemas cannot be modified or deleted:
- `schema` - Schema metadata registry
- `users` - User account management
- `columns` - Column metadata (legacy)

## Schema Lifecycle

### Development Workflow
```bash
# 1. Create schema
POST /api/describe/users

# 2. Add data using Data API
POST /api/data/users

# 3. Update schema as needed
PUT /api/describe/users

# 4. Query data with new structure
GET /api/data/users
```

### Schema Evolution
- **Additive changes**: New fields can be added safely
- **Breaking changes**: Removing required fields may affect existing data
- **Validation updates**: Constraint changes validated against existing records
- **Soft delete**: Schemas can be deleted and restored without data loss

## When to Use Describe API

**Use Describe API when:**
- Defining new data structures and validation rules
- Managing schema evolution and data model changes
- Setting up new applications or modules
- Implementing dynamic form generation

**Use Data API when:**
- Working with records in existing schemas
- CRUD operations on structured data
- Bulk data operations and migrations

**Use File API when:**
- Exploring schema structures and relationships
- Individual field access and manipulation
- Filesystem-like navigation of data

## Related Documentation

- **Data Operations**: `/docs/data` - Working with records in defined schemas
- **File Interface**: `/docs/file` - Filesystem-like access to schemas and data
- **Bulk Operations**: `/docs/bulk` - Batch schema and record operations
- **Advanced Search**: `/docs/find` - Complex queries across schema data

The Describe API provides the foundation for all data operations by defining the structure, validation rules, and relationships that govern your application's data model.
