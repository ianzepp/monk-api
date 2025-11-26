# App Packages Architecture

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| App infrastructure | **Done** | Loader, in-process client, scope detection |
| YAML model definitions | **Done** | Models defined in `models/*.yaml` |
| App scopes (app/tenant) | **Done** | Two scope types with different behaviors |
| `@monk-app/mcp` | **Done** | MCP integration (scope: app) |
| `@monk-app/todos` | **Done** | Reference implementation (scope: tenant) |
| SystemInit pattern | **Done** | Decoupled System from Hono Context |
| Lazy app loading | **Done** | `/app/:appName/*` wildcard route |
| App observer registration | Planned | Load observers from app packages |
| `@monk-app/grids` | Planned | Extract from core (scope: tenant) |
| `@monk-app/extracts` | Planned | Extract from core |
| `@monk-app/restores` | Planned | Extract from core |
| `@monk-app/openapi` | Planned | New package |
| `@monk-app/comments` | Planned | New package (scope: tenant) |
| `@monk-app/notifications` | Planned | New package |

## App Scopes

Apps can operate in two different scopes:

### scope: app

App has its own isolated tenant for internal data storage.

```yaml
# packages/mcp/app.yaml
name: mcp
scope: app
description: MCP integration - has its own tenant for session storage
```

- Creates `@monk/{appName}` tenant with localhost-only access
- Uses long-lived app JWT token for API calls
- Data stored in app's namespace
- No authentication required to access app routes
- Example: MCP stores sessions in its own tenant

### scope: tenant

Models installed in user's tenant, data belongs to user.

```yaml
# packages/todos/app.yaml
name: todos
scope: tenant
description: Todo list - models installed in user's tenant
```

- No app tenant created
- Requires JWT authentication on all requests
- Models installed in user's tenant on first request
- Uses user's JWT for all API calls
- Data stored in user's namespace
- Example: Todos, grids, comments

### Comparison

| Aspect | scope: app | scope: tenant |
|--------|------------|---------------|
| App tenant | Created (`@monk/mcp`) | None |
| Auth required | No | Yes (JWT) |
| Models installed in | App's namespace | User's namespace |
| Data belongs to | App | User |
| JWT used | App's token | User's token |
| Use case | App internal state | User features |

## Package Structure

```
packages/{appName}/
  app.yaml                # App configuration (name, scope)
  models/
    {model}.yaml          # One YAML file per model
  package.json
  tsconfig.json
  scripts/
    build.sh
  src/
    index.ts              # Exports createApp()
    docs/
      PUBLIC.md           # Documentation
```

### app.yaml

```yaml
name: todos
scope: tenant           # or "app"
description: Todo list application
```

### Model YAML Format

