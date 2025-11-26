# App Packages Architecture

## Problem Statement

As the Monk API grows, the boundary between "core API" and "application logic" has blurred. Features like grids, extracts, and restores are applications built on top of the API, not fundamental API operations. This creates issues:

1. **Dependency bloat**: Core `package.json` includes deps like `archiver` and `unzipper` that only matter for specific features
2. **Scope creep**: Every new feature adds to the core API surface
3. **Client overhead**: Clients install everything even if they only need a subset
4. **Maintenance burden**: Changes to app-specific code risk breaking core API
5. **Interface drift**: External bindings package (`monk-api-bindings-ts`) can drift from actual API

## Proposed Solution

Extract application-level features into separate `@monk-api/*` packages that:

- Are optionally installed per client need
- Communicate with core API via HTTP-style client (not internal System coupling)
- Own their own dependencies
- Can be developed/versioned independently

Move the TypeScript bindings into `@monk-api/bindings-ts` as a subpackage to:

- Keep bindings in sync with API changes (same repo, same PR)
- Allow external consumers to install just the bindings without the server
- Provide typed SDK for cli, uix, and third-party integrations

## Repository Structure

All packages live under `ianzepp/monk-api` as a monorepo:

```
monk-api/
  package.json              # Root: monk-api server
  src/                      # Server source code

  packages/
    bindings-ts/            # @monk-api/bindings-ts - TypeScript SDK
    formatter-*/            # @monk-api/formatter-* - Response formatters (see below)
    grids/                  # @monk-api/grids - Optional application
    extracts/               # @monk-api/extracts - Optional application
    restores/               # @monk-api/restores - Optional application
```

Related but separate repositories:
- `ianzepp/monk-cli` - Command-line interface (uses @monk-api/bindings-ts)
- `ianzepp/monk-uix` - Web UI (uses @monk-api/bindings-ts)

## Architecture

### Core API Scope (monk-api)

The core API handles foundational operations only:

- **Auth**: JWT validation, permissions, ACL enforcement
- **Data API**: CRUD, queries, bulk operations, find/aggregate
- **Middleware**: System context, transactions, request/response pipeline
- **Describe**: Model metadata and schema introspection
- **History**: Audit trail
- **Stat**: Analytics and metrics
- **Formatters**: Request/response encoding (JSON, YAML, TOML, etc.)
- **Bindings**: TypeScript SDK for external consumers

### App Package Scope (@monk-api/*)

Application features that build on core API (mounted under `/app/*` routes):

| Package | Route | Purpose | Dependencies |
|---------|-------|---------|--------------|
| `@monk-api/grids` | `/app/grids/*` | Excel-like spreadsheet cells | (none) |
| `@monk-api/extracts` | `/app/extracts/*` | Data export/backup archives | `archiver` |
| `@monk-api/restores` | `/app/restores/*` | Data import from archives | `unzipper` |
| `@monk-api/mcp` | `/app/mcp/*` | Model Context Protocol integration | (none) |
| `@monk-api/openapi` | `/openapi.json` | OpenAPI spec generation | (none) |
| `@monk-api/comments` | `/app/comments/*` | Threaded comments on any record | (none) |
| `@monk-api/notifications` | `/app/notifications/*` | Outbound notifications (email, SMS, etc.) | (none) |
| `@monk-api/reports` | `/app/reports/*` | PDF/document generation | TBD |
| `@monk-api/workflows` | `/app/workflows/*` | State machine / automation | TBD |

### Package Structure

