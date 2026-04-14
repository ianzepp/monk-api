# Monk API

Multi-tenant backend platform built with Hono, TypeScript, Bun, and PostgreSQL/SQLite. Monk API provides model-first data APIs, schema-isolated tenants, Monk-brokered Auth0 password authentication with Monk bearer tokens, ordered observer hooks, an HTTP filesystem API, optional app packages, and a cron surface for scheduled backend work.

The project is more than a CRUD service. It is a small programmable backend runtime: tenants define models and fields, the generic API operates on those models, observers enforce lifecycle behavior, and higher-level services can automate against the same tenant-scoped HTTP surface.

## For AI Agents & Contributors

Read [AGENTS.md](./AGENTS.md) before starting any task.

## Project Overview

- **Language**: TypeScript with Hono framework
- **Database**: PostgreSQL (schema-per-tenant) or SQLite (file-per-tenant)
- **Authentication**: Monk-brokered Auth0 username/password auth plus Monk-issued bearer tokens carrying Monk-owned access state
- **Architecture**: Ring-based observer system for model lifecycle behavior
- **Runtime surfaces**: HTTP API, dynamic `/app/*` packages, `/fs/*` filesystem API, and cron scheduler
- **Distribution**: Compiles to standalone executable with no external dependencies

## Runtime Surfaces

Monk starts multiple surfaces from [src/index.ts](src/index.ts):

| Surface | Default | Purpose |
|---------|---------|---------|
| HTTP API | `PORT=9001` | Public, auth, data, model, app, filesystem, and cron routes |
| Cron scheduler | PostgreSQL only | Tracks scheduled tenant jobs from the cron/process tables |

## HTTP API Routes

### Public Routes (No Auth)

| Path | Purpose |
|------|---------|
| `/health` | Health check |
| `/auth/register` | Register a new tenant and root user with `tenant`, `username`, and `password` |
| `/auth/login` | Verify `tenant`, `username`, and `password` and return a Monk bearer token |
| `/auth/refresh` | Refresh a Monk bearer token presented in `Authorization` |
| `/auth/tenants` | List registered tenants |
| `/docs/*` | Self-documenting API reference |

### Protected Routes (Monk Bearer Token Required)

| Path | Purpose |
|------|---------|
| `/api/data/:model[/:id]` | CRUD operations with relationship traversal |
| `/api/find/:model` | Advanced queries with 25+ filter operators |
| `/api/describe/:model` | Model and field definitions |
| `/api/aggregate/:model` | Aggregations ($sum, $avg, $count, $min, $max, $distinct) |
| `/api/bulk` | Multi-operation transactions |
| `/api/bulk/export` | Export tenant data to SQLite file |
| `/api/bulk/import` | Import data from SQLite file |
| `/api/acls/:model/:id` | Record-level access control lists |
| `/api/stat/:model/:id` | Record metadata (timestamps, etag) |
| `/api/tracked/:model/:id` | Field-level change history |
| `/api/trashed/:model` | Soft-deleted record management |
| `/api/user/*` | Self-service profile management |
| `/api/cron/*` | Scheduled process management |
| `/fs/*` | Tenant-scoped virtual filesystem access |

### Sudo Routes (Elevated Access)

Operations on protected models require root/full authorization from the current Monk user row. Sudo and fake-token routes remain Monk-local token machinery layered on top of Monk bearer tokens.

## Model-First Data Runtime

Tenants define models and fields through `/api/describe/*`, then read and write records through `/api/data/*`. This lets the API serve many tenant-specific schemas without a new controller per resource.

Core model features include:

- **Field types**: text, integer, decimal, boolean, timestamp, date, uuid, jsonb, arrays
- **Constraints**: required, unique, default_value, minimum/maximum, pattern, enum_values
- **Protection**: sudo (requires elevated access), freeze (read-only), immutable (write-once)
- **Indexing**: btree indexes and full-text search support
- **Change tracking**: field-level audit trails with old/new values
- **Relationships**: traversal through `/api/data/:model/:id/:relationship`

## Query, Audit, and Data Movement

Monk includes higher-level APIs around the model runtime:

- `/api/find/:model` - advanced filtering and ordering
- `/api/aggregate/:model` - count, sum, average, min, max, and distinct-style aggregation
- `/api/bulk` - multi-operation transactions
- `/api/bulk/export` and `/api/bulk/import` - tenant data movement through SQLite files
- `/api/stat/:model/:id` - record metadata such as timestamps and etags
- `/api/tracked/:model/:id` - field-level change history
- `/api/trashed/:model` - soft-delete restore and purge workflows

## App Packages

Additional functionality is lazy-loaded under `/app/:appName/*` from workspace packages:

| Package | Path | Purpose |
|---------|------|---------|
| **Grids** | `/app/grids/:id/:range` | Excel-style spreadsheet operations with cell ranges |
| **Todos** | `/app/todos` | Example CRUD app demonstrating package pattern |
| **OpenAPI** | `/app/openapi` | OpenAPI-related app package |

Apps can also install tenant models. When an app has tenant-backed models, the dynamic loader enforces authentication before installing or serving those model-backed routes.

## Filesystem API

The HTTP filesystem API is exposed at `/fs/*` and requires authentication. It lets authenticated clients read, write, and delete files in the virtual filesystem.

## Response Customization

All endpoints support query parameters for response formatting:

### Format Selection (`?format=`)

**Built-in:**
- `json` (default)
- `yaml`

**Optional packages** (install from `packages/formatter-*`):
- `toon` - Compact format for LLMs (30-40% smaller)
- `csv` - Tabular export
- `msgpack` - Binary format (30-50% smaller)
- `markdown` - Markdown tables
- `grid-compact` - 60% smaller for Grid API
- `cbor`, `sqlite` - Additional package-backed encodings