```yaml
# models/todos.yaml
model_name: todos
description: Todo items for task tracking

fields:
  - field_name: title
    type: text
    required: true
    description: Short title describing the task

  - field_name: status
    type: text
    default_value: pending
    description: Current status (pending, in_progress, completed)
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

| Package | Route | Scope | Purpose | Status |
|---------|-------|-------|---------|--------|
| `@monk-app/mcp` | `/app/mcp/*` | app | MCP protocol integration | **Done** |
| `@monk-app/todos` | `/app/todos/*` | tenant | Reference todo list | **Done** |
| `@monk-app/grids` | `/app/grids/*` | tenant | Excel-like spreadsheet cells | Planned |
| `@monk-app/extracts` | `/app/extracts/*` | app | Data export/backup archives | Planned |
| `@monk-app/restores` | `/app/restores/*` | app | Data import from archives | Planned |
| `@monk-app/comments` | `/app/comments/*` | tenant | Threaded comments on any record | Planned |

## App Loader

### Loading Flow

```
Request: GET /app/todos/

1. Load app.yaml to determine scope
2. If scope=tenant:
   a. Run JWT validation middleware
   b. Load app instance (cached)
   c. Install models in user's tenant (if not already)
   d. Forward request with user's auth
3. If scope=app:
   a. Load app instance (cached)
   b. App uses its own tenant token
   c. Forward request
```

### Loader Functions

```typescript
// Load app configuration
loadAppConfig(appName: string): Promise<AppConfig>

// Load app-scoped app (has own tenant)
loadAppScopedApp(appName: string, honoApp: Hono): Promise<Hono | null>

// Load tenant-scoped app (uses user's tenant)
loadTenantScopedApp(appName: string, honoApp: Hono, userContext: Context): Promise<Hono | null>
```

### Model Registration

Models are registered idempotently on first request:

```typescript
registerAppModels(
    dbType: 'postgresql' | 'sqlite',
    dbName: string,
    nsName: string,
    userId: string,
    tenantName: string,
    appName: string,
    models: AppModelDefinition[]
): Promise<void>
```

For tenant-scoped apps, this runs in the user's namespace.
For app-scoped apps, this runs in the app's namespace.

## Tenant-Scoped App Pattern

For apps like todos, grids, comments where data belongs to the user:

```typescript
// packages/todos/src/index.ts

export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { honoApp } = context;

    // Create client per-request using user's auth
    app.get('/', async (c) => {
        const client = createClient(c, honoApp);  // Uses c.req.header('Authorization')
        const result = await client.get('/api/data/todos');
        return c.json(result);
    });

    return app;
}

// Helper to create per-request client
function createClient(c: Context, honoApp: any) {
    const authHeader = c.req.header('Authorization');
    // ... forwards user's JWT to API calls
}
```

## App-Scoped App Pattern

For apps like MCP that need their own storage:

```typescript
// packages/mcp/src/index.ts

export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { client } = context;  // Pre-bound to app's token

    // Use app's client for internal storage
    app.post('/', async (c) => {
        const session = await client.post('/api/data/sessions', {...});
        // ...
    });

    return app;
}
```

MCP also stores user tokens in sessions to make API calls on behalf of users.

## Implemented Apps

### @monk-app/mcp (scope: app)

MCP protocol integration for LLM agents.

```
packages/mcp/
  app.yaml                # scope: app
  models/
    sessions.yaml         # Session storage
  src/
    index.ts
    sessions.ts
    handlers.ts
    tools.ts
```

Has its own tenant (`@monk/mcp`) for storing:
- Session IDs
- User tenant names
- User JWT tokens (for API calls on behalf of users)

### @monk-app/todos (scope: tenant)

Reference implementation for tenant-scoped apps.

```
packages/todos/
  app.yaml                # scope: tenant
  models/
    todos.yaml            # Todo items
  src/
    index.ts
    docs/
      PUBLIC.md
```

Routes:
- `GET /app/todos/` - List todos
- `POST /app/todos/` - Create todo
- `GET /app/todos/:id` - Get todo
- `PUT /app/todos/:id` - Update todo
- `DELETE /app/todos/:id` - Delete todo
- `POST /app/todos/:id/complete` - Mark complete
- `POST /app/todos/:id/reopen` - Reopen

## Migration Path

### Completed

- [x] Phase 1: Move Bindings into monk-api (`packages/bindings/`)
- [x] Phase 2: Create App Infrastructure (loader, in-process client)
- [x] Phase 5: Extract MCP (`packages/mcp/`)
- [x] SystemInit pattern for context-free System creation
- [x] YAML model definitions
- [x] App scopes (app vs tenant)
- [x] Reference tenant-scoped app (todos)

### In Progress

- [ ] Phase 3: Extract Grids to `@monk-app/grids` (scope: tenant)
- [ ] Phase 4: Extract Extracts/Restores

### Planned

- [ ] App observer registration
- [ ] OpenAPI, Comments, Notifications packages
- [ ] Feature flags to enable/disable apps per tenant

## Considerations

### Performance

- App code is cached globally (stateless)
- Model installation tracked per-tenant
- In-process fetch has no network latency

### Auth Propagation

- App-scoped: Uses app's long-lived token
- Tenant-scoped: Forwards user's JWT from request

### Error Handling

API errors return as JSON responses:

```typescript
const result = await client.get(`/api/data/todos/${id}`);
return c.json(result, result.success ? 200 : 404);
```

### Circular Routing Prevention

The in-process client blocks `/app/*` calls to prevent circular routing.

## Future: Feature Flags

Apps could be enabled/disabled per tenant:

```sql
-- Option: JSON field on tenants
ALTER TABLE tenants ADD COLUMN enabled_apps text[] DEFAULT '{}';
```

Loader would check: "Is this app enabled for this tenant?"
