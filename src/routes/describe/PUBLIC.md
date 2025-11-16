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
| PUT | [`/api/describe/:schema`](#put-apidescribeschema) | Update schema metadata (status). |
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
- **schema**: Schema name (must match `schema_name` field in body)

### Query Parameters
- **force** (optional): Set to `true` to override schema name mismatch between URL and body. If URL schema differs from `schema_name` in body, request fails unless `?force=true` is provided.

### Request Body (Monk-Native Format)
```json
{
  "schema_name": "users",
  "status": "active",
  "columns": [
    {
      "column_name": "name",
      "type": "text",
      "required": true,
      "description": "User full name"
    },
    {
      "column_name": "email",
      "type": "text",
      "required": true,
      "pattern": "^[^@]+@[^@]+\\.[^@]+$"
    },
    {
      "column_name": "age",
      "type": "integer",
      "required": false,
      "minimum": 18,
      "maximum": 120
    },
    {
      "column_name": "balance",
      "type": "decimal",
      "required": false,
      "default_value": "0.00"
    }
  ]
}
```

**Required Fields:**
- `schema_name` - Schema name

**Optional Fields:**
- `status` - Schema status (default: "pending")
- `sudo` - Require sudo token for all operations on this schema (default: false)
- `freeze` - Prevent all data changes on this schema (default: false)
- `columns` - Array of column definitions

**Column Definition Fields:**
- `column_name` - Column name (required)
- `type` - PostgreSQL type: text, integer, decimal, boolean, timestamp, uuid, jsonb
- `required` - true or false
- `default_value` - Default value
- `minimum` / `maximum` - Range constraints
- `pattern` - Validation pattern
- `enum_values` - Allowed values array
- `description` - Column description
- `immutable` - Prevent changes once set (default: false)
- `sudo` - Require sudo token to modify this field (default: false)
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
| 400 | `MISSING_REQUIRED_FIELDS` | "Schema name is required" | Missing required fields |
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
    "schema_name": "users",
    "status": "active",
    "created_at": "2025-01-01T12:00:00Z",
    "updated_at": "2025-01-01T12:00:00Z",
    "columns": [
      {
        "id": "uuid",
        "schema_name": "users",
        "column_name": "name",
        "type": "text",
        "required": true,
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
- Columns array with full column metadata

**Note:** The system auto-generates JSON Schema in an internal `definitions` table via PostgreSQL trigger, but this is not exposed in API responses.

### Error Responses

| Status | Error Code | Message | Condition |
|--------|------------|---------|-----------|
| 404 | `SCHEMA_NOT_FOUND` | "Schema not found" | Schema doesn't exist |

---

## PUT /api/describe/:schema

Update schema metadata only (status). **Does not modify columns** - use column endpoints for column changes.

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
- `sudo` - Change sudo requirement for schema operations
- `freeze` - Change freeze status (emergency lockdown)

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "schema_name": "users",
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

Add a new column to an existing schema.

### URL Parameters
- **schema**: Schema name
- **column**: Column name to create

### Request Body
```json
{
  "type": "text",
  "required": false,
  "pattern": "^\\+?[1-9]\\d{1,14}$",
  "description": "User phone number"
}
```

**Note:** The `column_name` is taken from the URL parameter, not the request body.

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "schema_name": "users",
    "column_name": "phone",
    "type": "text",
    "created": true
  }
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
    "type": "text",
    "required": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
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

Update an existing column's properties. Supports both metadata updates and structural changes with ALTER TABLE.

### URL Parameters
- **schema**: Schema name
- **column**: Column name to update

### Request Body
```json
{
  "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
  "description": "Updated validation pattern"
}
```

**Updateable Fields:**
- Metadata only: `description`, `pattern`, `minimum`, `maximum`, `enum_values`, `immutable`, `sudo`, relationship fields
- Structural (triggers ALTER TABLE): `type`, `required`, `default_value`

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "schema_name": "users",
    "column_name": "email",
    "type": "text",
    "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
    "description": "Updated validation pattern",
    "updated_at": "2025-01-01T13:00:00Z"
  }
}
```

---

## DELETE /api/describe/:schema/:column

Remove a column from the schema. Performs both soft delete (marks as trashed in columns table) and hard delete (DROP COLUMN from PostgreSQL table).

### URL Parameters
- **schema**: Schema name
- **column**: Column name to delete

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "schema_name": "users",
    "column_name": "phone",
    "deleted": true
  }
}
```

**Warning:** This operation permanently removes the column and all its data from the PostgreSQL table.

---

## PostgreSQL Type Mapping

User-facing types are mapped to PostgreSQL types internally:

| User Type | PostgreSQL Type | Use Case |
|-----------|-----------------|----------|
| `text` | TEXT | General strings |
| `integer` | INTEGER | Whole numbers |
| `decimal` | NUMERIC | Precise decimals, currency |
| `boolean` | BOOLEAN | True/false values |
| `timestamp` | TIMESTAMP | Date and time |
| `date` | DATE | Date only |
| `uuid` | UUID | Unique identifiers |
| `jsonb` | JSONB | JSON data structures |
| `text[]` | TEXT[] | Array of strings |
| `integer[]` | INTEGER[] | Array of integers |
| `decimal[]` | NUMERIC[] | Array of decimals |
| `uuid[]` | UUID[] | Array of UUIDs |

**Note:** Use user-facing types (e.g., `decimal`) in API requests. The system automatically maps them to appropriate PostgreSQL types (e.g., `NUMERIC`).

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

## Schema Protection Features

### System Schema Protection
System schemas (status='system') cannot be modified or deleted:
- `schemas` - Schema metadata registry
- `users` - User account management
- `columns` - Column metadata table
- `definitions` - Auto-generated JSON Schema definitions (internal use only)

### Sudo-Protected Schemas
Schemas marked with `sudo=true` require a short-lived sudo token for all data operations. Users must call `POST /api/auth/sudo` to obtain the token before modifying these schemas.

**Use case**: Protect critical system schemas from accidental modifications.

### Frozen Schemas
Schemas marked with `freeze=true` prevent ALL data changes (create, update, delete). SELECT operations continue to work normally.

**Use cases**:
- Emergency lockdowns during security incidents
- Maintenance windows requiring read-only access
- Regulatory compliance freeze periods

### Field-Level Protection

**Immutable Fields**: Fields marked with `immutable=true` can be set once but never changed. Perfect for audit trails and write-once data like transaction IDs.

**Sudo-Protected Fields**: Fields marked with `sudo=true` require a sudo token to modify, even if the schema itself doesn't require sudo. Allows fine-grained protection of sensitive fields like salary or pricing information.

## Auto-Generated JSON Schema (Internal)

The system automatically generates JSON Schema in the `definitions` table via PostgreSQL trigger when columns are modified. This provides:
- Internal JSON Schema representation
- Future integration with validation tools
- Backward compatibility with JSON Schema consumers

**Note:** The `definitions` table is for internal use only and is NOT exposed via API responses. Use the `columns` array from GET /api/describe/:schema for schema metadata.

## Usage Examples

### Creating a Product Schema
```bash
curl -X POST http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "products",
    "columns": [
      {
        "column_name": "name",
        "type": "text",
        "required": true
      },
      {
        "column_name": "price",
        "type": "decimal",
        "required": true,
        "minimum": 0
      },
      {
        "column_name": "in_stock",
        "type": "boolean",
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
