# App Packages Architecture

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| App infrastructure | **Done** | Loader, in-process client, hybrid model support |
| YAML model definitions | **Done** | Models defined in `models/*.yaml` |
| Per-model `external` flag | **Done** | Models can be app-scoped or tenant-scoped |
| Hybrid app support | **Done** | Apps can have both external and tenant models |
| `@monk-app/mcp` | **Done** | MCP integration (external models) |
| `@monk-app/todos` | **Done** | Reference implementation (tenant models) |
| `@monk-app/openapi` | **Done** | OpenAPI spec generator (no models) |
| SystemInit pattern | **Done** | Decoupled System from Hono Context |
| Lazy app loading | **Done** | `/app/:appName/*` wildcard route |
| `@monk-app/grids` | Planned | Extract from core (tenant models) |
| `@monk-app/extracts` | Planned | Extract from core (hybrid: external + tenant models) |
| `@monk-app/restores` | Planned | Extract from core |
| `@monk-app/comments` | Planned | New package (tenant models) |
| `@monk-app/notifications` | Planned | New package |

## Model Namespaces

Model namespace is determined per-model via the `external` field in model YAML files:

### external: true (App Namespace)

Model is installed in the app's namespace (shared infrastructure).

```yaml
# models/sessions.yaml
model_name: sessions
description: MCP Sessions
external: true

fields:
  - field_name: session_id
    type: text
    required: true
```

- Creates `@monk/{appName}` tenant if needed
- Installed once at app startup
- Data managed by the app on behalf of tenants
- Use `tenant_id` column for multi-tenant data isolation
- No JWT auth required for app routes (unless app has tenant models too)

### external: false (Tenant Namespace, Default)

Model is installed in the user's tenant namespace.

```yaml
# models/todos.yaml
model_name: todos
description: Todo items for task tracking

fields:
  - field_name: title
    type: text
    required: true
```

- Installed in user's tenant on first request
- Requires JWT authentication
- Data belongs to the user
- Uses user's JWT for all API calls

### Hybrid Apps

Apps can have models in both namespaces. For example, an "extracts" app might have:

```
models/
  extract_jobs.yaml      # external: true - shared job definitions
  extract_runs.yaml      # external: true - run history (with tenant_id)
  export_config.yaml     # external: false - per-tenant preferences
```

External models are installed at app startup, tenant models on first user request.

### Comparison

| Aspect | external: true | external: false |
|--------|----------------|-----------------|
| Namespace | App (`@monk/{app}`) | User's tenant |
| Installed | App startup | First user request |
| Auth required | No (for this model) | Yes (JWT) |
| Data belongs to | App | User |
| Multi-tenant | Via `tenant_id` column | Schema isolation |
| Use case | Shared infrastructure | User-owned data |

## Package Structure

```
packages/{appName}/
  app.yaml                # App configuration (name, description)
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
description: Todo list application
```

Note: The `scope` field is deprecated. Use per-model `external` field instead.

### Model YAML Format

