# 31-Describe API Documentation

> **Schema Management and Metadata Operations**
>
> The Describe API provides comprehensive schema management capabilities using Monk-native format. Manage database table structures, column definitions, and metadata with direct PostgreSQL mapping.

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

The Describe API manages database schemas using Monk-native format with direct PostgreSQL type mapping. It provides automatic DDL generation, column metadata management, and optional JSON Schema export.

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

All Describe API endpoints require valid JWT authentication. The API respects tenant isolation and schema-level permissions.

```bash
Authorization: Bearer <jwt>
```

## Schema Management

### Create Schema

Creates a new schema using Monk-native format with direct PostgreSQL type mapping.

```bash
POST /api/describe/:schema
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Query Parameters:**
- `force=true` - Force creation even if schema exists (will drop and recreate the table)

**Request Body (Monk-native format):**
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
      "pattern": "^[^@]+@[^@]+\\.[^@]+$",
      "description": "User email address"
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
- `schema_name` - Schema name (string)

**Optional Fields:**
- `status` - Schema status (default: "pending")
- `sudo` - Require sudo token for all operations (default: false)
- `freeze` - Prevent all data changes on this schema (default: false)
- `columns` - Array of column definitions (empty array if omitted)

**Column Fields:**
- `column_name` - Column name (required)
- `type` - PostgreSQL type: text, integer, decimal, boolean, timestamp, uuid, jsonb (required)
- `required` - true or false (default: false)
- `default_value` - Default value for column
- `minimum` - Minimum value (for numbers)
- `maximum` - Maximum value (for numbers/strings)
- `pattern` - Regex pattern validation (for strings)
- `enum_values` - Array of allowed values
- `description` - Column description
- `immutable` - Prevent changes once set (default: false)
- `sudo` - Require sudo token to modify this field (default: false)
- `relationship_type` - "owned" or "referenced" for foreign keys
- `related_schema` - Target schema for relationships
- `related_column` - Target column for relationships (default: "id")
- `relationship_name` - Name of the relationship
- `cascade_delete` - true or false for cascade delete
- `required_relationship` - true or false

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
      },
      {
        "column_name": "email",
        "type": "text",
        "required": true,
        "pattern": "^[^@]+@[^@]+\\.[^@]+$"
      }
    ]
  }
}
```

**Note:** The `definition` field (JSON Schema) is stored in the `definitions` table for internal use only and is not exposed in API responses.

### Update Schema

Updates schema metadata only (status). Use column endpoints to modify columns.

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
- `sudo` - Change sudo requirement for schema operations
- `freeze` - Change freeze status (emergency lockdown)

**Response:**
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
    "schema_name": "users",
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
  "type": "text",
  "required": false,
  "pattern": "^\\+?[1-9]\\d{1,14}$",
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
    "type": "text",
    "created_at": "2025-01-01T14:00:00Z"
  }
}
```

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
    "type": "text",
    "required": true,
    "pattern": "^[^@]+@[^@]+\\.[^@]+$",
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
  "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
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

## Schema Features

### PostgreSQL Type Mapping

Direct type mapping without conversion:

| Monk type | PostgreSQL Type | Example |
|--------------|-----------------|---------|
| `text` | TEXT | General strings |
| `integer` | INTEGER | Whole numbers |
| `decimal` | NUMERIC | Precise decimals |
| `boolean` | BOOLEAN | True/false |
| `timestamp` | TIMESTAMP | Date and time |
| `uuid` | UUID | Unique identifiers |
| `jsonb` | JSONB | JSON data |
| `text[]` | TEXT[] | Text arrays |
| `integer[]` | INTEGER[] | Integer arrays |
| `decimal[]` | NUMERIC[] | Decimal arrays |
| `uuid[]` | UUID[] | UUID arrays |

### Validation Constraints

- **Required Fields**: `required: true` → NOT NULL constraint
- **Default Values**: `default_value` → DEFAULT constraint
- **Number Ranges**: `minimum`, `maximum` → CHECK constraints
- **Pattern Validation**: `pattern` → Application-level validation
- **Enum Values**: `enum_values` → Application-level validation

### Auto-Generated JSON Schema

The system automatically generates JSON Schema in the `definitions` table via PostgreSQL trigger for internal use only:

```sql
-- Trigger fires on INSERT/UPDATE/DELETE in columns table
-- Regenerates JSON Schema from columns metadata
-- Stores in definitions table with checksum
```

**Note:** JSON Schema definitions are for internal use only and are not exposed through the API. The API uses Monk-native format exclusively.

### Schema Protection Features

#### System Schema Protection
Protected schemas (status='system') cannot be modified or deleted:
- `schemas` - Schema metadata registry
- `users` - User account management
- `columns` - Column metadata table
- `definitions` - JSON Schema definitions (internal use only)

#### Sudo-Protected Schemas
Schemas marked with `sudo=true` require short-lived sudo token for all data operations:
```json
{
  "schema_name": "financial_accounts",
  "sudo": true,
  "columns": [...]
}
```
Users must call `POST /api/auth/sudo` to obtain a time-limited sudo token before modifying these schemas.

#### Frozen Schemas
Schemas marked with `freeze=true` prevent ALL data operations (emergency circuit breaker):
```json
{
  "schema_name": "audit_log",
  "freeze": true
}
```
Use for maintenance windows, regulatory freezes, or emergency lockdowns. SELECT operations continue to work.

#### Field-Level Protection

**Immutable Fields** - Write-once, never modified:
```json
{
  "column_name": "transaction_id",
  "type": "text",
  "immutable": true
}
```
Can be set during creation or first update, but subsequent changes are blocked.

**Sudo-Protected Fields** - Require sudo for specific sensitive fields:
```json
{
  "column_name": "salary",
  "type": "decimal",
  "sudo": true
}
```
Allows normal schema updates but requires sudo token for salary changes.

## Error Handling

### Common Error Responses

#### Missing Required Fields
```json
{
  "success": false,
  "error": "schema_name is required",
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

**[spec/31-describe-api/README.md](../spec/31-describe-api/README.md)**

This includes test scope, focus areas, and testing strategies for the Describe API endpoints.

## Common Use Cases

### Creating a Simple Schema
```bash
# Define schema with columns in Monk-native format
curl -X POST http://localhost:9001/api/describe/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{
    "schema_name": "products",
    "status": "active",
    "columns": [
      {
        "column_name": "name",
        "type": "text",
        "required": true,
        "description": "Product name"
      },
      {
        "column_name": "price",
        "type": "decimal",
        "required": true,
        "minimum": 0,
        "description": "Product price"
      },
      {
        "column_name": "category",
        "type": "text",
        "required": true,
        "enum_values": ["electronics", "books", "clothing"]
      },
      {
        "column_name": "in_stock",
        "type": "boolean",
        "required": false,
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
    "schema_name": "orders",
    "columns": [
      {
        "column_name": "user_id",
        "type": "uuid",
        "required": true,
        "relationship_type": "referenced",
        "related_schema": "users",
        "related_column": "id",
        "relationship_name": "user",
        "required_relationship": "true"
      },
      {
        "column_name": "total",
        "type": "decimal",
        "required": true,
        "minimum": 0
      }
    ]
  }'
```

---

**Next: [32-Data API Documentation](32-data-api.md)** - Core CRUD operations and data management

**Related: [33-Find API Documentation](33-find-api.md)** - Advanced filtering and search capabilities
