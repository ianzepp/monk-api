# 31-Meta API Documentation

> **Schema Management and Metadata Operations**
>
> The Meta API (also known as the Describe API) provides comprehensive schema management capabilities using Monk-native format. Manage database table structures, column definitions, and metadata with direct PostgreSQL mapping.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Schema Management](#schema-management)
4. [Column Management](#column-management)
5. [Schema Features](#schema-features)
6. [Error Handling](#error-handling)
7. [Testing](#testing)
8. [Common Use Cases](#common-use-cases)

## Overview

The Meta API manages database schemas using Monk-native format with direct PostgreSQL type mapping. It provides automatic DDL generation, column metadata management, and optional JSON Schema export.

### Key Capabilities
- **Monk-Native Format**: Direct PostgreSQL type mapping (no JSON Schema conversion)
- **DDL Generation**: Automatic PostgreSQL table creation from column definitions
- **Column Management**: Full CRUD operations on individual columns
- **Schema Caching**: High-performance caching with checksum validation
- **System Schema Protection**: Prevents modification of core system schemas
- **Auto-Generated JSON Schema**: Definitions table maintains JSON Schema for interoperability

### Architecture
```
Monk API Input → columns table → PostgreSQL trigger → definitions table (JSON Schema)
                      ↓
                 CREATE TABLE DDL
```

### Base URLs
```
Schema operations: /api/describe/:schema
Column operations: /api/describe/:schema/:column
```

## Authentication

All Meta API endpoints require valid JWT authentication. The API respects tenant isolation and schema-level permissions.

```bash
Authorization: Bearer <jwt>
```

### Required Permissions
- **Schema Creation**: `create_schema` permission
- **Schema Reading**: `read_schema` permission
- **Schema Updates**: `update_schema` permission
- **Schema Deletion**: `delete_schema` permission
- **Column Operations**: Same as schema permissions

## Schema Management

### Create Schema

Creates a new schema using Monk-native format with direct PostgreSQL type mapping.

```bash
POST /api/describe/:schema
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body (Monk-native format):**
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
      "pattern_regex": "^[^@]+@[^@]+\\.[^@]+$",
      "description": "User email address"
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

**Response:**
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

**Required Fields:**
- `name` - Schema name (string)
- `table_name` - PostgreSQL table name (string)

**Optional Fields:**
- `status` - Schema status (default: "pending")
- `columns` - Array of column definitions (empty array if omitted)

**Column Fields:**
- `column_name` - Column name (required)
- `pg_type` - PostgreSQL type: text, integer, decimal, boolean, timestamp, uuid, jsonb (required)
- `is_required` - "true" or "false" (default: "false")
- `default_value` - Default value for column
- `minimum` - Minimum value (for numbers)
- `maximum` - Maximum value (for numbers/strings)
- `pattern_regex` - Regex pattern validation (for strings)
- `enum_values` - Array of allowed values
- `description` - Column description
- `relationship_type` - "owned" or "referenced" for foreign keys
- `related_schema` - Target schema for relationships
- `related_column` - Target column for relationships (default: "id")
- `relationship_name` - Name of the relationship
- `cascade_delete` - "true" or "false" for cascade delete
- `required_relationship` - "true" or "false"

### List Schemas

Retrieves all available schema names in the current tenant.

```bash
GET /api/describe
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": [
    "users",
    "accounts",
    "products"
  ]
}
```

### Get Schema

Retrieves complete schema definition with columns array in Monk-native format.

```bash
GET /api/describe/:schema
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "users",
    "table_name": "users",
    "status": "active",
    "field_count": "4",
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
      },
      {
        "column_name": "email",
        "pg_type": "text",
        "is_required": "true",
        "pattern_regex": "^[^@]+@[^@]+\\.[^@]+$"
      }
    ]
  }
}
```

### Update Schema

Updates schema metadata only (status, table_name). Use column endpoints to modify columns.

```bash
PUT /api/describe/:schema
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body:**
```json
{
  "status": "active"
}
```

**Allowed Updates:**
- `status` - Change schema status
- `table_name` - Update table reference (doesn't rename actual PostgreSQL table)

**Response:**
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

**Note:** To add, update, or remove columns, use the column endpoints below.

### Delete Schema

Soft deletes a schema and its associated table.

```bash
DELETE /api/describe/:schema
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "users",
    "deleted": true
  }
}
```

## Column Management

### Create Column

Add a new column to an existing schema.

```bash
POST /api/describe/:schema/:column
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body:**
```json
{
  "column_name": "phone",
  "pg_type": "text",
  "is_required": "false",
  "pattern_regex": "^\\+?[1-9]\\d{1,14}$",
  "description": "User phone number"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "column_name": "phone",
    "schema_name": "users",
    "pg_type": "text",
    "created_at": "2025-01-01T14:00:00Z"
  }
}
```

**Status:** Currently returns 501 Not Implemented (stub endpoint)

### Get Column

Retrieve a specific column definition.

```bash
GET /api/describe/:schema/:column
Authorization: Bearer <jwt>
```

**Response:**
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

### Update Column

Update an existing column's properties.

```bash
PUT /api/describe/:schema/:column
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body:**
```json
{
  "pattern_regex": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
  "description": "Updated email validation pattern"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "column_name": "email",
    "updated_at": "2025-01-01T15:00:00Z"
  }
}
```

**Status:** Currently returns 501 Not Implemented (stub endpoint)

### Delete Column

Remove a column from the schema.

