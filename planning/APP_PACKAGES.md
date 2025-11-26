# App Packages Architecture

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| App infrastructure | **Done** | Loader, in-process client, tenant registration |
| `@monk-app/mcp` | **Done** | MCP integration package |
| SystemInit pattern | **Done** | Decoupled System from Hono Context |
| Lazy app loading | **Done** | `/app/:appName/*` wildcard route |
| App model registration | **Done** | Via SystemInit, no mock context |
| App observer registration | Planned | Load observers from app packages |
| `@monk-app/grids` | Planned | Extract from core |
| `@monk-app/extracts` | Planned | Extract from core |
| `@monk-app/restores` | Planned | Extract from core |
| `@monk-app/openapi` | Planned | New package |
| `@monk-app/comments` | Planned | New package |
| `@monk-app/notifications` | Planned | New package |

## Problem Statement

As the Monk API grows, the boundary between "core API" and "application logic" has blurred. Features like grids, extracts, and restores are applications built on top of the API, not fundamental API operations. This creates issues:

1. **Dependency bloat**: Core `package.json` includes deps like `archiver` and `unzipper` that only matter for specific features
2. **Scope creep**: Every new feature adds to the core API surface
3. **Client overhead**: Clients install everything even if they only need a subset
4. **Maintenance burden**: Changes to app-specific code risk breaking core API
5. **Interface drift**: External bindings package (`monk-api-bindings-ts`) can drift from actual API

## Implemented Solution

Application-level features are extracted into separate `@monk-app/*` packages that:

- Are optionally installed per client need
- Communicate with core API via in-process HTTP client
- Own their own dependencies
- Can be developed/versioned independently
- Run in isolated tenant namespaces

### Package Scopes

- `@monk/*` - Core packages (formatters, bindings)
- `@monk-app/*` - App packages (mcp, grids, etc.)

## Repository Structure

```
monk-api/
  package.json              # Root: monk-api server
  src/                      # Server source code

  packages/
    bindings/               # @monk/bindings - TypeScript SDK
    formatter-*/            # @monk/formatter-* - Response formatters
    mcp/                    # @monk-app/mcp - MCP integration (implemented)
    grids/                  # @monk-app/grids - Optional application (planned)
    extracts/               # @monk-app/extracts - Optional application (planned)
    restores/               # @monk-app/restores - Optional application (planned)
```

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

### App Package Scope (@monk-app/*)

Application features that build on core API (mounted under `/app/*` routes):

| Package | Route | Purpose | Status |
|---------|-------|---------|--------|
| `@monk-app/mcp` | `/app/mcp/*` | Model Context Protocol integration | **Done** |
| `@monk-app/grids` | `/app/grids/*` | Excel-like spreadsheet cells | Planned |
| `@monk-app/extracts` | `/app/extracts/*` | Data export/backup archives | Planned |
| `@monk-app/restores` | `/app/restores/*` | Data import from archives | Planned |
| `@monk-app/openapi` | `/openapi.json` | OpenAPI spec generation | Planned |
| `@monk-app/comments` | `/app/comments/*` | Threaded comments on any record | Planned |
| `@monk-app/notifications` | `/app/notifications/*` | Outbound notifications | Planned |

## Implemented Components

### App Loader (`src/lib/apps/loader.ts`)

Dynamically discovers and loads installed `@monk-app/*` packages at startup:

```typescript
// Auto-discovery of @monk-app/* packages
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const appPackages = Object.keys(packageJson.dependencies || {})
    .filter(name => name.startsWith('@monk-app/'))
    .map(name => name.replace('@monk-app/', ''));
```

Key features:
- Auto-discovers packages from `package.json` dependencies
- Creates isolated tenant namespace per app (`@monk/appName`)
- Registers app-specific models via `SystemInit` (no mock context)
- Generates long-lived JWT tokens for app API access
- Lazy loads apps on first request

### App Tenant Registration

Each app gets an isolated tenant:

```typescript
export async function registerAppTenant(appName: string): Promise<{
    token: string;
    tenantName: string;
    dbName: string;
    nsName: string;
    userId: string;
}>
```

