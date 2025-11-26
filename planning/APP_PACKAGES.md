# App Packages Architecture

## Problem Statement

As the Monk API grows, the boundary between "core API" and "application logic" has blurred. Features like grids, extracts, and restores are applications built on top of the API, not fundamental API operations. This creates issues:

1. **Dependency bloat**: Core `package.json` includes deps like `archiver` and `unzipper` that only matter for specific features
2. **Scope creep**: Every new feature adds to the core API surface
3. **Client overhead**: Clients install everything even if they only need a subset
4. **Maintenance burden**: Changes to app-specific code risk breaking core API
5. **Interface drift**: External bindings package (`monk-api-bindings-ts`) can drift from actual API

## Proposed Solution

Extract application-level features into separate `@monk-api/app-*` packages that:

- Are optionally installed per client need
- Communicate with core API via HTTP-style client (not internal System coupling)
- Own their own dependencies
- Can be developed/versioned independently

Move the TypeScript bindings into `@monk-api/bindings` as a subpackage to:

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
    bindings/               # @monk-api/bindings - TypeScript SDK
    formatter-*/            # @monk-api/formatter-* - Response formatters
    app-*/                  # @monk-api/app-* - Optional applications
```

Related but separate repositories:
- `ianzepp/monk-cli` - Command-line interface (uses @monk-api/bindings)
- `ianzepp/monk-uix` - Web UI (uses @monk-api/bindings)

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

### App Package Scope (@monk-api/app-*)

Application features that build on core API:

| Package | Purpose | Dependencies |
|---------|---------|--------------|
| `@monk-api/app-grids` | Excel-like spreadsheet cells | (none) |
| `@monk-api/app-extracts` | Data export/backup archives | `archiver` |
| `@monk-api/app-restores` | Data import from archives | `unzipper` |
| `@monk-api/app-reports` | PDF/document generation | TBD |
| `@monk-api/app-workflows` | State machine / automation | TBD |

### Package Structure

```
packages/
  bindings/                 # @monk-api/bindings
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

  app-grids/
    package.json            # name: @monk-api/app-grids
    tsconfig.json
    src/
      index.ts              # exports createApp(client: MonkClient)
      range-parser.ts       # Grid-specific logic
      routes/
        range-get.ts
        range-put.ts
        range-delete.ts
        cells-post.ts

  app-extracts/
    package.json            # deps: archiver
    src/
      index.ts
      routes/
        execute.ts
        cancel.ts
        download.ts

  app-restores/
    package.json            # deps: unzipper
    src/
      index.ts
      routes/
        import.ts
        execute.ts
        cancel.ts
```

## Bindings Package (@monk-api/bindings)

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
import { MonkAPI, MonkClient } from '@monk-api/bindings';

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
import { MonkClient } from '@monk-api/bindings';

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

App packages can depend on `@monk-api/bindings` and use the high-level API:

```typescript
// packages/app-grids/src/index.ts
import { Hono } from 'hono';
import { MonkAPI } from '@monk-api/bindings';
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
// packages/app-grids/src/index.ts
import { Hono } from 'hono';
import type { MonkClient } from '@monk-api/bindings';

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
import type { ApiResponse } from '@monk-api/bindings';

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
];

export const apps = new Map<string, AppFactory>();

// Load installed app packages at startup
for (const name of optionalApps) {
    try {
        const mod = await import(`@monk-api/app-${name}`);
        if (typeof mod.createApp === 'function') {
            apps.set(name, mod.createApp);
            console.info(`Loaded app package: @monk-api/app-${name}`);
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

1. Copy `monk-api-bindings-ts/src/*` to `packages/bindings/src/`
2. Update `package.json` name to `@monk-api/bindings`
3. Add to workspace in root `package.json`
4. Update monk-cli and monk-uix to use `@monk-api/bindings`
5. Archive or deprecate `monk-api-bindings-ts` repo

### Phase 2: Create App Infrastructure

1. Add `createInProcessClient` to `src/lib/apps/`
2. Add app loader similar to formatter loader
3. Add `/app/*` route mounting logic

### Phase 3: Extract Grids

1. Create `packages/app-grids/`
2. Move grid routes from `src/routes/api/grids/` to package
3. Refactor to use client instead of System
4. Update route from `/api/grids/*` to `/app/grids/*`
5. Add deprecation notice to old `/api/grids/*` routes (optional)

### Phase 4: Extract Extracts/Restores

1. Create `packages/app-extracts/` with `archiver` dep
2. Create `packages/app-restores/` with `unzipper` dep
3. Move route logic to packages
4. Remove `archiver`/`unzipper` from root `optionalDependencies`

### Phase 5: Rename Scope (Optional)

If moving to `@monk-api` npm scope:

1. Register `@monk-api` scope on npmjs.com
2. Rename all packages from `@monk/formatter-*` to `@monk-api/formatter-*`
3. Update all imports across monk-api, monk-cli, monk-uix

### Phase 6: Documentation

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

The `@monk-api/bindings` package serves double duty:

1. **External SDK**: Full HTTP client with axios for cli/uix/third-party
2. **Type definitions**: `ApiResponse`, `FindQuery`, etc. shared across packages

Apps can import just the types without using the axios-based client:

```typescript
import type { ApiResponse, FindQuery } from '@monk-api/bindings';
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
