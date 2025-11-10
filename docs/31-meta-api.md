# 31-Meta API Documentation

> **Schema Management and Metadata Operations**
>
> The Meta API (also known as the Describe API) provides comprehensive schema management capabilities, including JSON schema validation, DDL generation, and metadata operations for database tables and relationships.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Schema Management](#schema-management)
4. [Schema Features](#schema-features)
5. [Error Handling](#error-handling)
6. [Testing](#testing)
7. [Common Use Cases](#common-use-cases)

## Overview

The Meta API handles JSON schema definitions and automatic DDL (Data Definition Language) generation. It provides a complete schema management system that bridges JSON Schema validation with PostgreSQL table creation and management.

### Key Capabilities
- **JSON Schema Validation**: Complete JSON Schema support with AJV validator
- **DDL Generation**: Automatic PostgreSQL table creation from schema definitions
- **Schema Caching**: 15x performance improvement with SHA256 checksums
- **System Schema Protection**: Prevents modification of core system schemas
- **Relationship Management**: Support for nested relationships and foreign keys
- **Column Population**: Automatic column management and metadata

### Base URL
```
/api/describe/:schema
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

## Schema Management

### Create Schema

Creates a new schema definition and automatically generates the corresponding PostgreSQL table structure.

#### URL Name Pattern (Preferred)
```bash
POST /api/describe/:schema[?force=true]
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body:**
```json
{
  "title": "User Management",
  "description": "User account information",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "email": {
      "type": "string",
      "format": "email"
    }
  },
  "required": ["name", "email"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "account",
    "created": true,
    "columns": ["id", "name", "email"],
    "table": "account"
  }
}
```

#### JSON Name Pattern (Legacy)
```bash
POST /api/describe
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body:**
```json
{
  "name": "users",
  "title": "User Management",
  "description": "User account information",
  "type": "object",
  "properties": {
    // ... schema definition
  }
}
```

#### Conflict Resolution
- **URL name takes precedence** when both patterns are used
- **Add `?force=true`** to override existing schema conflicts
- **Without force**, conflicts return 409 error
- **System schemas** cannot be modified or deleted

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

Retrieves the complete JSON schema definition for a specific schema.

```bash
GET /api/describe/:schema
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "account",
    "title": "User Management",
    "description": "User account information",
    "type": "object",
    "properties": {
      "id": {"type": "string", "format": "uuid"},
      "name": {"type": "string", "minLength": 1},
      "email": {"type": "string", "format": "email"}
    },
    "required": ["name", "email"]
  }
}
```

### Update Schema

Updates an existing schema definition and automatically updates the database DDL.

```bash
PUT /api/describe/:schema
Content-Type: application/json
Authorization: Bearer <jwt>
```

**Request Body:**
```json
{
  "title": "Updated User Management",
  "description": "Enhanced user account information",
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "name": {"type": "string", "minLength": 2},
    "email": {"type": "string", "format": "email"},
    "phone": {"type": "string", "pattern": "^\\+?[1-9]\\d{1,14}$"}
  },
  "required": ["name", "email"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "account",
    "updated": true,
    "columns": ["id", "name", "email", "phone"]
  }
}
```

### Delete Schema

Soft deletes a schema and its associated table. The schema is marked as trashed but can be restored.

```bash
DELETE /api/describe/:schema
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "account",
    "deleted": true,
    "trashed_at": "2025-01-01T12:00:00.000Z"
  }
}
```

## Schema Features

### JSON Schema Validation
- **Complete JSON Schema Support**: Full AJV validator implementation
- **Custom Formats**: Support for email, uuid, date, uri formats
- **Pattern Validation**: Regular expression validation for strings
- **Range Validation**: Minimum/maximum values for numbers, length constraints
- **Required Fields**: Automatic validation of required properties

### DDL Generation
- **Automatic Table Creation**: PostgreSQL tables created automatically from schema
- **Column Type Mapping**: Intelligent mapping from JSON types to PostgreSQL types
- **Index Generation**: Automatic index creation for performance
- **Foreign Key Support**: Relationship definitions become foreign key constraints
- **Constraint Validation**: Check constraints, unique constraints, not null constraints

### Schema Caching
- **15x Performance Improvement**: Compiled validators cached with SHA256 checksums
- **Automatic Invalidation**: Cache updated when schema changes
- **Memory Efficient**: Only active schemas kept in memory
- **Checksum Validation**: Ensures schema integrity across requests

### System Schema Protection
- **Core System Schemas**: Protected from modification (users, tenants, etc.)
- **Validation Rules**: Prevents accidental deletion of critical schemas
- **Audit Trail**: All schema operations logged for security
- **Permission Checks**: Role-based access control for schema operations

## Error Handling

### Common Error Responses

#### Schema Already Exists
```json
{
  "success": false,
  "error": {
    "type": "ConflictError",
    "message": "Schema 'account' already exists",
    "code": "SCHEMA_EXISTS"
  }
}
```

#### Invalid Schema Definition
```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid JSON Schema: Property 'email' has invalid format",
    "field": "email",
    "code": "INVALID_SCHEMA"
  }
}
```

#### System Schema Protection
```json
{
  "success": false,
  "error": {
    "type": "PermissionError",
    "message": "Cannot modify system schema 'users'",
    "code": "SYSTEM_SCHEMA_PROTECTED"
  }
}
```

#### Schema Not Found
```json
{
  "success": false,
  "error": {
    "type": "NotFoundError",
    "message": "Schema 'nonexistent' not found",
    "code": "SCHEMA_NOT_FOUND"
  }
}
```

## Testing

For comprehensive testing information and test coverage details, please refer to the test suite documentation:

**[spec/31-meta-api/README.md](../spec/31-meta-api/README.md)**

This includes test scope, focus areas, and testing strategies for the Meta API endpoints.

## Common Use Cases

### Creating a Simple Schema
```bash
# Define schema
schema='{
  "title": "Product Catalog",
  "type": "object",
  "properties": {
    "name": {"type": "string", "minLength": 1},
    "price": {"type": "number", "minimum": 0},
    "category": {"type": "string", "enum": ["electronics", "books", "clothing"]}
  },
  "required": ["name", "price"]
}'