App tenants:
- Use namespace prefix `ns_app_` instead of `ns_tenant_`
- Have `allowed_ips` restricted to localhost (127.0.0.1, ::1)
- Cannot be logged into via `/auth/login` from external IPs
- Get long-lived JWT tokens (1 year expiry)

### In-Process Client (`src/lib/apps/in-process-client.ts`)

Routes API calls through Hono without network overhead:

```typescript
export interface InProcessClient {
    get<T>(path: string, query?: Record<string, string>): Promise<ApiResponse<T>>;
    post<T>(path: string, body?: any): Promise<ApiResponse<T>>;
    put<T>(path: string, body?: any): Promise<ApiResponse<T>>;
    delete<T>(path: string): Promise<ApiResponse<T>>;
    request<T>(method: string, path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
}
```

Security:
- Prevents circular routing (`/app/*` calls blocked)
- Forwards authentication from original request
- All responses are JSON

### App Context Interface

Apps receive context when created:

```typescript
export interface AppContext {
    /** In-process client for API calls (uses app's JWT token) */
    client: InProcessClient;
    /** App's JWT token for API authentication */
    token: string;
    /** App name (e.g., 'mcp') */
    appName: string;
    /** Full tenant name (e.g., '@monk/mcp') */
    tenantName: string;
    /** Reference to main Hono app for in-process routing */
    honoApp: Hono;
}

export type AppFactory = (context: AppContext) => Hono | Promise<Hono>;
```

### Model Registration

Apps can define models that are registered in their tenant namespace:

```typescript
export interface AppModelDefinition {
    model_name: string;
    description?: string;
    fields: Array<{
        field_name: string;
        type: string;
        required?: boolean;
        // ... other field properties
    }>;
}

export async function registerAppModels(
    dbName: string,
    nsName: string,
    userId: string,
    appName: string,
    models: AppModelDefinition[]
): Promise<void>
```

Uses `SystemInit` pattern for context-free System creation:

```typescript
const systemInit: SystemInit = {
    dbType: 'postgresql',
    dbName,
    nsName,
    userId,
    access: 'root',
    tenant: `@monk/${appName}`,
    isSudoToken: true,
};

const system = new System(systemInit);
```

### Route Mounting (`src/index.ts`)

Apps are mounted via lazy-loading wildcard route:

```typescript
// Lazy-load apps on first request to their routes
app.all('/app/:appName/*', async (c) => {
    const appName = c.req.param('appName');

    // Load app if not cached
    let loadPromise = appLoadPromises.get(appName);
    if (!loadPromise) {
        const { loadApp } = await import('@src/lib/apps/loader.js');
        loadPromise = loadApp(appName, app);
        appLoadPromises.set(appName, loadPromise);
    }

    const appInstance = await loadPromise;
    if (!appInstance) {
        throw HttpErrors.notFound(`App not found: ${appName}`, 'APP_NOT_FOUND');
    }

    // Rewrite URL and forward to app
    const url = new URL(c.req.url);
    url.pathname = url.pathname.replace(`/app/${appName}`, '') || '/';

    const newRequest = new Request(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
        duplex: 'half',  // Required for streaming bodies
    });

    return appInstance.fetch(newRequest);
});
```

### SystemInit Pattern (`src/lib/system.ts`)

System can now be created without Hono context:

```typescript
export interface SystemInit {
    dbType: DatabaseType;
    dbName: string;
    nsName: string;
    userId: string;
    access: string;
    tenant: string;
    accessRead?: string[];
    accessEdit?: string[];
    accessFull?: string[];
    isSudoToken?: boolean;
    correlationId?: string;
}

// Create from JWT payload
export function systemInitFromJWT(payload: JWTPayload, correlationId?: string): SystemInit;

// System constructor accepts either
class System {
    constructor(init: SystemInit, options?: SystemOptions);
    constructor(context: Context, options?: SystemOptions);  // Legacy
}
```

### Sudo Logic Consolidation

Sudo checks are now centralized in System:

```typescript
class System {
    // Check if operation has sudo access
    isSudo(): boolean {
        return this.isRoot() || this._isSudoToken || this._asSudo;
    }

    // Set self-service sudo flag
    setAsSudo(value: boolean): void;
}
```

