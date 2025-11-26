# MCP (Model Context Protocol) App

JSON-RPC endpoint for MCP protocol, enabling LLM agents to interact with the Monk API.

## Endpoint

```
POST /app/mcp
```

## Headers

- `Content-Type: application/json`
- `mcp-session-id: <session-id>` (optional, defaults to "default")

## Protocol

Uses JSON-RPC 2.0 protocol. See [MCP Specification](https://modelcontextprotocol.io/).

## Methods

### initialize

Initialize an MCP session.

```json
{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05"}, "id": 1}
```

### tools/list

List available tools.

```json
{"jsonrpc": "2.0", "method": "tools/list", "id": 2}
```

### tools/call

Call a tool.

```json
{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "MonkAuth", "arguments": {"action": "status"}}, "id": 3}
```

## Available Tools

### MonkAuth

Authentication for Monk API.

**Actions:**
- `register` - Create new tenant
- `login` - Authenticate with tenant/username
- `refresh` - Renew token
- `status` - Check auth state

### MonkHttp

HTTP requests to Monk API with automatic JWT injection.

**Parameters:**
- `method` - HTTP method (GET, POST, PUT, DELETE, PATCH)
- `path` - API path (e.g., `/api/data/users`)
- `query` - URL query parameters (optional)
- `body` - Request body (optional)
- `requireAuth` - Include JWT token (default: true)

## Example Session

```bash
# Initialize
curl -X POST http://localhost:9001/app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

# List tools
curl -X POST http://localhost:9001/app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'

# Login
curl -X POST http://localhost:9001/app/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: my-session" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"MonkAuth","arguments":{"action":"login","tenant":"my-tenant","username":"root"}},"id":3}'
```
