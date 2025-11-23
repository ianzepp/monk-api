# Monk API MCP Tools

Model Context Protocol (MCP) server for the Monk API, optimized for Claude Code integration.

## Overview

This MCP server provides **4 focused tools** that solve the core problem: **JWT token management** and **LLM-optimized data transfer**. Everything else is accessible through these primitives.

### Design Philosophy

1. **JWT caching**: Authenticate once, token persists for the session
2. **TOON format**: 40% token reduction, higher parsing accuracy for LLMs
3. **Minimal permissions**: 4 tools instead of 30+ (better UX)
4. **Maximum flexibility**: Direct API access via MonkHttp escape hatch

## The 4 Tools

### 1. MonkAuth - Authentication & Session Management

**Purpose:** Create/authenticate tenants, cache JWT token, set response format preference.

**Actions:**
- `register` - Create new tenant and get JWT
- `login` - Authenticate to existing tenant
- `refresh` - Renew JWT before expiration
- `status` - Check current auth state

**Format Preference:**
- `toon` (default) - 40% fewer tokens, better LLM parsing
- `yaml` - Human-readable, less verbose than JSON
- `json` - Standard format

**Example:**
```typescript
// Register new tenant with TOON format
MonkAuth({
  action: 'register',
  tenant: 'acme-corp',
  format: 'toon'  // Optional, defaults to 'toon'
})

// Login to existing tenant
MonkAuth({
  action: 'login',
  tenant: 'acme-corp',
  password: 'secret123'
})

// Check auth status
MonkAuth({ action: 'status' })
```

### 2. MonkHttp - Raw API Access

**Purpose:** Low-level HTTP access to any Monk API endpoint. The escape hatch.

**Features:**
- Auto-injects JWT token (if authenticated)
- Auto-sets Accept header based on format preference
- Supports query parameters
- Handles any request body type (object or array)

**Example:**
```typescript
// GET request with query params
MonkHttp({
  method: 'GET',
  path: '/api/model',
  query: { limit: '10' }
})

// POST request with array body (bulk insert)
MonkHttp({
  method: 'POST',
  path: '/api/data/users',
  body: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' }
  ]
})

// Advanced query
MonkHttp({
  method: 'POST',
  path: '/api/find/orders',
  body: {
    where: { status: 'pending', total: { $gte: 100 } },
    order: ['created_at desc'],
    limit: 50
  }
})
```

### 3. MonkData - High-Level Data Operations

**Purpose:** Semantic wrappers around common CRUD patterns, mirroring `src/lib/database.ts` methods.

**Operations:**
- `selectAny` - Flexible query with filters
- `selectOne` - Single record or null
- `select404` - Single record or throw error
- `createAll` - Bulk insert (array of records)
- `updateAll` - Bulk update (array with id + changes)
- `deleteAll` - Bulk soft-delete (array of {id})
- `count` - Count records with filters
- `aggregate` - Analytics with GROUP BY

**Example:**
```typescript
// Query users with filters
MonkData({
  operation: 'selectAny',
  model: 'users',
  params: {
    where: { active: true, age: { $gte: 18 } },
    order: ['name asc'],
    limit: 100
  }
})

// Bulk insert
MonkData({
  operation: 'createAll',
  model: 'products',
  params: [
    { name: 'Widget', price: 19.99, sku: 'WDG-001' },
    { name: 'Gadget', price: 29.99, sku: 'GDG-002' }
  ]
})

// Aggregate analytics
MonkData({
  operation: 'aggregate',
  model: 'sales',
  params: {
    where: { date: { $gte: '2025-01-01' } },
    aggregate: {
      total_sales: { $sum: 'amount' },
      avg_sale: { $avg: 'amount' },
      order_count: { $count: '*' }
    },
    groupBy: ['region']
  }
})
```

### 4. MonkDescribe - Model Management

**Purpose:** Create, read, update, delete models and fields.

**Operations:**
- `list` - List all models
- `get` - Get model metadata
- `create` - Create new model
- `update` - Update model metadata
- `delete` - Drop model
- `addField` - Add field to model
- `updateField` - Modify field definition
- `deleteField` - Remove field

**Example:**
```typescript
// List all models
MonkDescribe({ operation: 'list' })

// Get model details
MonkDescribe({
  operation: 'get',
  model: 'users'
})

// Create new model
MonkDescribe({
  operation: 'create',
  model: 'products',
  params: {
    description: 'Product catalog'
  }
})

// Add field
MonkDescribe({
  operation: 'addField',
  model: 'products',
  params: {
    field_name: 'price',
    type: 'decimal',
    required: true,
    description: 'Product price in USD'
  }
})
```

## Architecture

