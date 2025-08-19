# Monk API (Hono)

Lightweight PaaS backend API built with Hono, providing dynamic REST endpoints for data and schema management.

## Features

- **Hono Framework**: Ultra-lightweight (~50KB) API framework
- **Dynamic Schema Management**: Runtime schema creation and modification
- **PostgreSQL**: Async database operations with Drizzle ORM
- **Type Safety**: Full TypeScript with Zod validation
- **Programmatic CLI**: Compatible with `monk-cli` project
- **Multi-runtime**: Can deploy to Node.js, Bun, Deno, Cloudflare Workers

## Tech Stack

- **Hono** - Lightweight web framework
- **TypeScript** - Type safety
- **PostgreSQL** - Database
- **Drizzle ORM** - Database operations
- **Zod** - Runtime validation
- **Node.js** - Runtime (deployable to others)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Set up database
npm run db:generate
npm run db:migrate

# Seed with schemas
npm run db:seed

# Start development server
npm run dev
```

## API Endpoints

### Health & Info
- `GET /health` - Health check
- `GET /` - API info

### Data Operations (Coming Soon)
- `GET /api/data/:schema` - List records
- `POST /api/data/:schema` - Create record
- `GET /api/data/:schema/:id` - Get record
- `PUT /api/data/:schema/:id` - Update record
- `DELETE /api/data/:schema/:id` - Delete record

### Schema Management (Coming Soon)
- `GET /api/meta/schema` - List schemas
- `POST /api/meta/schema` - Create schema
- `GET /api/meta/schema/:name` - Get schema
- `PUT /api/meta/schema/:name` - Update schema
- `DELETE /api/meta/schema/:name` - Delete schema

## CLI Integration

Works with the `monk-cli` project:

```bash
export CLI_BASE_URL=http://localhost:3001
monk data list account
```

## Development

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Database operations
npm run db:generate    # Generate migrations
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio
npm run db:seed        # Seed with metadata schemas
npm run db:clean       # Clean database
```

## Performance

Hono provides significant performance improvements over Next.js for API-only workloads:

- **Faster cold starts**: ~10x improvement
- **Lower memory usage**: ~5x reduction  
- **Better throughput**: ~3x more requests/second
- **Smaller bundle**: ~50KB vs Next.js ~2MB

## Deployment

Can be deployed to multiple runtimes:

- **Node.js**: Current setup
- **Bun**: Replace `@hono/node-server` with Bun's built-in server
- **Deno**: Use Deno runtime with minimal changes
- **Cloudflare Workers**: Edge deployment with Hono's CF Workers adapter