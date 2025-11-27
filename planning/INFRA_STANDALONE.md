# Infrastructure Standalone Mode

## Overview

Enable Monk API to run entirely on SQLite without PostgreSQL dependency. Full multi-tenant support with infrastructure tables in SQLite.

## Architecture

### Current (PostgreSQL-dependent)
```
DATABASE_URL=postgresql://...
    → monk DB (infrastructure: tenants, sandboxes, requests, mcp_sessions)
    → db_main (tenant schemas: ns_tenant_*)
    → Tenant data can be PostgreSQL or SQLite
```

### Target (SQLite standalone)
```
DATABASE_URL=sqlite:monk
    → .data/infra/monk.db (infrastructure: tenants, tenant_fixtures)
    → .data/db_main/*.db (tenant databases)
    → Full multi-tenant, all SQLite
```

## Infrastructure Tables (Simplified)

**Keep:**
- `tenants` - Core tenant registry
- `tenant_fixtures` - Track deployed fixtures per tenant

**Drop:**
- `sandboxes` - Unused, future feature
- `requests` - Space hog, minimal value
- `mcp_sessions` - MCP server manages its own tenant now

## Implementation Status

### Completed
- [x] Bun runtime detection (`Bun.serve()` vs `@hono/node-server`)
- [x] Bun SQLite adapter (`bun:sqlite`, no native deps)
- [x] `Infrastructure` class with embedded SQL schemas
- [x] Infrastructure initialization tested on SQLite
- [x] Build script (`scripts/build-standalone.sh`) - 59MB binary

### In Progress
- [ ] Wire `Infrastructure` class into startup
- [ ] Replace `DatabaseConnection.getMainPool()` usage in auth routes
- [ ] Remove single-tenant bypass hacks from `standalone.ts`

### TODO
- [ ] Update `auth/login` to use `Infrastructure.getTenant()`
- [ ] Update `auth/register` to use `Infrastructure.createTenant()`
- [ ] Update `DatabaseTemplate.cloneTemplate()` for SQLite infrastructure
- [ ] Remove request-tracking middleware (or make it optional)
- [ ] Test full flow: register → login → create data → query

## Database URL Convention

```bash
# PostgreSQL infrastructure + mixed tenant backends
DATABASE_URL=postgresql://user@host:5432/monk

# SQLite infrastructure + SQLite tenants only
DATABASE_URL=sqlite:monk

# Default (no DATABASE_URL set)
# → sqlite:monk (zero-config standalone)
```

## File Locations (SQLite mode)

```
.data/
├── infra/
│   └── monk.db          # Infrastructure (tenants, tenant_fixtures)
└── db_main/
    ├── ns_tenant_abc123.db
    ├── ns_tenant_def456.db
    └── ...
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/infrastructure.ts` | Embedded SQL schemas, tenant CRUD |
| `src/lib/database/bun-sqlite-adapter.ts` | Bun-native SQLite adapter |
| `src/lib/standalone.ts` | Standalone mode detection (needs refactor) |
| `scripts/build-standalone.sh` | Compile to single binary |

## Infrastructure Schema

### tenants
```sql
CREATE TABLE tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    db_type TEXT DEFAULT 'sqlite' CHECK (db_type IN ('postgresql', 'sqlite')),
    database TEXT NOT NULL,
    schema TEXT NOT NULL,
    template_version INTEGER DEFAULT 1,
    description TEXT,
    source_template TEXT,
    owner_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    trashed_at TEXT,
    deleted_at TEXT,
    UNIQUE(database, schema)
);
```

### tenant_fixtures
```sql
CREATE TABLE tenant_fixtures (
    tenant_id TEXT NOT NULL,
    fixture_name TEXT NOT NULL,
    deployed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, fixture_name)
);
```

## Usage (Target State)

```bash
# Build standalone binary
./scripts/build-standalone.sh

# Run (zero config - defaults to sqlite:monk)
cd dist-standalone
./monk-api

# Register a tenant
curl -X POST http://localhost:9001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"tenant": "mycompany", "template": "system"}'

# Login
curl -X POST http://localhost:9001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenant": "mycompany", "username": "root"}'
```

## Migration Path

Existing PostgreSQL tenants can be exported via `/api/extracts` and imported into standalone SQLite instance via `/api/restores`. SQLite databases serve as the portable archive format.