```bash
DELETE /api/describe/:schema/:column
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "column_name": "phone",
    "deleted": true
  }
}
```

**Status:** Currently returns 501 Not Implemented (stub endpoint)

## Schema Features

### PostgreSQL Type Mapping

Direct type mapping without conversion:

| Monk pg_type | PostgreSQL Type | Example |
|--------------|-----------------|---------|
| `text` | TEXT | General strings |
| `varchar` | VARCHAR(n) | Limited strings (use with maximum) |
| `integer` | INTEGER | Whole numbers |
| `decimal` | DECIMAL | Precise decimals |
| `boolean` | BOOLEAN | True/false |
| `timestamp` | TIMESTAMP | Date and time |
| `uuid` | UUID | Unique identifiers |
| `jsonb` | JSONB | JSON data |

### Validation Constraints

- **Required Fields**: `is_required: "true"` → NOT NULL constraint
- **Default Values**: `default_value` → DEFAULT constraint
- **Number Ranges**: `minimum`, `maximum` → CHECK constraints
- **Pattern Validation**: `pattern_regex` → Application-level validation
- **Enum Values**: `enum_values` → Application-level validation

### Auto-Generated JSON Schema

The system automatically generates JSON Schema in the `definitions` table via PostgreSQL trigger:

```sql
-- Trigger fires on INSERT/UPDATE/DELETE in columns table
-- Regenerates JSON Schema from columns metadata
-- Stores in definitions table with checksum
```

This provides:
- JSON Schema for external tools
- OpenAPI/Swagger compatibility
- Backward compatibility with JSON Schema consumers
- Cached representation for interoperability

### System Schema Protection

Protected schemas cannot be modified or deleted:
- `schemas` - Schema metadata registry
- `users` - User account management
- `columns` - Column metadata table
- `definitions` - JSON Schema definitions

## Error Handling

### Common Error Responses

#### Missing Required Fields
```json
{
  "success": false,
  "error": "Both name and table_name are required",
  "error_code": "MISSING_REQUIRED_FIELDS"
}
```

#### Invalid Column Name
```json
{
  "success": false,
  "error": "Column name must start with letter or underscore",
  "error_code": "INVALID_COLUMN_NAME"
}
```

#### System Schema Protection
```json
{
  "success": false,
  "error": "Schema 'users' is protected and cannot be modified",
  "error_code": "SCHEMA_PROTECTED"
}
```

#### Schema Not Found
```json
{
  "success": false,
  "error": "Schema 'nonexistent' not found",
  "error_code": "SCHEMA_NOT_FOUND"
}
```

#### Column Not Found
```json
{
  "success": false,
  "error": "Column 'phone' not found in schema 'users'",
  "error_code": "COLUMN_NOT_FOUND"
}
```

#### No Valid Updates
```json
{
  "success": false,
  "error": "No valid fields to update",
  "error_code": "NO_UPDATES"
}
```

## Testing

For comprehensive testing information and test coverage details, please refer to the test suite documentation:

**[spec/31-meta-api/README.md](../spec/31-meta-api/README.md)**

This includes test scope, focus areas, and testing strategies for the Meta API endpoints.

## Common Use Cases

### Creating a Simple Schema
```bash
# Define schema with columns in Monk-native format
curl -X POST http://localhost:9001/api/describe/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "name": "products",
    "table_name": "products",
    "status": "active",
    "columns": [
      {
        "column_name": "name",
        "pg_type": "text",
        "is_required": "true",
        "description": "Product name"
      },
      {
        "column_name": "price",
        "pg_type": "decimal",
        "is_required": "true",
        "minimum": 0,
        "description": "Product price"
      },
      {
        "column_name": "category",
        "pg_type": "text",
        "is_required": "true",
        "enum_values": ["electronics", "books", "clothing"]
      },
      {
        "column_name": "in_stock",
        "pg_type": "boolean",
        "is_required": "false",
        "default_value": "true"
      }
    ]
  }'
```

### Retrieving Schema with Columns
```bash
# Get complete schema definition
curl -X GET http://localhost:9001/api/describe/products \
  -H "Authorization: Bearer $(monk auth token)"

# Response includes columns array with full metadata
```

### Updating Schema Status
```bash
# Update schema metadata
curl -X PUT http://localhost:9001/api/describe/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "status": "deprecated"
  }'
```

### Managing Individual Columns
```bash
# Get specific column
curl -X GET http://localhost:9001/api/describe/products/price \
  -H "Authorization: Bearer $(monk auth token)"

# Update column (when implemented)
curl -X PUT http://localhost:9001/api/describe/products/price \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "minimum": 0.01,
    "description": "Product price (minimum $0.01)"
  }'
```

### Schema with Relationships
```bash
# Create schema with foreign key relationship
curl -X POST http://localhost:9001/api/describe/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "name": "orders",
    "table_name": "orders",
    "columns": [
      {
        "column_name": "user_id",
        "pg_type": "uuid",
        "is_required": "true",
        "relationship_type": "referenced",
        "related_schema": "users",
        "related_column": "id",
        "relationship_name": "user",
        "required_relationship": "true"
      },
      {
        "column_name": "total",
        "pg_type": "decimal",
        "is_required": "true",
        "minimum": 0
      }
    ]
  }'
```

---

**Next: [32-Data API Documentation](32-data-api.md)** - Core CRUD operations and data management

**Related: [33-Find API Documentation](33-find-api.md)** - Advanced filtering and search capabilities