```
packages/
  bindings-ts/              # @monk-api/bindings-ts
    package.json            # deps: axios
    tsconfig.json
    src/
      index.ts              # Main exports
      client.ts             # HTTP client with token management
      api/
        auth.ts             # Login, register, token refresh
        data.ts             # CRUD operations
        find.ts             # Query operations
        file.ts             # File upload/download
        aggregate.ts        # Aggregation queries
      types/
        common.ts           # ApiResponse, MonkClientConfig
        auth.ts             # AuthResponse, JwtPayload
        data.ts             # DataRecord, SelectParams
        find.ts             # FindQuery, FindResponse
        file.ts             # FileUpload, FileDownload
        aggregate.ts        # AggregateQuery, AggregateResult

  formatter-*/              # Existing formatters

  grids/
    package.json            # name: @monk-api/grids
    tsconfig.json
    src/
      index.ts              # exports createApp(client: MonkClient)
      range-parser.ts       # Grid-specific logic
      routes/
        range-get.ts
        range-put.ts
        range-delete.ts
        cells-post.ts

  extracts/
    package.json            # name: @monk-api/extracts, deps: archiver
    src/
      index.ts
      routes/
        execute.ts
        cancel.ts
        download.ts

  restores/
    package.json            # name: @monk-api/restores, deps: unzipper
    src/
      index.ts
      routes/
        import.ts
        execute.ts
        cancel.ts

  mcp/
    package.json            # name: @monk-api/mcp
    src/
      index.ts              # exports createApp(client: MonkClient)
      tools.ts              # MCP tool definitions
      resources.ts          # MCP resource definitions

  openapi/
    package.json            # name: @monk-api/openapi
    src/
      index.ts              # exports createApp(client: MonkClient)
      generator.ts          # Generate spec from model/field metadata
      merger.ts             # Merge model specs into root spec

  comments/
    package.json            # name: @monk-api/comments
    src/
      index.ts              # exports createApp(client: MonkClient)
      routes/
        list.ts             # GET /app/comments?target_model=X&target_id=Y
        create.ts           # POST /app/comments
        thread.ts           # GET /app/comments/:id/thread

  notifications/
    package.json            # name: @monk-api/notifications
    src/
      index.ts              # exports createApp(client: MonkClient)
      routes/
        list.ts             # GET /app/notifications
        retry.ts            # POST /app/notifications/:id/retry
      observers/
        all/
          7/
            evaluate-rules.ts   # Sync: evaluate rules, create pending notifications
        notifications/
          8/
            send-pending.ts     # Async: send pending, update status
      channels/
        email.ts
        sms.ts
        slack.ts
        webhook.ts
```

## Comments Package (@monk-api/comments)

### Purpose

The comments package provides persistent, threaded comments attached to any record. It serves as the persistence layer for monk-irc, enabling:

- Persistent conversation history (survives server restarts)
- LLM context building (conversation = recent comments)
- Audit trail of human + agent interactions
- Async collaboration (comments exist independent of IRC connections)

### Architecture

```
IRC Message → monk-irc → @monk-api/comments (persist) → monk-api
                ↓
         Broadcast to channel
                ↓
         LLM agents listening
                ↓
         Agent response → comments → IRC broadcast
```

**monk-irc becomes a view layer** over the comments data:

- `JOIN #users` → Load recent comments where `target_model=users, target_id=null`
- `JOIN #users/abc-123` → Load comments where `target_model=users, target_id=abc-123`
- `PRIVMSG #users :message` → Create comment, broadcast to channel members
- Server restart → Channels reconstruct from comments

### Data Model

```
comments:
  - id: uuid
  - target_model: string      # "users", "orders", "models", etc.
  - target_id: uuid | null    # Specific record, or null for schema-level
  - parent_id: uuid | null    # Threading (reply to another comment)
  - body: text
  - author_type: "user" | "agent"
  - author_id: uuid           # User ID or agent ID
  - author_name: string       # Display name (IRC nick)
  - tenant: string
  - created_at: timestamp
```

### LLM Context Building

When an LLM agent needs to respond to a message, it fetches recent conversation history:

```
GET /app/comments?target_model=users&target_id=abc-123&limit=50&order=desc
```

This returns the conversation context window for the agent to understand the discussion and formulate a response.

### IRC Integration

monk-irc uses comments as its persistence backend:

```typescript
// On PRIVMSG
async function handlePrivmsg(channel: string, message: string, connection: IrcConnection) {
    const { model, recordId } = parseChannel(channel);  // #users/abc-123

    // Persist to comments
    await client.post('/app/comments', {
        target_model: model,
        target_id: recordId,
        body: message,
        author_type: 'user',
        author_id: connection.userId,
        author_name: connection.nickname,
        tenant: connection.tenant
    });

    // Broadcast to channel members (existing behavior)
    broadcastToChannel(channel, message, connection);
}

// On JOIN - load history
async function handleJoin(channel: string, connection: IrcConnection) {
    const { model, recordId } = parseChannel(channel);

    // Fetch recent comments as channel history
    const history = await client.get('/app/comments', {
        target_model: model,
        target_id: recordId,
        tenant: connection.tenant,
        limit: 50,
        order: 'asc'
    });

    // Send history to joining user
    for (const comment of history.data) {
        sendToConnection(connection, formatAsIrcMessage(comment));
    }
}
```

### Benefits

- **Persistence**: Server restarts don't lose conversation context
- **Stateless agents**: LLMs fetch context from comments, no local state needed
- **Audit trail**: Complete history of human + agent interactions
- **Multi-protocol**: Same data accessible via IRC, HTTP API, or MCP
- **Tenant isolation**: Comments scoped by tenant like all other data

## Notifications Package (@monk-api/notifications)

### Purpose

The notifications package provides outbound notifications (email, SMS, Slack, webhooks) triggered by record changes. Notifications are records themselves, enabling durability, retry, and audit.

### Architecture

```
Record change (e.g., comment created)
      ↓
Sync observer (ring 7): evaluate rules → create notification record (status: pending)
      ↓
Transaction commits
      ↓
Async observer (ring 8): pick up pending notification → send → update status
```

### Data Model

```
notifications:
  - id: uuid
  - channel: "email" | "sms" | "slack" | "webhook"
  - recipient: string         # Email, phone, webhook URL, etc.
  - subject: string | null
  - body: text
  - status: "pending" | "sent" | "failed"
  - attempts: integer
  - last_error: text | null
  - sent_at: timestamp | null
  - created_at: timestamp

notification_rules:
  - id: uuid
  - trigger_model: string     # "comments", "orders", etc.
  - trigger_operation: "create" | "update" | "delete"
  - condition: json | null    # Optional filter (e.g., {"author_type": "agent"})
  - channel: "email" | "sms" | "slack" | "webhook"
  - recipient_template: string  # "{{record.created_by.email}}" or static value
  - subject_template: string | null
  - body_template: text
  - enabled: boolean
```

### Observer Flow

**Ring 7 (sync, after-commit):**
```typescript
// observers/all/7/evaluate-rules.ts
export default class EvaluateNotificationRules extends BaseObserver {
    readonly ring = 7;
    readonly priority = 80;  // Run after most other observers

    async execute(context: ObserverContext): Promise<void> {
        const rules = await this.getMatchingRules(context);

        for (const rule of rules) {
            if (this.evaluateCondition(rule.condition, context.record)) {
                await context.client.post('/api/data/notifications', {
                    channel: rule.channel,
                    recipient: this.renderTemplate(rule.recipient_template, context),
                    subject: this.renderTemplate(rule.subject_template, context),
                    body: this.renderTemplate(rule.body_template, context),
                    status: 'pending',
                    attempts: 0
                });
            }
        }
    }
}
```

**Ring 8 (async):**
```typescript
// observers/notifications/8/send-pending.ts
export default class SendPendingNotifications extends BaseObserver {
    readonly ring = 8;
    readonly priority = 50;
    readonly operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const notification = context.record;
        if (notification.get('status') !== 'pending') return;

        const channel = notification.get('channel');
        const sender = this.getSender(channel);  // email.ts, sms.ts, etc.

        try {
            await sender.send(notification);
            await context.client.put(`/api/data/notifications/${notification.id}`, {
                status: 'sent',
                sent_at: new Date().toISOString()
            });
        } catch (error) {
            await context.client.put(`/api/data/notifications/${notification.id}`, {
                status: 'failed',
                attempts: notification.get('attempts') + 1,
                last_error: error.message
            });
        }
    }
}
```

### Benefits