```
┌─────────────────────────────────────┐
│  Claude Code (MCP Client)           │
└─────────────┬───────────────────────┘
              │ JSON-RPC
┌─────────────▼───────────────────────┐
│  MCP Server (4 Tools)                │
│  - MonkAuth  (auth + JWT cache)     │
│  - MonkHttp  (raw HTTP)              │
│  - MonkData  (CRUD operations)       │
│  - MonkDescribe (model mgmt)        │
└─────────────┬───────────────────────┘
              │ HTTP + JWT
              │ Accept: application/toon
┌─────────────▼───────────────────────┐
│  Monk API (REST)                     │
│  - Returns TOON/YAML/JSON            │
│  - Format saved in JWT               │
└─────────────────────────────────────┘
```

## TOON Format Benefits

**What is TOON?**
- Token-Oriented Object Notation
- Designed specifically for LLM input
- Tabular format for arrays of objects
- Explicit length/field declarations

**Benefits:**
- **40% fewer tokens** than JSON
- **73.9% parsing accuracy** vs 69.7% for JSON
- **Faster responses** (less data transfer)
- **Lower costs** (fewer tokens = cheaper API calls)

**Example:**

JSON (verbose):
```json
{
  "users": [
    {"id": "1", "name": "Alice", "age": 30, "active": true},
    {"id": "2", "name": "Bob", "age": 25, "active": false},
    {"id": "3", "name": "Charlie", "age": 35, "active": true}
  ]
}
```

TOON (compact):
```
users[3]{id,name,age,active}:
  1,Alice,30,true
  2,Bob,25,false
  3,Charlie,35,true
```

## Configuration

**`.mcp.json`:**
```json
{
  "mcpServers": {
    "monk-api": {
      "command": "npm",
      "args": ["run", "mcp:server"],
      "env": {
        "TEST_API_URL": "http://localhost:9001"
      }
    }
  }
}
```

## Usage Workflow

1. **Start Monk API server:**
   ```bash
   npm start
   ```

2. **Start Claude Code** (MCP server auto-starts)

3. **Authenticate:**
   ```typescript
   MonkAuth({
     action: 'register',
     tenant: 'my-app',
     format: 'toon'  // Set format preference
   })
   // Token cached, subsequent calls auto-authenticated
   ```

4. **Use the API:**
   ```typescript
   // High-level: Use MonkData/MonkDescribe
   MonkData({ operation: 'selectAny', model: 'users' })

   // Low-level: Use MonkHttp for anything else
   MonkHttp({ method: 'GET', path: '/api/model' })
   ```

## Token Caching

**How it works:**
- JWT token stored in memory after first auth
- Token automatically injected into all subsequent requests
- Format preference (toon/yaml/json) saved in JWT
- Persists for entire Claude Code session
- Lost when Claude Code exits (re-auth next session)

**Status check:**
```typescript
MonkAuth({ action: 'status' })
// Returns: { authenticated: true, tenant: 'my-app', format: 'toon' }
```

## When to Use Each Tool

| Tool | Use Case |
|------|----------|
| **MonkAuth** | First action in session, format preference |
| **MonkData** | Common CRUD (select, create, update, delete, aggregate) |
| **MonkDescribe** | Model operations (introspection, DDL) |
| **MonkHttp** | Everything else (custom endpoints, one-off operations) |

## Development

**Run server directly:**
```bash
npm run mcp:server
```

**Test with MCP Inspector:**
```bash
npx @modelcontextprotocol/inspector npm run mcp:server
```

**Add new operation to MonkData/MonkDescribe:**
1. Add case to switch statement in `monk-api-tools.ts`
2. Add to enum in tool JSON file
3. Restart MCP server

## Migration from Previous Version

**Old (11 tools):**
- MonkAuthRegister, MonkAuthLogin → **MonkAuth**
- MonkApiData → **MonkData** (operation-based)
- MonkApiDescribe → **MonkDescribe** (operation-based)
- MonkApiFind, MonkApiAggregate → **MonkData** or **MonkHttp**
- MonkApiStat, MonkApiHistory, MonkDocs → **MonkHttp**

**Benefits:**
- 4 tools vs 11 (fewer permission prompts)
- TOON format support (40% token savings)
- Clearer operation semantics
- Better alignment with database.ts methods

## Transport

**Current:** stdio (auto-starts with Claude Code)
- ✅ Fast, local, no port needed
- ✅ Auto-starts/stops with Claude Code
- ❌ Local only

**Future:** HTTP transport for remote access
- Update server to use `HttpServerTransport`
- Update `.mcp.json` to connect via URL

## Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [TOON Format](https://github.com/toon-format/toon)
- [Monk API Documentation](../README.md)
