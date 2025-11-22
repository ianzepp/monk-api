# Monk API MCP Tools

Custom MCP (Model Context Protocol) tools for interacting with the Monk API from Claude Code.

## Overview

This MCP server provides a clean, layered interface to the Monk API, replacing manual `curl` commands with semantic tool calls that handle authentication, headers, and URL construction automatically.

## Architecture

```
┌─────────────────────────────────────┐
│  Tool Layer (MCP)                   │
│  - MonkHttp                         │
│  - MonkAuth                         │
│  - MonkApiData                      │
│  - MonkApiDescribe                  │
│  - MonkDocs                         │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  Semantic Wrappers                  │
│  - monkAuth()                       │
│  - monkApiData()                    │
│  - monkApiDescribe()                │
│  - monkDocs()                       │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  Core HTTP Layer                    │
│  - monkHttp()                       │
│  - JWT caching (in-memory)          │
└─────────────────────────────────────┘
```

## Available Tools

### MonkAuthRegister
**[Convenience]** Register a new tenant and get JWT token.

**Parameters:**
- `tenant`: Tenant name (required)
- `template`: Template name (defaults to "system")
- `username`: Admin username (defaults to "root")
- `description`: Tenant description (optional)

**Example:**
```javascript
MonkAuthRegister({ tenant: 'my-tenant' })
```

### MonkAuthLogin
**[Convenience]** Login to existing tenant and get JWT token.

**Parameters:**
- `tenant`: Tenant name (required)
- `password`: Password (required)
- `username`: Username (defaults to "root")

**Example:**
```javascript
MonkAuthLogin({ tenant: 'my-tenant', password: 'secret' })
```

### MonkHttp
**[Low-level]** Make raw HTTP requests. Use for custom API calls not covered by other tools.

**Parameters:**
- `method`: HTTP method (GET, POST, PUT, DELETE, PATCH)
- `path`: API path (e.g., `/api/data/users`)
- `body`: Request body (optional)
- `requireAuth`: Include JWT token (default: true)

**Example:**
```javascript
MonkHttp('GET', '/api/data/users', null, true)
```

### MonkAuth
**[Generic]** Authentication operations. Use MonkAuthRegister/MonkAuthLogin for common use cases.

**Actions:**
- `register`: Create new tenant and get JWT
- `login`: Login to existing tenant
- `refresh`: Refresh JWT token
- `status`: Get current auth status

**Parameters:**
- `action`: Auth action to perform
- `tenant`: Tenant name (for register/login)
- `template`: Template name (for register, defaults to "system")
- `username`: Username (defaults to "root")
- `password`: Password (for login)
- `description`: Tenant description (for register)

**Examples:**
```javascript
// Register new tenant
MonkAuth('register', { tenant: 'my-tenant' })

// Login
MonkAuth('login', { tenant: 'my-tenant', password: 'secret' })

// Check status
MonkAuth('status', {})
```

### MonkApiData
Generic CRUD operations on data schemas.

**Parameters:**
- `method`: HTTP method (GET, POST, PUT, DELETE)
- `schema`: Schema/table name
- `record_id`: Record ID (for single record operations)
- `data`: Record data (for POST/PUT)
- `options`: Query options (limit, offset)

**Examples:**
```javascript
// List all users
MonkApiData('GET', 'users', null, null, { limit: 10 })

// Get single user
MonkApiData('GET', 'users', '123')

// Create user
MonkApiData('POST', 'users', null, { name: 'John', email: 'john@example.com' })

// Update user
MonkApiData('PUT', 'users', '123', { name: 'Jane' })

// Delete user
MonkApiData('DELETE', 'users', '123')
```

### MonkApiDescribe
Get schema information.

**Parameters:**
- `schema`: Schema name (optional - omit to list all schemas)

**Examples:**
```javascript
// List all schemas
MonkApiDescribe()

// Get schema details
MonkApiDescribe('users')
```

### MonkDocs
Get API documentation.

**Parameters:**
- `endpoint`: Specific endpoint path (optional)

**Examples:**
```javascript
// Get all docs
MonkDocs()

// Get specific endpoint docs
MonkDocs('/api/data')
```

### MonkApiFind
**[Advanced]** Execute complex search queries with filtering, sorting, and pagination.