Used by:
- `model-sudo-validator.ts` - checks `system.isSudo()`
- `field-sudo-validator.ts` - checks `system.isSudo()`
- `withSelfServiceSudo()` - calls `system.setAsSudo()`

## MCP Package (`packages/mcp/`)

The MCP package is fully implemented:

```
packages/mcp/
  package.json            # @monk-app/mcp
  tsconfig.json
  scripts/
    build.sh              # Build script
  src/
    index.ts              # Exports createApp() and MODELS
    docs/
      PUBLIC.md           # Package documentation
```

### Package Interface

```typescript
// packages/mcp/src/index.ts
import type { AppContext, AppFactory } from '../../src/lib/apps/loader.js';

export const MODELS: AppModelDefinition[] = [
    {
        model_name: 'mcp_sessions',
        description: 'MCP protocol sessions',
        fields: [
            { field_name: 'session_id', type: 'text', required: true },
            // ...
        ],
    },
];

export const createApp: AppFactory = async (context: AppContext) => {
    const app = new Hono();
    // ... route definitions
    return app;
};
```

### Documentation Endpoint

App documentation is served via `/docs/app/:appName`:

```
GET /docs/app/mcp         → packages/mcp/dist/docs/PUBLIC.md
GET /docs/app/mcp/tools   → packages/mcp/dist/docs/tools.md
```

## Middleware Chain

The request flow with SystemInit:

```
jwtValidationMiddleware
  → verifies JWT
  → creates SystemInit from JWT payload
  → sets context.set('systemInit', systemInit)

userValidationMiddleware
  → validates user exists in DB
  → enriches systemInit with fresh access arrays from DB

systemContextMiddleware
  → creates System from systemInit (or falls back to legacy context)
  → sets context.set('system', system)

route handlers
  → use context.get('system')
```

## Planned: App Observer Registration

App packages can register observers that integrate into the core observer pipeline:

```
packages/openapi/
  src/
    observers/
      models/
        7/                          # Ring 7 (after-commit)
          regenerate-spec.ts        # Regenerate model spec on model change
```

The `ObserverLoader` will be extended to scan app packages:

```typescript
static async preloadObservers(): Promise<void> {
    // 1. Load core observers from src/observers/
    await this._loadCoreObservers();

    // 2. Load app package observers
    for (const name of installedApps) {
        const packagePath = `node_modules/@monk-app/${name}/dist/observers`;
        // ... load observers
    }
}
```

## Migration Path

### Completed

- [x] Phase 1: Move Bindings into monk-api (`packages/bindings/`)
- [x] Phase 2: Create App Infrastructure (loader, in-process client)
- [x] Phase 5: Extract MCP (`packages/mcp/`)
- [x] SystemInit pattern for context-free System creation
- [x] Consolidate sudo logic in System.isSudo()

### In Progress

- [ ] Phase 3: Extract Grids to `@monk-app/grids`
- [ ] Phase 4: Extract Extracts/Restores to `@monk-app/extracts`, `@monk-app/restores`

### Planned

- [ ] App observer registration
- [ ] OpenAPI, Comments, Notifications packages
- [ ] Bindings sync with actual API

## Considerations

### Performance

In-process fetch has serialization overhead but no network latency. For most use cases this is negligible.

### Auth Propagation

Apps receive their own JWT token with root access to their tenant namespace. The in-process client uses this token for API calls.

### Error Handling

API errors return as JSON responses:

```typescript
const res = await client.get(`/api/data/grids/${id}`);
if (!res.success) {
    return c.json(res, res.error_code === 'NOT_FOUND' ? 404 : 400);
}
```

### Circular Routing Prevention

The in-process client enforces that app packages can only call `/api/*` paths, never `/app/*`.

## Open Questions

1. **Versioning**: Should app packages version independently or stay in sync with core API?
   - Recommendation: Stay in sync while in monorepo

2. **URL Prefix**: `/app/*` is confirmed as the prefix

3. **MCP Integration**: App routes require explicit MCP tool registration

4. **npm Scope**: Using `@monk-app/*` for apps, `@monk/*` for core packages

## Bindings Sync Issues (as of 4.4+)

The bindings package needs updates to match actual API. See TODO section in bindings package.