- **Durability**: Notification record exists even if send fails
- **Retry**: Query `status=failed`, POST `/app/notifications/:id/retry`
- **Audit**: Complete history of what was sent, when, to whom
- **Decoupling**: Transaction completes fast, external calls happen async
- **Extensible**: Add new channels by implementing a sender interface

### Channels

Each channel implements a common interface:

```typescript
interface NotificationChannel {
    send(notification: NotificationRecord): Promise<void>;
}
```

Built-in channels:
- `email.ts` - SMTP or provider API (SendGrid, SES, etc.)
- `sms.ts` - Twilio, etc.
- `slack.ts` - Slack webhooks
- `webhook.ts` - Generic HTTP POST

## OpenAPI Package (@monk-api/openapi)

### Architecture

The OpenAPI package generates and caches OpenAPI 3.x specs reactively, storing them as data in an `openapi` model.

**Data Model:**
```
openapi:
  - id: uuid
  - model_name: string    # "users", "orders", or "__root__" for merged spec
  - spec: json            # OpenAPI spec fragment or full spec
  - generated_at: timestamp
```

**Generation Flow:**
```
Model/Field change event
         │
         ▼
┌─────────────────────────────────┐
│ Regenerate model-specific spec  │
│ → openapi record for "users"    │
│ → openapi record for "orders"   │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Rebuild tenant __root__ spec    │
│ (merge all model specs)         │
└─────────────────────────────────┘
```

**Triggers:**
- Model created/updated/deleted → regenerate that model's spec entry
- Field created/updated/deleted → regenerate parent model's spec entry
- After any model spec changes → rebuild `__root__` merged spec

**Response:**
```
GET /openapi.json
  → Return spec from openapi record where model_name = "__root__"
  → Pre-cached, no runtime computation
```

**Per-Model Spec Generation:**

Each model gets standard CRUD paths generated:
- `GET /api/data/{model}` - List/query records
- `POST /api/data/{model}` - Create record
- `GET /api/data/{model}/{id}` - Get single record
- `PUT /api/data/{model}/{id}` - Update record
- `DELETE /api/data/{model}/{id}` - Delete record

Field metadata (type, required, constraints) maps to JSON Schema for request/response bodies.

**Benefits:**
- Spec always reflects current schema state
- Fast response (cached record lookup)
- Only regenerates what changed
- Versioning via history model
- Per-tenant isolation automatic

## App Package Observers

App packages can register observers that integrate into the core observer pipeline. Observers follow the same file-based structure as core observers.

### Observer File Structure

App packages place observers under `src/observers/` following the same pattern as core:

```
packages/openapi/
  src/
    observers/
      models/
        7/                          # Ring 7 (after-commit)
          regenerate-spec.ts        # Regenerate model spec on model change
      fields/
        7/
          regenerate-spec.ts        # Regenerate model spec on field change
```

Path pattern: `src/observers/:model/:ring_number/file-name.ts`

### Observer Implementation

Each observer extends `BaseObserver` and declares its ring, priority, and operations:

```typescript
// packages/openapi/src/observers/models/7/regenerate-spec.ts
import { BaseObserver } from '@monk-api/core';  // or shared types
import type { ObserverContext } from '@monk-api/core';

export default class RegenerateSpecObserver extends BaseObserver {
    readonly ring = 7;              // Must match directory
    readonly priority = 50;         // Order within ring (lower = first)
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const modelName = context.record.get('model_name');
        // Regenerate OpenAPI spec for this model...
    }
}
```

### Loader Integration

The `ObserverLoader` is extended to scan app packages after loading core observers:

```typescript
// src/lib/observers/loader.ts (extended)

static async preloadObservers(): Promise<void> {
    // 1. Load core observers from src/observers/
    await this._loadCoreObservers();

    // 2. Load app package observers
    for (const name of installedApps) {
        const packagePath = `node_modules/@monk-api/${name}/dist/observers`;
        const files = await glob(`${packagePath}/**/*.js`);

        for (const file of files) {
            const pattern = this._parseObserverFilePath(file, packagePath);
            if (pattern) {
                await this._loadObserverFile(pattern);
            }
        }
    }
}
```

### Cache Merging

App observers merge into the same `model:ring` cache as core observers:

```
Cache after loading:
  "models:7" → [CoreAuditObserver, RegenerateSpecObserver]
  "fields:7" → [CoreFieldObserver, RegenerateSpecObserver]
  "all:1"    → [ValidateRequiredObserver]
```

When `getObservers('models', 7)` is called, both core and app observers are returned, sorted by priority within the ring.

### Execution Order

1. Observers execute by ring (0-9)
2. Within a ring, observers execute by priority (lower first)
3. Core and app observers interleave based on priority
4. Each observer declares which operations it handles

Example execution for `models` update, ring 7:
```
1. CoreAuditObserver (priority: 30)
2. RegenerateSpecObserver (priority: 50)
3. NotificationObserver (priority: 80)
```

## Formatter Packages

Formatters handle content negotiation for request parsing and response formatting. They are bidirectional - supporting both import (request body parsing) and export (response formatting).

### Available Formatters

| Package | Content-Type | Import | Export | Dependencies |
|---------|--------------|--------|--------|--------------|
| `@monk-api/formatter-json` | `application/json` | ✓ | ✓ | (none) |
| `@monk-api/formatter-yaml` | `application/yaml` | ✓ | ✓ | `yaml` |
| `@monk-api/formatter-toml` | `application/toml` | ✓ | ✓ | `smol-toml` |
| `@monk-api/formatter-csv` | `text/csv` | ✓ | ✓ | (none) |
| `@monk-api/formatter-xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | ✓ | ✓ | `exceljs` |

### Bidirectional Content Negotiation

```
# Import: CSV → bulk create
POST /api/data/users
Content-Type: text/csv

name,email,status
Alice,alice@example.com,active
Bob,bob@example.com,pending

# Export: query → CSV
GET /api/data/users
Accept: text/csv

→ name,email,status
  Alice,alice@example.com,active
  Bob,bob@example.com,pending
```

### Excel Formatter (@monk-api/formatter-xlsx)

The xlsx formatter uses `exceljs` for bidirectional Excel support:

```typescript
// packages/formatter-xlsx/src/index.ts
import ExcelJS from 'exceljs';

export async function parse(buffer: Buffer): Promise<Record<string, any>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];

    const headers = sheet.getRow(1).values as string[];
    const rows: Record<string, any>[] = [];

    sheet.eachRow((row, index) => {
        if (index === 1) return; // skip header
        const obj: Record<string, any> = {};
        row.eachCell((cell, colNum) => {
            obj[headers[colNum]] = cell.value;
        });
        rows.push(obj);
    });

    return rows;
}