**Parameters:**
- `schema`: Schema/table name
- `query`: Query specification
  - `select`: Column names to return (optional)
  - `where`: Filter conditions (optional)
  - `order`: Sort order array (optional)
  - `limit`: Max records (optional)
  - `offset`: Pagination offset (optional)

**Examples:**
```javascript
// Find users created in last 30 days, sorted by name
MonkApiFind('users', {
  where: { created_at: { $gte: '2025-01-01' } },
  order: ['name asc'],
  limit: 50
})

// Select specific columns
MonkApiFind('users', {
  select: ['id', 'name', 'email'],
  where: { status: 'active' }
})
```

### MonkApiAggregate
**[Analytics]** Perform aggregation queries with GROUP BY support.

**Parameters:**
- `schema`: Schema/table name
- `query`: Aggregation specification
  - `where`: Filter conditions (optional)
  - `aggregate`: Aggregation functions (required)
  - `groupBy`: Group by columns (optional)

**Aggregation Functions:**
- `$count`: Count records
- `$sum`: Sum values
- `$avg`: Average
- `$min`: Minimum
- `$max`: Maximum
- `$distinct`: Count unique values

**Examples:**
```javascript
// Simple count
MonkApiAggregate('orders', {
  aggregate: { total: { $count: '*' } }
})

// Multiple aggregations with grouping
MonkApiAggregate('orders', {
  where: { status: 'paid' },
  aggregate: {
    order_count: { $count: '*' },
    total_revenue: { $sum: 'amount' },
    avg_amount: { $avg: 'amount' }
  },
  groupBy: ['country', 'status']
})
```

### MonkApiStat
**[Metadata]** Get record metadata without fetching full record data.

**Parameters:**
- `schema`: Schema/table name
- `record_id`: Record ID

**Returns:**
- `id`: Record identifier
- `created_at`: Creation timestamp
- `updated_at`: Last modification timestamp
- `trashed_at`: Soft delete timestamp (null if active)
- `etag`: Entity tag for caching
- `size`: Record size in bytes

**Examples:**
```javascript
// Check if record exists and get metadata
MonkApiStat('users', 'user-123')

// Check if record was soft-deleted
MonkApiStat('users', 'user-456')
```

### MonkApiHistory
**[Audit Trail]** Access audit trails for tracked column changes.

**Parameters:**
- `schema`: Schema/table name
- `record_id`: Record ID
- `change_id`: Specific change ID (optional)
- `options`: Pagination options (optional)
  - `limit`: Max entries to return
  - `offset`: Entries to skip

**Examples:**
```javascript
// Get all history for a record
MonkApiHistory('account', 'acc-123')

// Get paginated history
MonkApiHistory('account', 'acc-123', null, { limit: 10, offset: 0 })

// Get specific change
MonkApiHistory('account', 'acc-123', 'change-456')
```

## Configuration

The MCP server is configured in `.mcp.json`:

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

## Usage in Claude Code

1. Start the Monk API server: `npm start`
2. Start Claude Code (MCP server starts automatically)
3. Authenticate: Use `MonkAuth` to register or login
4. Make API calls: Use other tools as needed

**JWT Token Caching:**
- Token is cached in memory for the Claude Code session
- Survives across multiple tool calls
- Lost when Claude Code exits (need to re-authenticate next session)

## Adding New Tools

To add semantic layers (e.g., `MonkApiDataDelete`):

1. Create helper function:
```typescript
async function monkApiDataDelete(schema: string, recordId: string): Promise<any> {
  return monkApiData('DELETE', schema, recordId);
}
```

2. Add tool definition in `ListToolsRequestSchema`
3. Add case in `CallToolRequestSchema` handler

## Development

**Run server directly:**
```bash
npm run mcp:server
```

**Test with curl:**
```bash
# Server runs on stdio, so you'll need to send JSON-RPC messages
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp:server
```

## Transport

Currently uses **stdio transport** (communicates via stdin/stdout):
- ✅ Fast, local, no port needed
- ✅ Auto-starts/stops with Claude Code
- ❌ Local only (can't share across machines)

To switch to HTTP transport, update the server to use `HttpServerTransport` and update `.mcp.json` to connect via URL instead of command.
