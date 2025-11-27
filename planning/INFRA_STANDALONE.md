# Infrastructure Standalone Mode

## Overview

Enable Monk API to run entirely on SQLite without PostgreSQL dependency. Full multi-tenant support with infrastructure tables in SQLite.

## Architecture

### Current (Unified)
```
DATABASE_URL=postgresql://localhost/monk
  └── monk database
      ├── public schema → tenants, tenant_fixtures
      ├── ns_tenant_acme → models, fields, users, filters, [user tables]
      └── ns_tenant_demo → models, fields, users, filters, [user tables]

DATABASE_URL=sqlite:monk (or absent)
  └── .data/monk/
      ├── public.db → tenants, tenant_fixtures
      ├── ns_tenant_acme.db → models, fields, users, filters, [user tables]
      └── ns_tenant_demo.db → models, fields, users, filters, [user tables]
```

## Infrastructure Tables (Simplified)

**Keep:**
- `tenants` - Core tenant registry
- `tenant_fixtures` - Track deployed fixtures per tenant

**Dropped:**
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
- [x] Wire `Infrastructure` class into startup
- [x] Replace `DatabaseConnection.getMainPool()` usage in auth routes
- [x] Remove single-tenant bypass hacks from `standalone.ts`
- [x] Update `auth/login` to use `Infrastructure.getTenant()`
- [x] Update `auth/register` to use `Infrastructure.createTenant()`
- [x] Remove request-tracking middleware dependency on standalone.ts
- [x] Delete standalone.ts
- [x] Test full flow: register → login → create data → query

### Not Needed (Simplified)
- ~~Update `DatabaseTemplate.cloneTemplate()` for SQLite infrastructure~~ (replaced by Infrastructure.createTenant())
- ~~Remove request-tracking middleware~~ (skips SQLite mode automatically)

## Database URL Convention

```bash
# PostgreSQL infrastructure + tenant schemas in same database
DATABASE_URL=postgresql://user@host:5432/monk

# SQLite infrastructure + SQLite tenants
DATABASE_URL=sqlite:monk

# Default (no DATABASE_URL set)
# → sqlite:monk (zero-config standalone)
```

## File Locations (SQLite mode)

```
.data/monk/
├── public.db              # Infrastructure (tenants, tenant_fixtures)
├── ns_tenant_acme.db      # Tenant data
├── ns_tenant_demo.db      # Tenant data
└── ...
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/infrastructure.ts` | Embedded SQL schemas, tenant CRUD, initialization |
| `src/lib/database/bun-sqlite-adapter.ts` | Bun-native SQLite adapter |
| `src/lib/database/sqlite-adapter.ts` | Node.js SQLite adapter (better-sqlite3) |
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

## Usage

```bash
# Build standalone binary
./scripts/build-standalone.sh

# Run (zero config - defaults to sqlite:monk)
cd dist-standalone
./monk-api

# Register a tenant
curl -X POST http://localhost:9001/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"tenant": "mycompany", "username": "admin"}'

# Login
curl -X POST http://localhost:9001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenant": "mycompany", "username": "admin"}'
```

## Migration Path

Existing PostgreSQL tenants can be exported via `/api/extracts` and imported into standalone SQLite instance via `/api/restores`. SQLite databases serve as the portable archive format.
