# API Documentation

## Table of Contents
1. [API Architecture](#api-architecture)
2. [Endpoint Patterns](#endpoint-patterns)
3. [Authentication](#authentication)
4. [Data API](#data-api)
5. [Meta API](#meta-api)
6. [Root API](#root-api)
7. [Common Development Tasks](#common-development-tasks)

## API Architecture

### Path-Based Route Structure

Routes follow intuitive file organization where file path directly maps to URL path:

```
/routes/data/:schema/POST.ts        → POST /api/data/:schema
/routes/data/:schema/:id/GET.ts     → GET /api/data/:schema/:id
/routes/meta/schema/:name/PUT.ts    → PUT /api/meta/schema/:name
/routes/auth/login/POST.ts          → POST /auth/login
```

### Modern Route Handler Pattern

```typescript
// NEW: Clean route handlers with parameter pre-extraction
import { withParams } from '@src/lib/route-helpers.js';

export default withParams(async (context, { system, schema, body }) => {
    // Pure business logic - no boilerplate
    const result = await system.database.createAll(schema!, body);
    setRouteResult(context, result);
});
```

### Content-Type Aware Body Handling
- **JSON requests**: `body` is parsed JSON object
- **YAML requests**: `body` is raw YAML string (for schema operations)
- **Binary requests**: `body` is ArrayBuffer (ready for file uploads)
- **Automatic detection**: Based on Content-Type header

### Route Organization
```bash
# Barrel exports for clean organization
src/routes/data/routes.ts     # SchemaGet, SchemaPost, RecordGet, RecordPut
src/routes/meta/routes.ts     # SchemaGet, SchemaPost, SchemaPut, SchemaDelete
src/routes/health/GET.ts      # Health check in proper file structure

# Clean index.ts registration
import * as dataRoutes from '@src/routes/data/routes.js';
app.get('/api/data/:schema', dataRoutes.SchemaGet);
app.get('/api/data/:schema/:id', dataRoutes.RecordGet);
```

## Endpoint Patterns

### Consistent Array/Object Pattern

```bash
# Array endpoints (bulk operations)
GET /api/data/:schema           → Returns: []
POST /api/data/:schema          → Expects: [], Returns: []
PUT /api/data/:schema           → Expects: [], Returns: []
DELETE /api/data/:schema        → Expects: [], Returns: []

# Object endpoints (single record)  
GET /api/data/:schema/:id       → Returns: {}
PUT /api/data/:schema/:id       → Expects: {}, Returns: {}
DELETE /api/data/:schema/:id    → Returns: {}
```

### CLI Command Mapping

```bash
# CLI automatically handles array/object conversion
monk data create account        # Wraps {} in [] for API
monk data list account          # Calls array endpoint  
monk data get account <id>      # Calls object endpoint
monk data update account <id>   # Calls object endpoint
```

## Authentication

### Multi-tenant Authentication
- **Auth Database**: `monk-api-auth` contains tenant registry
- **Tenant Databases**: `monk-api$tenant-name` for each tenant
- **JWT Routing**: Tokens contain tenant and database routing information
- **Isolation**: Each tenant gets separate database and user management

### JWT Structure
```typescript
interface JWTPayload {
    tenant: string;        // Tenant name
    database: string;      // Full database name (monk-api$tenant)
    access: string;        // User access level
    user: string;          // Username
    exp: number;           // Expiration timestamp
}
```

### Authentication Flow
```bash
# 1. Create tenant
monk tenant create my-tenant

# 2. Use tenant  
monk tenant use my-tenant

# 3. Authenticate with tenant
monk auth login my-tenant root

# 4. Use authenticated endpoints
monk data list schema
```

## Data API

### Core CRUD Operations

All data operations automatically run through the observer pipeline for validation, security, audit, and integration.

#### Create Records
```bash
# Single record
POST /api/data/:schema
Content-Type: application/json
Authorization: Bearer <jwt>

{
  "name": "Test User",
  "email": "test@example.com"
}

# Multiple records
POST /api/data/:schema
Content-Type: application/json
Authorization: Bearer <jwt>

[
  {"name": "User 1", "email": "user1@example.com"},
  {"name": "User 2", "email": "user2@example.com"}
]
```

#### Read Records
```bash
# List all records (with filtering)
GET /api/data/:schema?where={"status":"active"}&limit=10&order=["created_at desc"]

# Get specific record
GET /api/data/:schema/:id
```

#### Update Records
```bash
# Update specific record
PUT /api/data/:schema/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "email": "updated@example.com"
}

# Bulk update (with filtering)
PUT /api/data/:schema?where={"status":"pending"}
Content-Type: application/json

{
  "status": "active",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

#### Delete Records
```bash
# Soft delete specific record
DELETE /api/data/:schema/:id

# Bulk soft delete (with filtering)
DELETE /api/data/:schema?where={"status":"inactive"}
```

### Advanced Filtering

The data API supports complex filtering using the enterprise Filter system:

```bash
# Complex filtering example
GET /api/data/documents
Content-Type: application/json

{
  "where": {
    "$and": [
      {
        "$or": [
          { "access_read": { "$any": ["user-123", "group-456"] } },
          { "access_edit": { "$any": ["user-123", "group-456"] } }
        ]
      },
      { "access_deny": { "$nany": ["user-123", "group-456"] } },
      { "status": { "$nin": ["archived", "deleted"] } },
      { "created_at": { "$between": ["2024-01-01", "2024-12-31"] } }
    ]
  },
  "order": ["created_at desc"],
  "limit": 25
}
```

### Soft Delete System

Three-tier access pattern:
- **📋 List Operations**: Hide trashed records (`GET /api/data/:schema`)
- **🔍 Direct Access**: Allow ID retrieval (`GET /api/data/:schema/:id`)  
- **🔒 Update Operations**: Block modifications until restoration

## Meta API

### Schema Management

The Meta API handles YAML schema definitions and DDL generation:

#### Create Schema
```bash
POST /api/meta/schema
Content-Type: application/yaml
Authorization: Bearer <jwt>

name: users
title: User Management
description: User account information
type: object
properties:
  id:
    type: string
    format: uuid
  name:
    type: string
    minLength: 1
  email:
    type: string
    format: email
required:
  - name
  - email
```

#### List Schemas
```bash
GET /api/meta/schema
Authorization: Bearer <jwt>

# Response: Array of schema names
["users", "accounts", "products"]
```

#### Get Schema
```bash
GET /api/meta/schema/:name
Authorization: Bearer <jwt>

# Response: Complete YAML schema definition
```

#### Update Schema
```bash
PUT /api/meta/schema/:name
Content-Type: application/yaml
Authorization: Bearer <jwt>

# Updated YAML schema definition
# Automatically updates database DDL
```

#### Delete Schema
```bash
DELETE /api/meta/schema/:name
Authorization: Bearer <jwt>

# Soft deletes schema and associated table
```

### Schema Features
- **JSON Schema Validation**: Complete JSON Schema support with AJV
- **DDL Generation**: Automatic PostgreSQL table creation from schema
- **Schema Caching**: 15x performance improvement with SHA256 checksums
- **System Schema Protection**: Prevents modification of core system schemas

## Root API

### Localhost Development Only

Authentication-free tenant management for UIX development, available only on localhost with `NODE_ENV=development`.

#### Security Restrictions
- **Environment**: Only available when `NODE_ENV=development`
- **Network**: Only accessible from `localhost` or `127.0.0.1`
- **Audit**: All operations logged with warnings for security awareness

#### Tenant Management Endpoints (Phase 1 Complete)

**Create Tenant:**
```bash
POST /api/root/tenant
Content-Type: application/json

{
  "name": "My Amazing App! 🚀",  # Unicode fully supported
  "host": "localhost"        # Optional, defaults to localhost
}

# Response
{
  "success": true,
  "tenant": "My Amazing App! 🚀",      # Original display name preserved
  "database": "tenant_a1b2c3d4e5f6789a",    # SHA256 hash for safe DB identifier
  "host": "localhost",
  "created_at": "2025-08-28T20:03:03.033Z"
}
```

**List All Tenants:**
```bash
GET /api/root/tenant?include_trashed=true&include_deleted=false

# Response
{
  "success": true,
  "tenants": [
    {
      "name": "My Amazing App! 🚀",      # Unicode display name
      "database": "tenant_a1b2c3d4e5f6789a",  # Hashed database identifier
      "host": "localhost",
      "status": "active",
      "created_at": "2025-08-28T20:03:03.033Z",
      "updated_at": "2025-08-28T20:03:03.033Z",
      "trashed_at": null,
      "deleted_at": null
    }
  ],
  "count": 1
}
```

**Show Individual Tenant:**
```bash
GET /api/root/tenant/my_ui_tenant

# Response
{
  "success": true,
  "tenant": {
    "name": "my_ui_tenant",
    "database": "my_ui_tenant",
    "host": "localhost",
    "status": "active",
    "created_at": "2025-08-28T20:03:03.033Z",
    "updated_at": "2025-08-28T20:03:03.033Z"
  }
}
```

**Health Check:**
```bash
GET /api/root/tenant/my_ui_tenant/health

# Response
{
  "success": true,
  "health": {
    "tenant": "my_ui_tenant",
    "timestamp": "2025-08-28T20:40:40.409Z",
    "checks": {
      "tenant_exists": true,
      "database_exists": true,
      "database_connection": true,
      "schema_table_exists": true,
      "users_table_exists": true,
      "root_user_exists": true
    },
    "status": "healthy",
    "errors": []
  }
}
```

**Soft Delete Tenant:**
```bash
DELETE /api/root/tenant/my_ui_tenant

# Response
{
  "success": true,
  "tenant": "my_ui_tenant",
  "trashed": true,
  "trashed_at": "2025-08-28T20:41:56.893Z"
}
```

**Restore Tenant:**
```bash
PUT /api/root/tenant/my_ui_tenant

# Response
{
  "success": true,
  "tenant": "my_ui_tenant",
  "restored": true,
  "restored_at": "2025-08-28T20:42:03.733Z"
}
```

**Hard Delete Tenant:**
```bash
DELETE /api/root/tenant/my_ui_tenant?force=true

# Response
{
  "success": true,
  "tenant": "my_ui_tenant",
  "deleted": true,
  "deleted_at": "2025-08-28T20:42:10.538Z"
}
```

**List Tenants:**
```bash
GET /api/root/tenant                    # Active tenants only
GET /api/root/tenant?include_trashed=true   # Include soft deleted
GET /api/root/tenant?include_deleted=true   # Include hard deleted

# Response
{
  "success": true,
  "tenants": [
    {
      "name": "my-tenant",
      "database": "monk-api$my-tenant", 
      "host": "localhost",
      "created_at": "2025-08-26T04:42:15.283Z",
      "updated_at": "2025-08-26T04:42:15.283Z",
      "trashed_at": null,
      "deleted_at": null,
      "status": "active"
    }
  ],
  "count": 1
}
```

**Soft Delete Tenant (Trash):**
```bash
DELETE /api/root/tenant/my-tenant

# Response  
{
  "success": true,
  "tenant": "my-tenant",
  "trashed": true,
  "trashed_at": "2025-08-26T04:42:26.515Z"
}
```

**Restore Tenant:**
```bash
PUT /api/root/tenant/my-tenant

# Response
{
  "success": true, 
  "tenant": "my-tenant",
  "restored": true,
  "restored_at": "2025-08-26T04:42:44.372Z"
}
```

#### UIX Development Workflow
```javascript
// No authentication required on localhost:

// Create tenant for UI development
const tenant = await fetch('http://localhost:9001/api/root/tenant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'ui-demo' })
}).then(r => r.json());

// List active tenants
const tenants = await fetch('http://localhost:9001/api/root/tenant')
  .then(r => r.json());

// Soft delete when done (preserves data)
await fetch('http://localhost:9001/api/root/tenant/ui-demo', { 
  method: 'DELETE' 
});

// Restore if needed
await fetch('http://localhost:9001/api/root/tenant/ui-demo', { 
  method: 'PUT' 
});
```

#### Tenant Lifecycle Management
- **Create**: Instant tenant creation with database initialization and root user
- **Show**: Individual tenant details with status information
- **Health Check**: Comprehensive database connectivity and integrity checks
- **Soft Delete**: Tenant hidden but database and data preserved (`trashed_at`)
- **Restore**: Trashed tenants can be restored without data loss (clear `trashed_at`)
- **Hard Delete**: Permanent removal with `?force=true` parameter (removes database and record)
- **Update**: Endpoint exists but requires `TenantService.updateTenant()` implementation

## Common Development Tasks

### Adding New API Endpoints

```bash
# 1. Create route handler
src/routes/new-endpoint.ts

# 2. Use middleware pattern (systemContextMiddleware provides system)
export default withParams(async (context, { system, schema, body }) => {
    // Pure business logic - no boilerplate
    const result = await system.database.selectAny(schema!);
    setRouteResult(context, result);
});

# 3. Register in main router with appropriate response middleware
src/index.ts
app.use('/api/new/*', responseJsonMiddleware);  // For JSON responses
app.route('/api/new', newRouter);
```

### Schema Development

```bash
# 1. Create YAML schema
tests/schemas/new-schema.yaml

# 2. Deploy for testing
cat tests/schemas/new-schema.yaml | monk meta create schema

# 3. Test CRUD operations
echo '{"field": "value"}' | monk data create new-schema
monk data list new-schema
```

### Testing API Endpoints

```bash
# Health check
curl http://localhost:9001/health

# Authenticated ping
curl -H "Authorization: Bearer $(monk auth token)" \
  http://localhost:9001/ping

# Data operations
curl -X POST http://localhost:9001/api/data/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{"name": "Test User", "email": "test@example.com"}'

# Schema operations
curl -X POST http://localhost:9001/api/meta/schema \
  -H "Content-Type: application/yaml" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d 'name: test-schema...'
```

### Error Handling

The API uses consistent error response format:

```json
{
  "success": false,
  "error": {
    "type": "ValidationError",
    "message": "Invalid email format",
    "field": "email",
    "code": "VALIDATION_FAILED"
  }
}
```

### Rate Limiting and Security

- **CORS**: Configured for cross-origin requests
- **JWT Validation**: All authenticated endpoints require valid JWT
- **SQL Injection Protection**: All queries use parameterized SQL
- **Schema Validation**: All data validated against JSON Schema
- **Soft Delete**: Automatic exclusion of deleted records
- **Observer Pipeline**: Universal security, validation, and audit

### Performance Optimizations

- **Schema Caching**: 15x performance improvement with compiled validators
- **Batch Operations**: Efficient bulk create/update/delete operations
- **Observer Pipeline**: Single-pass execution with preloaded data
- **Connection Pooling**: Per-tenant database connection management
- **Parameterized Queries**: Optimized SQL with PostgreSQL parameter placeholders

---

This API documentation provides comprehensive coverage of all endpoints and patterns. For detailed examples of specific features, see:
- [FTP.md](FTP.md) - FTP Middleware filesystem-like interface
- [FILTER.md](FILTER.md) - Advanced filtering and query capabilities
- [OBSERVERS.md](OBSERVERS.md) - Observer system integration
- [TESTING.md](TESTING.md) - API endpoint testing strategies