### Field Extraction
- `?unwrap` - Remove `{success, data}` envelope
- `?select=field1,field2` - Return only specified fields

### Response Encryption
- `?encrypt=pgp` - AES-256-GCM encryption using the presented bearer token material and Monk tenant/user salt

## Multi-Tenant Architecture

- **PostgreSQL**: Tenants share a regional database (e.g., `us_east`) with isolation via schema/namespace
- **SQLite**: One file per tenant for portable, self-contained databases
- Monk derives a scoped external login identity from canonical `(tenant, username)` values, verifies passwords through Auth0, then mints Monk bearer tokens for API access.
- SHA256-based schema naming (enterprise mode) or human-readable (personal mode)
- Tenants evolve independently (different models, fields, data)

## Observer System

Monk's route handlers are intentionally thin. Much of the important model behavior lives in ordered observers under [src/observers](src/observers).

The observer system uses rings 0-9 for predictable lifecycle execution:

1. Input validation
2. Business logic hooks
3. Database execution
4. Audit/tracking
5. External integrations

Observers attach to model operations such as create, update, and delete. Before changing data behavior, inspect the relevant observers as well as the route handler.

## Access Control

Four ACL arrays per record:
- `access_read` - Read permission
- `access_edit` - Edit permission
- `access_full` - Full access (read/edit/delete)
- `access_deny` - Explicit deny (overrides other permissions)

User management lives under `/api/user/*`. Protected routes currently rely on Monk bearer tokens rather than client-presented Auth0 bearer tokens.

## Cron and Background Work

Cron routes under `/api/cron/*` manage scheduled processes. The scheduler starts only in PostgreSQL mode because it depends on database-backed process tables, and new job creation is temporarily unavailable until the replacement execution backend lands.

On startup, the server initializes infrastructure, preloads observers, starts HTTP, and starts the cron scheduler when PostgreSQL is configured.

## Technology Stack

- **[Hono](https://hono.dev/)** - Web framework
- **TypeScript** - Language
- **PostgreSQL** or **SQLite** - Database backends
- **Auth0** - Production password authority behind Monk's auth routes
- **Bun** - Runtime (compiles to standalone executable)
---

## Local Development Database

Use Docker only for the local PostgreSQL dependency. Railway deployment should use Railway's managed `DATABASE_URL`, not this compose file.

```bash
bun run db:local:up
```

Create `.env` for local development:

```bash
DATABASE_URL=postgresql://monk:monk@127.0.0.1:55432/monk
PORT=9001
NODE_ENV=development
JWT_SECRET=test
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=your-auth0-app-client-id
AUTH0_CLIENT_SECRET=your-auth0-app-client-secret
AUTH0_CONNECTION=Username-Password-Authentication
AUTH0_AUDIENCE=https://your-monk-api-audience
```

Production auth is Monk-brokered through Auth0: clients send username/password to Monk, Monk verifies or provisions credentials through Auth0, and Monk returns Monk bearer tokens for API access.

Initialize the database after building:

```bash
bun run build
bun dist/index.js --no-startup
```

Reset the local database when you need a clean checkout state:

```bash
bun run db:local:reset
bun dist/index.js --no-startup
```

## Railway Deployment

Production is hosted on Railway in the `monk` project.

| Resource | Link |
|----------|------|
| Public API | <https://monk-api-production.up.railway.app> |
| Health check | <https://monk-api-production.up.railway.app/health> |
| Source repository | <https://github.com/ianzepp/monk-api> |
| Railway app service | `monk-api` |
| Railway database service | `Postgres` |

The Railway app service is linked to `ianzepp/monk-api` on `main` and uses Railway's managed Postgres `DATABASE_URL`. Do not use `compose.local.yml` for Railway.

### Production Safety Notes

- `DATABASE_URL`, `NODE_ENV`, `JWT_SECRET`, `AUTH0_ISSUER` or `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_CONNECTION` are required for production brokered auth.
- `AUTH0_AUDIENCE` is optional for password verification but often useful when the Auth0 client expects it.
- Cron job definitions remain visible, but new job creation is temporarily unavailable until the replacement execution backend lands.

## Installation

**Prerequisites:** Bun 1.0+, PostgreSQL 12+ (or SQLite for standalone)

```bash
# Clone and install
git clone https://github.com/ianzepp/monk-api.git
cd monk-api
bun install

# Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL and Auth0 issuer/audience/JWKS values

# Build and start
bun run build
bun run start
```

**Standalone (no PostgreSQL):**
```bash
bun run build:standalone
./dist/monk-api  # Single executable with SQLite
```

## Quick Start

```bash
# Register a tenant and root user
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenant": "demo", "username": "root_user", "password": "secret-pass"}'

# Log in and use the Monk bearer token
MONK_TOKEN=$(curl -sS -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "demo", "username": "root_user", "password": "secret-pass"}' | jq -r '.data.token')

curl http://localhost:9001/api/describe \
  -H "Authorization: Bearer $MONK_TOKEN"
```

## Related Projects

- **[monk-cli](https://github.com/ianzepp/monk-cli)** - Command-line interface for Monk API
- **[monk-uix](https://github.com/ianzepp/monk-uix)** - Web browser admin interface
- **[monk-api-bindings-ts](https://github.com/ianzepp/monk-api-bindings-ts)** - TypeScript API bindings

## Documentation

| Document | Purpose |
|----------|---------|
| [DEVELOPER.md](DEVELOPER.md) | Architecture and development guide |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Debugging guide |
| [spec/README.md](spec/README.md) | Testing infrastructure |
| [src/routes/docs/PUBLIC.md](src/routes/docs/PUBLIC.md) | Complete API reference |
