# Monk API

Multi-tenant backend framework built with Hono and TypeScript. Provides model-first development, JWT authentication, ring-based observer system, and schema-isolated tenants.

## For AI Agents & Contributors

Read [AGENTS.md](./AGENTS.md) before starting any task.

## Project Overview

- **Language**: TypeScript with Hono framework
- **Database**: PostgreSQL (schema-per-tenant) or SQLite (file-per-tenant)
- **Authentication**: JWT tokens with three-tier access (public, user, root/sudo)
- **Architecture**: Ring-based observer system for business logic hooks
- **Distribution**: Compiles to standalone executable with no external dependencies

## API Routes

### Public Routes (No Auth)

| Path | Purpose |
|------|---------|
| `/health` | Health check |
| `/auth/login` | Get JWT token |
| `/auth/register` | Create new tenant |
| `/auth/refresh` | Renew token |
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

### Sudo Routes (Elevated Access)

Operations on protected models require a short-lived sudo token obtained via `POST /api/user/sudo`.

## App Packages

Additional functionality available as optional packages:

| Package | Path | Purpose |
|---------|------|---------|
| **MCP** | `/app/mcp` | Model Context Protocol for LLM agent integration |
| **Grids** | `/app/grids/:id/:range` | Excel-style spreadsheet operations with cell ranges |
| **Todos** | `/app/todos` | Example CRUD app demonstrating package pattern |

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

Ring-based execution model (rings 0-9) for predictable business logic:

1. Input validation
2. Business logic hooks
3. Database execution
4. Audit/tracking
5. External integrations

Observers attach to model operations (create, update, delete) at specific rings.

## Model Features

- **Field types**: text, integer, decimal, boolean, timestamp, date, uuid, jsonb, arrays
- **Constraints**: required, unique, default_value, minimum/maximum, pattern, enum_values
- **Protection**: sudo (requires elevated access), freeze (read-only), immutable (write-once)
- **Indexing**: btree indexes, full-text search (GIN)
- **Change tracking**: Field-level audit trails with old/new values

## Access Control

Four ACL arrays per record:
- `access_read` - Read permission
- `access_edit` - Edit permission
- `access_full` - Full access (read/edit/delete)
- `access_deny` - Explicit deny (overrides other permissions)

## Technology Stack

- **[Hono](https://hono.dev/)** - Web framework
- **TypeScript** - Language
- **PostgreSQL** or **SQLite** - Database backends
- **JWT** - Authentication
- **Bun** - Runtime (compiles to standalone executable)

---

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

## Documentation

| Document | Purpose |
|----------|---------|
| [DEVELOPER.md](DEVELOPER.md) | Architecture and development guide |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Debugging guide |
| [spec/README.md](spec/README.md) | Testing infrastructure |
| [src/routes/docs/PUBLIC.md](src/routes/docs/PUBLIC.md) | Complete API reference |