# Create schema
curl -X POST http://localhost:9001/api/describe/product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d "$schema"
```

### Managing Schema Relationships
```bash
# Create user schema with relationship to account
schema='{
  "title": "User Account",
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "email": {"type": "string", "format": "email"},
    "account_id": {
      "type": "string",
      "relationship": {
        "schema": "account",
        "type": "belongs_to"
      }
    }
  }
}'

curl -X POST http://localhost:9001/api/describe/user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d "$schema"
```

### Schema Validation and Error Handling
```bash
# Attempt to create invalid schema
invalid_schema='{
  "type": "invalid_type",
  "properties": {
    "email": {"type": "invalid_format"}
  }
}'

curl -X POST http://localhost:9001/api/describe/invalid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d "$invalid_schema"

# Expected error response
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid JSON Schema: Unknown type 'invalid_type'",
    "code": "INVALID_SCHEMA"
  }
}
```

### Bulk Schema Operations
```bash
# List all schemas
schemas=$(curl -s http://localhost:9001/api/describe \
  -H "Authorization: Bearer $(monk auth token)" | jq -r '.data[]')

# Process each schema
for schema in $schemas; do
  echo "Processing schema: $schema"
  # Get schema details
  details=$(curl -s http://localhost:9001/api/describe/$schema \
    -H "Authorization: Bearer $(monk auth token)")
  echo "Schema details: $details"
done
```

---

**Next: [32-Data API Documentation](32-data-api.md)** - Core CRUD operations and data management

**Related: [33-Find API Documentation](33-find-api.md)** - Advanced filtering and search capabilities