export async function format(data: Record<string, any>[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');

    if (data.length > 0) {
        sheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
        sheet.addRows(data);
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
}
```

### Import via Formatters

With bidirectional formatters, bulk import is just a POST with the appropriate Content-Type:

```
POST /api/data/users
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

<binary xlsx data>
```

No separate "import" app needed - formatters handle the wire format, core API handles the bulk operation.

## Bindings Package (@monk-api/bindings-ts)

### Purpose

The bindings package provides a TypeScript SDK for consuming the Monk API. It is used by:

- **monk-cli**: Command-line interface
- **monk-uix**: Web UI application
- **Third-party integrations**: Any external TypeScript/JavaScript consumer
- **App packages** (optional): Can use high-level API wrappers if desired

### Current Implementation

The bindings package (moving from `monk-api-bindings-ts`) provides:

```typescript
// Main entry point
import { MonkAPI, MonkClient } from '@monk-api/bindings-ts';

// Full SDK with all API modules
const api = new MonkAPI({ baseUrl: 'https://api.example.com' });

// Auth
await api.auth.login('user@example.com', 'password');
await api.auth.register('user@example.com', 'password');

// Data operations
const users = await api.data.selectAny('users', { limit: 10 });
const user = await api.data.selectOne('users', 'user-id');
await api.data.createOne('users', { name: 'John' });
await api.data.updateOne('users', 'user-id', { name: 'Jane' });
await api.data.deleteOne('users', 'user-id');

// Find/Query
const results = await api.find.find('users', {
    where: { active: true },
    order: [['created_at', 'desc']],
    limit: 100
});

// Aggregations
const stats = await api.aggregate.aggregate('orders', {
    group: ['status'],
    sum: ['total'],
    count: true
});

// Token management
api.setToken(jwt);
api.getToken();
api.clearToken();
```

### Low-Level Client

For app packages or custom use cases, the raw client is also available:

```typescript
import { MonkClient } from '@monk-api/bindings-ts';

const client = new MonkClient({ baseUrl: 'https://api.example.com' });
client.setToken(jwt);

// Raw HTTP methods
const response = await client.get('/api/data/users/123');
const created = await client.post('/api/data/users', { name: 'John' });
const updated = await client.put('/api/data/users/123', { name: 'Jane' });
const deleted = await client.delete('/api/data/users/123');
```

### Dependencies

- `axios` - HTTP client (only runtime dependency)

The bindings have zero dependencies on server code, making them safe to install independently.

## App Package Client Interface

App packages can use the bindings package or receive an injected client.

### Option 1: Use Bindings Directly

App packages can depend on `@monk-api/bindings-ts` and use the high-level API:

```typescript
// packages/grids/src/index.ts
import { Hono } from 'hono';
import { MonkAPI } from '@monk-api/bindings-ts';
import { parseRange, validateRangeBounds } from './range-parser.js';

export function createApp(api: MonkAPI): Hono {
    const app = new Hono();

    app.get('/:id/:range', async (c) => {
        const gridId = c.req.param('id');
        const rangeStr = c.req.param('range');

        // Use typed API methods
        const gridRes = await api.data.selectOne('grids', gridId);
        if (!gridRes.success) {
            return c.json(gridRes, 404);
        }

        const range = parseRange(rangeStr);
        validateRangeBounds(range, gridRes.data.row_max, gridRes.data.col_max);

        const cellsRes = await api.find.find('grid_cells', {
            where: { grid_id: gridId, ...rangeToWhere(range) },
            order: [['row', 'asc'], ['col', 'asc']]
        });

        return c.json({
            success: true,
            data: { grid_id: gridId, range: rangeStr, cells: cellsRes.data }
        });
    });

    return app;
}
```

### Option 2: Use Injected Low-Level Client

For simpler cases or to avoid the bindings dependency:

```typescript
// packages/grids/src/index.ts
import { Hono } from 'hono';
import type { MonkClient } from '@monk-api/bindings-ts';

export function createApp(client: MonkClient): Hono {
    const app = new Hono();

    app.get('/:id/:range', async (c) => {
        const gridId = c.req.param('id');
        const rangeStr = c.req.param('range');

        // Raw HTTP calls
        const gridRes = await client.get(`/api/data/grids/${gridId}`);
        if (!gridRes.success) {
            return c.json(gridRes, 404);
        }

        // ... rest of implementation
    });

    return app;
}
```

## Core API Integration

### In-Process Client Factory

The core API provides a client that routes requests internally (no network overhead).
This client implements the same interface as `MonkClient` from bindings:

```typescript
// src/lib/apps/in-process-client.ts
import type { Context } from 'hono';
import type { ApiResponse } from '@monk-api/bindings-ts';

export function createInProcessClient(context: Context, honoApp: Hono) {
    const authHeader = context.req.header('Authorization');

    async function request<T>(method: string, path: string, body?: any): Promise<ApiResponse<T>> {
        // Prevent apps from calling other apps (circular routing)
        if (path.startsWith('/app/')) {
            throw new Error('App packages cannot call /app/* routes');
        }

        const req = new Request(`http://internal${path}`, {
            method,
            headers: {
                'Authorization': authHeader || '',
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const res = await honoApp.fetch(req);
        return res.json();
    }

    return {
        get: <T>(url: string) => request<T>('GET', url),
        post: <T>(url: string, data?: any) => request<T>('POST', url, data),
        put: <T>(url: string, data?: any) => request<T>('PUT', url, data),
        delete: <T>(url: string) => request<T>('DELETE', url),
        request,  // Raw request for advanced use
        setToken: () => {},    // No-op: auth already in headers
        getToken: () => null,  // Not applicable in-process
        clearToken: () => {},  // No-op
    };
}
```

### Dynamic App Loading

Similar to formatter loading pattern:

```typescript
// src/lib/apps/loader.ts
import type { Hono } from 'hono';

type AppFactory = (client: any) => Hono;

const optionalApps = [
    'grids',
    'extracts',
    'restores',
    'mcp',
    'openapi',
    'comments',
    'notifications',
];

export const apps = new Map<string, AppFactory>();

// Load installed app packages at startup
for (const name of optionalApps) {
    try {
        const mod = await import(`@monk-api/${name}`);
        if (typeof mod.createApp === 'function') {
            apps.set(name, mod.createApp);
            console.info(`Loaded app package: @monk-api/${name}`);
        }
    } catch {
        // Package not installed - skip
    }
}

export function getInstalledApps(): string[] {
    return Array.from(apps.keys());
}
```

### Route Mounting

```typescript
// src/index.ts
import { apps } from '@src/lib/apps/loader.js';
import { createInProcessClient } from '@src/lib/apps/in-process-client.js';

// Mount discovered apps under /app/*
for (const [name, createApp] of apps) {
    app.all(`/app/${name}/*`, async (c) => {
        const client = createInProcessClient(c, app);
        const appInstance = createApp(client);

        // Rewrite path: /app/grids/123/A1:B10 -> /123/A1:B10
        const subPath = c.req.path.replace(`/app/${name}`, '') || '/';
        const url = new URL(c.req.url);
        url.pathname = subPath;

        const subReq = new Request(url.toString(), {
            method: c.req.method,
            headers: c.req.raw.headers,
            body: c.req.raw.body,
        });

        return appInstance.fetch(subReq);
    });
}
```

## Migration Path

### Phase 1: Move Bindings into monk-api

1. Copy `monk-api-bindings-ts/src/*` to `packages/bindings-ts/src/`
2. Update `package.json` name to `@monk-api/bindings-ts`
3. Add to workspace in root `package.json`
4. Update monk-cli and monk-uix to use `@monk-api/bindings-ts`
5. Archive or deprecate `monk-api-bindings-ts` repo

### Phase 2: Create App Infrastructure

1. Add `createInProcessClient` to `src/lib/apps/`
2. Add app loader similar to formatter loader
3. Add `/app/*` route mounting logic

### Phase 3: Extract Grids

1. Create `packages/grids/`
2. Move grid routes from `src/routes/api/grids/` to package
3. Refactor to use client instead of System
4. Update route from `/api/grids/*` to `/app/grids/*`
5. Add deprecation notice to old `/api/grids/*` routes (optional)

### Phase 4: Extract Extracts/Restores

1. Create `packages/extracts/` with `archiver` dep
2. Create `packages/restores/` with `unzipper` dep
3. Move route logic to packages
4. Remove `archiver`/`unzipper` from root `optionalDependencies`

### Phase 5: Extract MCP

1. Create `packages/mcp/`
2. Move MCP routes from `src/routes/mcp/` to package
3. Refactor to use in-process client for API calls
4. Update route from `/mcp/*` to `/app/mcp/*`

### Phase 6: Rename Scope (Optional)

If moving to `@monk-api` npm scope:

1. Register `@monk-api` scope on npmjs.com
2. Rename all packages from `@monk/formatter-*` to `@monk-api/formatter-*`
3. Update all imports across monk-api, monk-cli, monk-uix

### Phase 7: Documentation

1. Update API docs for `/app/*` routes
2. Document app package installation
3. Document how to create custom app packages
4. Document bindings package usage

## Considerations

### Performance

In-process fetch has serialization overhead but no network latency. For most use cases this is negligible. If an app needs many sequential API calls, consider:

- Batch endpoints in core API (`/api/bulk`)
- Accepting the overhead for cleaner architecture
- App-specific optimizations if profiling shows issues

### Auth Propagation

The in-process client forwards the original request's Authorization header. The inner API call runs with the same user permissions as the outer request.

### Error Handling

API errors return as JSON responses. App packages should handle these appropriately:

```typescript
const res = await client.get(`/api/data/grids/${id}`);
if (!res.success) {
    return c.json(res, res.error_code === 'NOT_FOUND' ? 404 : 400);
}
```

### Circular Routing Prevention

The in-process client enforces that app packages can only call `/api/*` paths, never `/app/*`. This prevents circular dependencies between apps.

### Custom API Endpoints

Some apps may need specialized core API endpoints that don't fit the generic Data API. Options:

1. Add endpoint to core API if generally useful
2. Use `/api/bulk` for multi-operation sequences
3. Accept multiple round-trips for complex operations

### Bindings as Shared Types

The `@monk-api/bindings-ts` package serves double duty:

1. **External SDK**: Full HTTP client with axios for cli/uix/third-party
2. **Type definitions**: `ApiResponse`, `FindQuery`, etc. shared across packages

Apps can import just the types without using the axios-based client:

```typescript
import type { ApiResponse, FindQuery } from '@monk-api/bindings-ts';
```

## Bindings Sync Issues (as of 4.4+)

The bindings package was copied from `monk-api-bindings-ts` and has drifted from the actual API. These need to be fixed before the bindings are considered production-ready:

### Auth Types (`types/auth.ts`)

| Issue | Bindings | Actual API |
|-------|----------|------------|
| `LoginRequest` | Missing `format` field | Supports `format` for response preference |
| `LoginResponse` | `{ token, user: { id, username, email }, tenant }` | `{ token, user: { id, username, tenant, access, format? } }` - no email |
| `RegisterRequest` | `{ tenant, username, email, password }` | `{ tenant, template?, username?, description?, adapter? }` - tenant provisioning, not user signup |
| `RegisterResponse` | `{ token, user: {...} }` | `{ tenant, username, token, expires_in }` |
| `SudoResponse` | `root_token` field | `sudo_token` field |

### JWT Payload (`types/common.ts`)

| Issue | Bindings | Actual API |
|-------|----------|------------|
| Database field | `database: string` | `db: string` (compact JWT field) |
| Missing fields | - | `db_type: 'postgresql' \| 'sqlite'` |
| Missing fields | - | `ns: string` (namespace) |
| Missing fields | - | `is_fake?: boolean` |
| Missing fields | - | `faked_by_user_id?: string` |
| Missing fields | - | `faked_by_username?: string` |
| Missing fields | - | `faked_at?: string` |

### API Endpoints (`api/auth.ts`)

| Issue | Bindings | Actual API |
|-------|----------|------------|
| whoami path | `/api/auth/whoami` | `/api/user/whoami` |
| sudo path | `/api/auth/sudo` | `/api/user/sudo` |

### TODO

- [ ] Update `types/auth.ts` to match actual request/response shapes
- [ ] Update `types/common.ts` JwtPayload with correct/missing fields
- [ ] Fix endpoint paths in `api/auth.ts`
- [ ] Verify `WhoAmIResponse` matches actual `context.get('user')` structure
- [ ] Add tests that validate bindings against actual API responses

## Open Questions

1. **Versioning**: Should app packages version independently or stay in sync with core API?
   - Recommendation: Stay in sync while in monorepo; independent if split later

2. **URL Prefix**: Is `/app/*` the right prefix? Alternatives:
   - `/x/*` (extensions)
   - `/ext/*` (extensions)
   - `/apps/*` (plural)
   - Keep as `/api/grids/*` but load from package?
   - Recommendation: `/app/*` is clear and distinguishes from core `/api/*`

3. **MCP Integration**: Should app routes be auto-exposed as MCP tools, or require explicit registration?
   - Recommendation: Require explicit registration; apps may have routes unsuitable for MCP

4. **npm Scope**: When to register `@monk-api` scope?
   - Can stay with `@monk` or unscoped until ready to publish publicly
   - Register `@monk-api` when ready for npm publication

5. **Bindings Transport**: Should bindings support pluggable transports (axios vs in-process)?
   - Current: axios only, in-process client is separate
   - Future: Could abstract transport layer if needed
