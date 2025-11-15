# Describe API

The Describe API provides schema definition and management capabilities using Monk-native format with direct PostgreSQL type mapping. Create, update, and manage database table structures with column-level precision.

## Base Path
All Describe API routes are prefixed with `/api/describe`

## Endpoint Summary

### Schema Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | [`/api/describe`](#get-apidescribe) | List all available schema names in the current tenant. |
| POST | [`/api/describe/:schema`](#post-apidescribeschema) | Create a new schema with column definitions using Monk-native format. |
| GET | [`/api/describe/:schema`](#get-apidescribeschema) | Retrieve schema definition with columns array. |
| PUT | [`/api/describe/:schema`](#put-apidescribeschema) | Update schema metadata (status, table_name). |
| DELETE | [`/api/describe/:schema`](#delete-apidescribeschema) | Soft-delete a schema definition. |

### Column Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | [`/api/describe/:schema/:column`](#post-apidescribeschemacolumn) | Create a new column (stub - returns 501). |
| GET | [`/api/describe/:schema/:column`](#get-apidescribeschemacolumn) | Retrieve column definition. |
| PUT | [`/api/describe/:schema/:column`](#put-apidescribeschemacolumn) | Update column properties (stub - returns 501). |
| DELETE | [`/api/describe/:schema/:column`](#delete-apidescribeschemacolumn) | Delete column (stub - returns 501). |

## Content Type
- **Request**: `application/json`
- **Response**: `application/json`

## Authentication Required
Requires valid JWT token in Authorization header: `Bearer <token>`

---

## Schema Operations

## GET /api/describe

List all available schema names in the current tenant.

### Success Response (200)
```json
{
  "success": true,
  "data": [
    "users",
    "products",
    "orders"
  ]
}
```

### Example
```bash
curl -X GET http://localhost:9001/api/describe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## POST /api/describe/:schema

Create a new schema using Monk-native format with column definitions. Automatically generates PostgreSQL table with specified columns and constraints.

### URL Parameters
- **schema**: Schema name (must match `name` field in body)

### Request Body (Monk-Native Format)
```json
{
  "name": "users",
  "table_name": "users",
  "status": "active",
  "columns": [
    {
      "column_name": "name",
      "pg_type": "text",
      "is_required": "true",
      "description": "User full name"
    },
    {
      "column_name": "email",
      "pg_type": "text",
      "is_required": "true",
      "pattern_regex": "^[^@]+@[^@]+\\.[^@]+$"
    },
    {
      "column_name": "age",
      "pg_type": "integer",
      "is_required": "false",
      "minimum": 18,
      "maximum": 120
    },
    {
      "column_name": "balance",
      "pg_type": "decimal",
      "is_required": "false",
      "default_value": "0.00"
    }
  ]
}
```

**Required Fields:**
- `name` - Schema name
- `table_name` - PostgreSQL table name

**Optional Fields:**
- `status` - Schema status (default: "pending")
- `columns` - Array of column definitions

**Column Definition Fields:**
- `column_name` - Column name (required)
- `pg_type` - PostgreSQL type: text, integer, decimal, boolean, timestamp, uuid, jsonb
- `is_required` - "true" or "false"
- `default_value` - Default value
- `minimum` / `maximum` - Range constraints
- `pattern_regex` - Validation pattern
- `enum_values` - Allowed values array
- `description` - Column description
- Relationship fields: `relationship_type`, `related_schema`, `related_column`, etc.

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

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `MISSING_REQUIRED_FIELDS` | "Both name and table_name are required" | Missing required fields |
| 400 | `INVALID_COLUMN_NAME` | "Column name must start with letter or underscore" | Invalid column name |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |

---

## GET /api/describe/:schema

Retrieve complete schema definition with columns array in Monk-native format.

### URL Parameters
- **schema**: Schema name to retrieve

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "users",
    "table_name": "users",
    "status": "active",
    "field_count": "3",
    "created_at": "2025-01-01T12:00:00Z",
    "updated_at": "2025-01-01T12:00:00Z",
    "definition": {
      "type": "object",
      "title": "users",
      "properties": { ... },
      "required": [ ... ]
    },
    "columns": [
      {
        "id": "uuid",
        "schema_name": "users",
        "column_name": "name",
        "pg_type": "text",
        "is_required": "true",
        "description": "User full name",
        "created_at": "2025-01-01T12:00:00Z",
        "updated_at": "2025-01-01T12:00:00Z"
      }
    ]
  }
}
```

**Response includes:**
- Schema metadata (schemas table fields)
- Auto-generated JSON Schema (`definition` field)
- Columns array with full column metadata

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Schema doesn't exist |

---

## PUT /api/describe/:schema

Update schema metadata only (status, table_name). **Does not modify columns** - use column endpoints for column changes.

### URL Parameters
- **schema**: Schema name to update

### Request Body
```json
{
  "status": "active"
}
```

**Allowed Updates:**
- `status` - Change schema status
- `table_name` - Update table reference (doesn't rename actual PostgreSQL table)

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "users",
    "table_name": "users",
    "status": "active",
    "updated_at": "2025-01-01T13:00:00Z"
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 400 | `NO_UPDATES` | "No valid fields to update" | Empty update |
| 403 | `SCHEMA_PROTECTED` | "Schema is protected and cannot be modified" | System schema |
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Schema doesn't exist |

**Note:** To modify columns, use the column endpoints below.

---

## DELETE /api/describe/:schema

Soft-delete a schema definition. Schema is marked as trashed and can be restored.

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

## Column Operations

## POST /api/describe/:schema/:column

**Status: 501 Not Implemented** - Stub endpoint for future column creation.

Add a new column to an existing schema.

### URL Parameters
- **schema**: Schema name
- **column**: Column name to create

### Request Body
```json
{
  "column_name": "phone",
  "pg_type": "text",
  "is_required": "false",
  "pattern_regex": "^\\+?[1-9]\\d{1,14}$"
}
```

---

## GET /api/describe/:schema/:column

Retrieve a specific column definition from the columns table.

### URL Parameters
- **schema**: Schema name
- **column**: Column name to retrieve

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "schema_name": "users",
    "column_name": "email",
    "pg_type": "text",
    "is_required": "true",
    "pattern_regex": "^[^@]+@[^@]+\\.[^@]+$",
    "description": "User email address",
    "created_at": "2025-01-01T12:00:00Z",
    "updated_at": "2025-01-01T12:00:00Z"
  }
}
```

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `COLUMN_NOT_FOUND` | "Column not found in schema" | Column doesn't exist |

---

## PUT /api/describe/:schema/:column

**Status: 501 Not Implemented** - Stub endpoint for future column updates.

Update an existing column's properties.

### URL Parameters
- **schema**: Schema name
- **column**: Column name to update

### Request Body
```json
{
  "pattern_regex": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
  "description": "Updated validation pattern"
}
```

---

## DELETE /api/describe/:schema/:column

**Status: 501 Not Implemented** - Stub endpoint for future column deletion.

Remove a column from the schema.

### URL Parameters
- **schema**: Schema name
- **column**: Column name to delete

---

## PostgreSQL Type Mapping

Direct type mapping without conversion:

| Monk pg_type | PostgreSQL Type | Use Case |
|--------------|-----------------|----------|
| `text` | TEXT | General strings |
| `varchar` | VARCHAR(n) | Limited strings (use with maximum) |
| `integer` | INTEGER | Whole numbers |
| `decimal` | DECIMAL | Precise decimals, currency |
| `boolean` | BOOLEAN | True/false values |
| `timestamp` | TIMESTAMP | Date and time |
| `uuid` | UUID | Unique identifiers |
| `jsonb` | JSONB | JSON data structures |

## System Fields

All schemas automatically include system-managed fields:

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

**Do not define these fields in your schemas** - they are automatically added.

## Protected Schemas

System schemas cannot be modified or deleted:
- `schemas` - Schema metadata registry
- `users` - User account management
- `columns` - Column metadata table
- `definitions` - JSON Schema definitions

## Auto-Generated JSON Schema

The system automatically generates JSON Schema in the `definitions` table via PostgreSQL trigger when columns are modified. This provides:
- JSON Schema for external tools
- OpenAPI/Swagger compatibility
- Backward compatibility
- Interoperability with JSON Schema consumers

Access via the `definition` field in GET responses.

## Usage Examples

### Creating a Product Schema
```bash
curl -X POST http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "products",
    "table_name": "products",
    "columns": [
      {
        "column_name": "name",
        "pg_type": "text",
        "is_required": "true"
      },
      {
        "column_name": "price",
        "pg_type": "decimal",
        "is_required": "true",
        "minimum": 0
      },
      {
        "column_name": "in_stock",
        "pg_type": "boolean",
        "default_value": "true"
      }
    ]
  }'
```

### Retrieving Schema with Columns
```bash
curl -X GET http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Updating Schema Status
```bash
curl -X PUT http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

### Getting Specific Column
```bash
curl -X GET http://localhost:9001/api/describe/products/price \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Related Documentation

- **Data Operations**: `/docs/data` - CRUD operations on schema records
- **File Interface**: `/docs/file` - Filesystem-like access to schemas and data
- **Bulk Operations**: `/docs/bulk` - Batch operations
- **Advanced Search**: `/docs/find` - Complex queries

The Describe API provides the foundation for all data operations by defining database structure with Monk-native format and direct PostgreSQL mapping.
