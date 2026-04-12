# Monk API

Multi-tenant backend platform built with Hono, TypeScript, Bun, and PostgreSQL/SQLite. Monk API provides model-first data APIs, schema-isolated tenants, JWT/API-key authentication, ordered observer hooks, a virtual shell/filesystem, optional app packages, MCP tools, and a Claude-backed headless agent.

The project is more than a CRUD service. It is a small programmable backend runtime: tenants define models and fields, the generic API operates on those models, observers enforce lifecycle behavior, and the TTY/agent layers can operate against the same tenant-scoped system context.

## For AI Agents & Contributors

Read [AGENTS.md](./AGENTS.md) before starting any task.

## Project Overview

- **Language**: TypeScript with Hono framework
- **Database**: PostgreSQL (schema-per-tenant) or SQLite (file-per-tenant)
- **Authentication**: JWT tokens, API keys, and three-tier access (public, user, root/sudo)
- **Architecture**: Ring-based observer system for model lifecycle behavior
- **Runtime surfaces**: HTTP API, dynamic `/app/*` packages, `/fs/*` filesystem API, Telnet/SSH TTY servers, MCP server, and cron scheduler
- **AI surface**: Protected `POST /api/agent` route plus `MonkAgent` MCP tool, both backed by Anthropic when `ANTHROPIC_API_KEY` is configured
- **Distribution**: Compiles to standalone executable with no external dependencies

## Runtime Surfaces

Monk starts multiple surfaces from [src/index.ts](src/index.ts):

| Surface | Default | Purpose |
|---------|---------|---------|
| HTTP API | `PORT=9001` | Public, auth, data, model, app, filesystem, cron, and agent routes |
| Telnet TTY | `TELNET_PORT=2323` | Interactive Monk shell over Telnet |
| SSH TTY | `SSH_PORT=2222` | Interactive Monk shell over SSH |
| MCP server | `MCP_PORT=3001` | JSON-RPC MCP tools for auth, API calls, and agent invocation |
| Cron scheduler | PostgreSQL only | Runs scheduled tenant jobs from the cron/process tables |

## HTTP API Routes

### Public Routes (No Auth)

| Path | Purpose |
|------|---------|
| `/health` | Health check |
| `/auth/login` | Get JWT token |
| `/auth/register` | Create new tenant |
| `/auth/refresh` | Renew token |
| `/auth/tenants` | List registered tenants |
| `/docs/*` | Self-documenting API reference |

### Protected Routes (JWT Required)

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
| `/api/agent` | Headless AI agent execution |
| `/fs/*` | Tenant-scoped virtual filesystem access |

### Sudo Routes (Elevated Access)

Operations on protected models require a short-lived sudo token obtained via `POST /api/user/sudo`.

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

## Virtual Shell and Filesystem

Monk includes a tenant-scoped shell environment backed by the same system context as the HTTP API. It is reachable through the Telnet/SSH servers and reused by the headless agent.

The shell includes database-oriented commands such as `select`, `insert`, `update`, `delete`, `describe`, `aggregate`, and `find`, plus many Unix-like commands such as `ls`, `cat`, `grep`, `awk`, `sed`, `sort`, `head`, `tail`, and `wc`. Manual pages live under [monkfs/usr/share/man](monkfs/usr/share/man).

The HTTP filesystem API is exposed at `/fs/*` and requires authentication. It lets authenticated clients read, write, and delete files in the virtual filesystem.

## Headless Agent

`POST /api/agent` runs the Monk AI agent without an interactive terminal. It requires normal `/api/*` authentication and accepts a prompt:

```json
{
  "prompt": "what records changed in the last day",
  "maxTurns": 10
}
```

By default the route returns one JSON response. If the client sends `Accept: text/jsonl`, it streams agent events as JSON Lines.

The agent implementation lives in [src/lib/tty/headless.ts](src/lib/tty/headless.ts) and uses [src/lib/ai.ts](src/lib/ai.ts). It builds a tenant/user shell session, loads the system prompt from [monkfs/etc/agents/ai](monkfs/etc/agents/ai), and calls Anthropic's Messages API when `ANTHROPIC_API_KEY` is configured.

