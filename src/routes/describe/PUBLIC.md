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

## Schema Reference

### Schema Fields

All fields available when creating or updating schemas via `POST /api/describe/:schema` or `PUT /api/describe/:schema`:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `schema_name` | text | Yes | - | Unique identifier for the schema. Must match URL parameter. |
| `status` | text | No | `pending` | Schema status: `pending`, `active`, or `system`. System schemas are protected. |
| `description` | text | No | - | Human-readable description of the schema's purpose. |
| `sudo` | boolean | No | `false` | Require sudo token for all data operations on this schema. |
| `freeze` | boolean | No | `false` | Prevent all data changes (create, update, delete). SELECT still works. |
| `immutable` | boolean | No | `false` | Records are write-once: can be created but never modified. Perfect for audit logs. |

**Notes:**
- System fields (id, timestamps, access_*) are automatically added to all tables
- `schema_name` must be a valid PostgreSQL identifier (alphanumeric and underscores)
- Schemas with `status='system'` cannot be modified or deleted

### Column Fields

All fields available when creating or updating columns via `POST /api/describe/:schema/:column` or `PUT /api/describe/:schema/:column`:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| **Identity** |
| `schema_name` | text | Yes | - | Name of the schema (from URL parameter). |
| `column_name` | text | Yes | - | Name of the column (from URL parameter). |
| `type` | text | Yes | - | Data type: `text`, `integer`, `decimal`, `boolean`, `timestamp`, `date`, `uuid`, `jsonb`, or array types (`text[]`, `integer[]`, etc.). See [type mapping](#postgresql-type-mapping). |
| **Constraints** |
| `required` | boolean | No | `false` | Whether the column is required (NOT NULL constraint). |
| `default_value` | text | No | - | Default value for the column. |
| `unique` | boolean | No | `false` | Whether the column must have unique values. Creates UNIQUE index. |
| **Validation** |
| `minimum` | numeric | No | - | Minimum value for numeric types. Application-level validation. |
| `maximum` | numeric | No | - | Maximum value for numeric types or max length for text. Application-level validation. |
| `pattern` | text | No | - | Regular expression pattern for text validation. Application-level validation. |
| `enum_values` | text[] | No | - | Array of allowed values. Application-level validation. |
| **Metadata** |
| `description` | text | No | - | Human-readable description of the column's purpose. |
| **Protection** |
| `immutable` | boolean | No | `false` | Value can be set once but never changed. Perfect for audit trails. |
| `sudo` | boolean | No | `false` | Require sudo token to modify this field, even if schema doesn't require sudo. |
| **Change Tracking** |
| `tracked` | boolean | No | `false` | Track changes to this column in the `history` table for audit trails. |
| **Relationships** |
| `relationship_type` | text | No | - | Type of relationship: `owned` or `referenced`. |
| `related_schema` | text | No | - | Target schema for the relationship. |
| `related_column` | text | No | `id` | Target column for the relationship (usually `id`). |
| `relationship_name` | text | No | - | Name of the relationship for API access. |
| `cascade_delete` | boolean | No | `false` | Whether to cascade delete when parent is deleted. |
| `required_relationship` | boolean | No | `false` | Whether the relationship is required (NOT NULL FK). |
| **Internal** |
| `is_array` | boolean | No | `false` | Internal flag set automatically based on type (e.g., `text[]`). |

**Notes:**
- `schema_name` and `column_name` come from URL parameters, not request body
- Changing `type`, `required`, or `default_value` triggers ALTER TABLE (structural change)
- Other fields are metadata-only and don't modify the PostgreSQL table
- Column names must start with a letter or underscore, followed by alphanumerics/underscores

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

### Request Body (Schema Metadata Only)
```json
{
  "schema_name": "users",
  "status": "active"
}
```

**Required Fields:**
- `schema_name` - Schema name

**Optional Fields:**
- `status` - Schema status (default: "pending")
- `sudo` - Require sudo token for all operations on this schema (default: false)
- `freeze` - Prevent all data changes on this schema (default: false)
- `immutable` - Records are write-once (default: false)

**Note:** Schema creation no longer accepts a `columns` array. Use column endpoints (`POST /api/describe/:schema/:column`) to add columns after creating the schema.

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "schema_name": "users",
    "status": "active"
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
    "schema_name": "users",
    "status": "active",
    "sudo": false,
    "freeze": false
  }
}
```

**Response includes:**
- Schema metadata only (no columns array)
- System fields (id, timestamps, access_*) are stripped from response

**To retrieve columns:** Use individual column endpoints (`GET /api/describe/:schema/:column`) or query the columns table directly via the Data API.

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
- `immutable` - Change immutable status (write-once pattern)

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "schema_name": "users",
    "status": "active"
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
    "schema_name": "users"
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
    "required": false,
    "pattern": "^\\+?[1-9]\\d{1,14}$",
    "description": "User phone number"
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
    "schema_name": "users",
    "column_name": "email",
    "type": "text",
    "required": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
    "description": "User email address"
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
    "schema_name": "users",
    "column_name": "email",
    "type": "text",
    "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
    "description": "Updated validation pattern"
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
    "column_name": "phone"
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

### Immutable Schemas
Schemas marked with `immutable=true` allow records to be created but never modified or deleted. Write-once data pattern.

**Use cases**:
- Audit logs and compliance trails that must never change
- Transaction history and financial records
- Event logs and time-series data
- Append-only ledgers

**Note:** Unlike `freeze`, immutable schemas still allow INSERT operations. Only UPDATE and DELETE are prevented.

### Field-Level Protection

**Immutable Fields**: Fields marked with `immutable=true` can be set once but never changed. Perfect for audit trails and write-once data like transaction IDs.

**Sudo-Protected Fields**: Fields marked with `sudo=true` require a sudo token to modify, even if the schema itself doesn't require sudo. Allows fine-grained protection of sensitive fields like salary or pricing information.

## Auto-Generated JSON Schema (Internal)

The system automatically generates JSON Schema in the `definitions` table via PostgreSQL trigger when columns are modified. This provides:
- Internal JSON Schema representation
- Future integration with validation tools
- Backward compatibility with JSON Schema consumers

**Note:** The `definitions` table is for internal use only and is NOT exposed via API responses. Use the column endpoints (GET /api/describe/:schema/:column) to retrieve column metadata.

## Usage Examples

### Creating a Product Schema with Columns

**Step 1: Create the schema**
```bash
curl -X POST http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "schema_name": "products",
    "status": "active"
  }'
```

**Step 2: Add columns sequentially**
```bash
# Add name column
curl -X POST http://localhost:9001/api/describe/products/name \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "required": true,
    "description": "Product name"
  }'

# Add price column
curl -X POST http://localhost:9001/api/describe/products/price \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "decimal",
    "required": true,
    "minimum": 0,
    "description": "Product price in USD"
  }'

# Add in_stock column
curl -X POST http://localhost:9001/api/describe/products/in_stock \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "boolean",
    "default_value": "true",
    "description": "Product availability status"
  }'
```

### Retrieving Schema Metadata
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