```yaml
# models/todos.yaml
model_name: todos
description: Todo items for task tracking
external: false          # Optional, defaults to false (tenant namespace)

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

| Package | Route | Models | Purpose | Status |
|---------|-------|--------|---------|--------|
| `@monk-app/mcp` | `/app/mcp/*` | external | MCP protocol integration | **Done** |
| `@monk-app/todos` | `/app/todos/*` | tenant | Reference todo list | **Done** |
| `@monk-app/openapi` | `/app/openapi/*` | none | OpenAPI spec generator | **Done** |
| `@monk-app/grids` | `/app/grids/*` | tenant | Excel-like spreadsheet cells | Planned |
| `@monk-app/extracts` | `/app/extracts/*` | hybrid | Data export/backup archives | Planned |
| `@monk-app/restores` | `/app/restores/*` | hybrid | Data import from archives | Planned |
| `@monk-app/comments` | `/app/comments/*` | tenant | Threaded comments on any record | Planned |

## App Loader

### Loading Flow

```
Request: GET /app/todos/

1. Check if app has tenant models (requires JWT auth)
2. If auth needed and not present, run JWT validation
3. Load app instance (cached)
4. Separate models by external flag
5. Install external models in app namespace (once per app)
6. Install tenant models in user's namespace (once per tenant)
7. Forward request to app
```

### Loader Functions

```typescript
// Load app with hybrid model support (recommended)
loadHybridApp(appName: string, honoApp: Hono, userContext?: Context): Promise<Hono | null>

// Check if app has tenant models (requires auth)
appHasTenantModels(appName: string): boolean

// Check if app has external models
appHasExternalModels(appName: string): boolean
```

### Model Registration

Models are registered idempotently:

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

The `external` flag on each model is preserved when creating the model record.

## App Patterns

### Tenant-Only App (e.g., todos)

For apps where all data belongs to the user:

```typescript
// packages/todos/src/index.ts
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { honoApp } = context;

    app.get('/', async (c) => {
        const client = createClient(c, honoApp);  // Uses user's JWT
        const result = await client.get('/api/data/todos');
        return c.json(result);
    });

    return app;
}
```

### External-Only App (e.g., mcp)

For apps that manage shared infrastructure:

```typescript
// packages/mcp/src/index.ts
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { client } = context;  // Pre-bound to app's token

    app.post('/', async (c) => {
        const session = await client.post('/api/data/sessions', {...});
        return c.json(session);
    });

    return app;
}
```

### Hybrid App (e.g., extracts)

For apps with both external infrastructure and tenant preferences:

```typescript
// packages/extracts/src/index.ts
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { honoApp } = context;

    app.post('/jobs', async (c) => {
        // External model - use app client
        const appClient = getAppClient(context);
        const job = await appClient.post('/api/data/extract_jobs', {
            tenant_id: getTenantId(c),  // Track which tenant owns this
            ...
        });
        return c.json(job);
    });

    app.get('/config', async (c) => {
        // Tenant model - use user's JWT
        const userClient = createClient(c, honoApp);
        const config = await userClient.get('/api/data/export_config');
        return c.json(config);
    });

    return app;
}
```

## Implemented Apps

### @monk-app/mcp (external models)

MCP protocol integration for LLM agents.

```
packages/mcp/
  app.yaml
  models/
    sessions.yaml         # external: true
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

### @monk-app/todos (tenant models)

Reference implementation for tenant-scoped apps.

```
packages/todos/
  app.yaml
  models/
    todos.yaml            # external: false (default)
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

### @monk-app/openapi (no models)

OpenAPI specification generator.

```
packages/openapi/
  app.yaml
  src/
    index.ts
```

Routes:
- `GET /app/openapi/openapi.json` - Generate OpenAPI spec from tenant models

## Migration Path

### Completed

- [x] Phase 1: Move Bindings into monk-api (`packages/bindings/`)
- [x] Phase 2: Create App Infrastructure (loader, in-process client)
- [x] Phase 5: Extract MCP (`packages/mcp/`)
- [x] SystemInit pattern for context-free System creation
- [x] YAML model definitions
- [x] Per-model `external` flag for namespace control
- [x] Hybrid app support
- [x] Reference tenant-scoped app (todos)
- [x] OpenAPI spec generator (openapi)

### In Progress

- [ ] Phase 3: Extract Grids to `@monk-app/grids`
- [ ] Phase 4: Extract Extracts/Restores (hybrid apps)

### Planned

- [ ] Comments, Notifications packages
- [ ] Feature flags to enable/disable apps per tenant

## Considerations

### Performance

- App code is cached globally (stateless)
- Model definitions cached per app
- External model installation tracked globally
- Tenant model installation tracked per-tenant
- In-process fetch has no network latency

### Auth Propagation

- External models: App uses its own long-lived token
- Tenant models: App forwards user's JWT from request
- Hybrid apps: Use appropriate client based on model type

### Schema Isolation

- External models and tenant models are in different PG schemas
- No cross-schema foreign keys possible
- App code bridges the schemas via `tenant_id` columns
- Row-level isolation (external) vs schema isolation (tenant)

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
ALTER TABLE tenants ADD COLUMN enabled_apps text[] DEFAULT '{}';
```

Loader would check: "Is this app enabled for this tenant?"