The agent can use tools to run shell commands, read files, and write files in the Monk session context. Treat this as privileged automation in production.

## MCP Integration

Monk currently starts a standalone MCP JSON-RPC server on `MCP_PORT`, default `3001`. It shares the Hono app internally so MCP tools can call the API without making network requests back into the service.

Built-in MCP tools:

- `MonkAuth` - register, login, refresh, and inspect MCP session auth state
- `MonkHttp` - call Monk HTTP routes with cached JWT injection
- `MonkAgent` - invoke the headless agent after authenticating through `MonkAuth`

There is not currently a first-class `/mcp` route on the main HTTP server. For hosted MCP on Railway, the intended cleanup is to mount MCP at `/mcp` on the main Hono app, advertise it from `/`, and keep the standalone port for local/internal use.

## Response Customization

All endpoints support query parameters for response formatting:

### Format Selection (`?format=`)

**Built-in:**
- `json` (default)
- `yaml`

**Optional packages** (install from `packages/formatter-*`):
- `toon` - Compact format for LLMs (30-40% smaller)
- `toml` - TOML format
- `csv` - Tabular export
- `msgpack` - Binary format (30-50% smaller)
- `markdown` - Markdown tables
- `grid-compact` - 60% smaller for Grid API
- `cbor`, `sqlite` - Additional package-backed encodings
- `brainfuck`, `morse`, `qr` - Novelty formats

### Field Extraction
- `?unwrap` - Remove `{success, data}` envelope
- `?select=field1,field2` - Return only specified fields

### Response Encryption
- `?encrypt=pgp` - AES-256-GCM encryption using JWT-derived key

## Multi-Tenant Architecture

- **PostgreSQL**: Tenants share a regional database (e.g., `us_east`) with isolation via schema/namespace
- **SQLite**: One file per tenant for portable, self-contained databases
- JWT contains tenant routing information
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

User and API-key management lives under `/api/user/*`. API keys are accepted by the authentication middleware through the supported API-key header flow.

## Cron and Background Work

Cron routes under `/api/cron/*` manage scheduled processes. The scheduler starts only in PostgreSQL mode because it depends on database-backed process tables.

On startup, the server initializes infrastructure, preloads observers, starts HTTP/TTY/MCP servers, and starts the cron scheduler when PostgreSQL is configured.

## Technology Stack

- **[Hono](https://hono.dev/)** - Web framework
- **TypeScript** - Language
- **PostgreSQL** or **SQLite** - Database backends
- **JWT** - Authentication
- **Bun** - Runtime (compiles to standalone executable)
- **Anthropic Messages API** - Optional AI/agent backend through `ANTHROPIC_API_KEY`

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
# Optional: only needed for /api/agent, TTY AI mode, and MonkAgent MCP
ANTHROPIC_API_KEY=...
```

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

- `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV` are required for production startup.
- `ANTHROPIC_API_KEY` enables `/api/agent`, TTY AI mode, and `MonkAgent`; do not configure it unless agent execution should be available.
- The headless agent can execute shell tools inside the authenticated Monk tenant context. Gate public use deliberately.
- MCP session storage is currently local/file-backed; this is acceptable for local development but should be revisited before relying on MCP sessions in a multi-instance deployment.
- The current MCP implementation listens on `MCP_PORT`; add a main-app `/mcp` route before treating MCP as part of the public Railway HTTP surface.

## Installation

**Prerequisites:** Bun 1.0+, PostgreSQL 12+ (or SQLite for standalone)

```bash
# Clone and install
git clone https://github.com/ianzepp/monk-api.git
cd monk-api
bun install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

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
# Register a tenant
curl -X POST http://localhost:9001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenant": "demo", "username": "root"}'

# Login and get token
curl -X POST http://localhost:9001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenant": "demo", "username": "root"}'

# Use the API
curl http://localhost:9001/api/describe \
  -H "Authorization: Bearer YOUR_TOKEN"
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
