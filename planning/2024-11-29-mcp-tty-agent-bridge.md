# MCP-TTY Agent Bridge

**Date**: 2024-11-29
**Status**: Approved for implementation

## Problem

The MCP server (port 3001) provides JSON-RPC access for external AIs (Claude Desktop, GPT, etc.) but only exposes HTTP API access via `MonkAuth` and `MonkHttp` tools. The TTY agent has full shell capabilities and AI-assisted execution that aren't available to external callers.

**Goal**: Allow external AIs to delegate tasks to the internal TTY agent, with results flowing back through MCP.

## Current Architecture

### MCP Server (`src/servers/mcp.ts`)
- JSON-RPC 2.0 interface on port 3001
- Tools: `MonkAuth` (login/register), `MonkHttp` (HTTP API proxy)
- Session management: JWT token + tenant stored per session
- Calls HTTP API directly via `honoApp.fetch()`

### TTY System (`src/lib/tty/`)
- Full shell with 80+ commands (`select`, `insert`, `describe`, etc.)
- AI agent with tools (`run_command`, `read_file`, `write_file`)
- Session state: `systemInit` (from login), `cwd`, `env`, `mounts`
- Direct database access via virtual filesystem

### Credential Sharing

Both systems use `login()` from `src/lib/auth.ts` which returns `SystemInit`:

```typescript
interface SystemInit {
    dbType, dbName, nsName,  // Database routing
    userId, username, access, tenant,  // User context
    accessRead/Edit/Full,    // ACL
}
```

MCP already has JWT per session - can derive `SystemInit` via `systemInitFromJWT()`.

## Design Decision

**Security Concern**: Raw shell access is too permissive. External callers should not have direct `shell` command execution.

**Solution**: All external access goes through the AI agent as a gatekeeper. The AI:
1. Interprets natural language intent
2. Decides if/how to execute operations
3. Uses internal tools (`run_command`, `read_file`, `write_file`)
4. Returns summarized results

No raw shell bypass exposed externally.

## Approved Design

### MCP Tool

```typescript
{
    name: 'MonkAgent',
    description: 'Invoke AI agent to perform tasks. The agent interprets your request and executes appropriate commands.',
    inputSchema: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: 'Natural language request for the AI agent'
            }
        },
        required: ['prompt']
    }
}
```

### HTTP Endpoint

```
POST /api/agent/ai
Authorization: Bearer <jwt>
Content-Type: application/json

{ "prompt": "what records have changed in the last day" }
```

### CLI Usage (monk-cli)

```bash
monk ai "what records have changed in the last day"
monk ai "count users by access level"
monk ai "show me the schema for the orders table"
```

### Flow

```
External AI ──► MCP: MonkAgent ──┐
                                 ├──► TTY AI Agent ──► Internal Tools ──► Response
CLI ──► HTTP: /api/agent/ai ────┘
```

## Implementation Plan

### 1. Headless Session Factory
**File**: `src/lib/tty/headless.ts`

Create TTY session without terminal stream:
- `createHeadlessSession(systemInit)` - Initialize session from SystemInit
- Returns session ready for `handleAIMessage()`

### 2. HTTP Endpoint
**File**: `src/routes/api/agent/ai.ts`

```typescript
POST /api/agent/ai
- Extract SystemInit from JWT
- Create/reuse headless session
- Call shared AI handler
- Return response as JSON
```

### 3. MCP Tool
**File**: `src/servers/mcp.ts`

Add `MonkAgent` tool:
- Requires authentication (session must have token)
- Creates headless session from JWT
- Calls shared AI handler
- Returns response in MCP format

### 4. Shared AI Handler
**File**: `src/lib/tty/headless.ts` or extend `ai-mode.ts`

Core function both routes call:
```typescript
async function executeAgentPrompt(
    systemInit: SystemInit,
    prompt: string,
    options?: { sessionId?: string }
): Promise<AgentResponse>
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/lib/tty/headless.ts` | Create - headless session + shared handler |
| `src/routes/api/agent/ai.ts` | Create - HTTP endpoint |
| `src/routes/api/agent/index.ts` | Create - route registration |
| `src/servers/mcp.ts` | Modify - add MonkAgent tool |
| `src/servers/http.ts` | Modify - register agent routes |

## Response Format

```typescript
interface AgentResponse {
    success: boolean;
    response: string;        // AI's text response
    toolCalls?: {            // Tools the AI used
        name: string;
        input: any;
        output: string;
    }[];
    error?: string;
}
```

## Security Considerations

1. **AI as Gatekeeper**: All operations filtered through AI interpretation
2. **JWT Required**: Both MCP and HTTP require authentication
3. **ACL Enforced**: SystemInit carries access levels, enforced by database layer
4. **No Shell Bypass**: External callers cannot execute arbitrary commands
5. **Audit Trail**: AI tool usage logged (existing mechanism)
