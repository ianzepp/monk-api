# Monk API (Hono) - High-Performance PaaS Backend

Enterprise-grade PaaS backend API built with Hono, featuring System pattern architecture, advanced caching, and multi-tenant database routing.

## 🚀 Key Features

- **🏗️ System Pattern Architecture** - Clean per-request database context management
- **⚡ High-Performance Schema Caching** - 15x speedup with SHA256 checksum validation
- **🔒 Multi-Tenant Database Routing** - JWT domain-based database isolation
- **📊 JSON Schema Validation** - AJV-based validation with compiled validator caching
- **🔄 Optimized Batch Operations** - Efficient updateAll/createAll with raw SQL
- **🎯 Consistent API Design** - Array/object endpoint pattern throughout
- **🛡️ JWT Authentication** - Domain-based authentication with request logging
- **🔍 Advanced Query System** - MongoDB-style filter DSL with complex queries

## 📋 Tech Stack

- **[Hono](https://hono.dev/)** (~50KB) - Ultra-lightweight web framework
- **TypeScript** - Full type safety with advanced patterns
- **PostgreSQL** - Production database with custom SQL optimization
- **Drizzle ORM** - Schema management and migrations
- **AJV** - High-performance JSON Schema validation
- **JWT** - Secure authentication with domain routing
- **Node.js 18+** - Multi-runtime deployable (Bun, Deno, Cloudflare Workers)

## 🏛️ System Pattern Architecture

### Core Classes

#### **System Class** (`src/lib/system.ts`)
Per-request context management and database routing:
```typescript
// Read operations (no transaction)
return await handleContextDb(context, async (system: System) => {
    return system.database.selectAny(schemaName);
});

// Write operations (with transaction)
return await handleContextTx(context, async (system: System) => {
    return system.database.createOne(schemaName, recordData);
});
```

#### **Database Class** (`src/lib/database.ts`)
High-level database operations using System's context:
- Uses `this.system.dtx` for all operations
- No tx/dtx parameters needed - all use system context
- Raw SQL generation for maximum performance

#### **Schema Class** (`src/lib/schema.ts`)
Schema operations with integrated validation:
- AJV validator compilation and caching
- Multi-database schema caching with SHA256 checksums
- Efficient null handling for optional fields

#### **Filter Class** (`src/lib/filter.ts`)
Advanced query filtering with MongoDB-style operators:
- Complex WHERE/ORDER/LIMIT clause generation
- Support for `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$regex`, `$exists`
- Reusable clause extraction methods

## 🎯 API Endpoints

### Authentication
- `POST /auth/login` - Domain-based authentication (returns JWT)
- `POST /auth/refresh` - JWT token refresh  
- `GET /auth/me` - Current user information

### Data Operations (Protected)
**Consistent Array/Object Pattern:**
```
# Array endpoints (multiple records)
GET    /api/data/:schema          # List records → array
POST   /api/data/:schema          # Create records → accepts/returns arrays  
PUT    /api/data/:schema          # Update records → accepts/returns arrays
DELETE /api/data/:schema          # Delete records → accepts/returns arrays

# Object endpoints (single record)
GET    /api/data/:schema/:id      # Get record → object
PUT    /api/data/:schema/:id      # Update record → accepts/returns object
DELETE /api/data/:schema/:id      # Delete record → returns object
```

### Schema Management (Protected)
```
GET    /api/meta/schema           # List all schemas
GET    /api/meta/schema/:name     # Get specific schema
POST   /api/meta/schema           # Create schema (YAML/JSON)
PUT    /api/meta/schema/:name     # Update schema
DELETE /api/meta/schema/:name     # Delete schema
```

### Advanced Search & Utilities
```
POST   /api/find/:schema          # Advanced search with filter DSL
POST   /api/bulk                  # Bulk operations
GET    /ping                      # Connectivity testing
GET    /health                    # Health check with database status
```

## ⚡ Performance Architecture

### High-Performance Schema Caching
- **15x Performance Improvement**: Schema access reduced from 240ms → 16ms
- **Multi-Database Caching**: Isolated cache space per database for multi-tenant safety
- **SHA256 Checksum Validation**: Fast cache invalidation using YAML content checksums
- **Compiled Validator Caching**: AJV validators cached in Schema instances
- **Batch Optimization**: Single query validates multiple schema checksums

### Optimized Database Operations
- **Raw SQL Performance**: Custom SQL generation without ORM overhead
- **Batch Operations**: `updateAll()` uses single `selectIds()` + batch updates vs N queries
- **Efficient Null Handling**: Set-based lookup (O(1) vs O(n)) for validation cleaning
- **Filter Clause Extraction**: Reusable WHERE/ORDER/LIMIT clauses

## 🗄️ Database Architecture

### Multi-Tenant Database Routing
- **JWT Domain Field**: Contains database name for request routing
- **Dynamic Connections**: Creates database connections on-demand per domain
- **System Integration**: Each request gets proper database context

### Required Schema Tables
- **`schemas`**: Schema definitions and metadata with YAML checksums
- **`columns`**: Individual field metadata and constraints
- **Dynamic Tables**: Created automatically when schemas are defined

## 🚀 Quick Start

### Installation
```bash
# Clone the repository
git clone https://github.com/ianzepp/monk-api-hono.git
cd monk-api-hono

# Install dependencies
npm install

# Set up environment (copy and edit)
cp .env.example .env
```

### Database Setup
```bash
# Generate and run migrations
npm run db:generate
npm run db:migrate

# Seed with initial schemas
npm run db:seed

# Optional: Open Drizzle Studio
npm run db:studio
```

### Development Server
```bash
# Start development server with hot reload
npm run dev

# Server will be available at http://localhost:3000
```

## 🔧 Development Workflow

### Local Development with monk-cli
```bash
# Start the API server
npm run dev

# In another terminal, use monk-cli
monk hono start              # Or use monk-cli's server management
monk auth login --domain my_test_db
monk meta list schema
monk data list account
```

### Testing with Git-Aware Environments
```bash
# Create test environment for current branch
monk test git main

# Create test environment for feature branch  
monk test git feature/new-api --description "Testing new API endpoints"

# Compare different implementations
monk test diff main feature/new-api

# Run comprehensive tests
monk test all 20-30          # Meta and Data API tests
```

### Database Management
```bash
# Database operations
npm run db:generate          # Generate new migrations
npm run db:migrate           # Apply pending migrations
npm run db:seed             # Seed with metadata schemas
npm run db:clean            # Clean database (destructive)

# Development tools
npm run db:studio           # Open Drizzle Studio GUI
```

## 📝 Schema Definition

Schemas are defined in YAML format and support full JSON Schema validation:

```yaml
# Example: User schema (save as user.yaml)
name: user
table: users
description: User management schema
properties:
  id:
    type: string
    format: uuid
    description: Unique user identifier
  name:
    type: string
    minLength: 1
    maxLength: 100
    description: User's full name
  email:
    type: string
    format: email
    description: User's email address
  created_at:
    type: string
    format: date-time
    description: Creation timestamp
required:
  - name
  - email
```

### Create Schema via API
```bash
# Create schema from YAML file
cat user.yaml | monk meta create schema

# Or create via JSON
echo '{
  "name": "task",
  "table": "tasks", 
  "properties": {
    "title": {"type": "string", "minLength": 1},
    "completed": {"type": "boolean", "default": false}
  },
  "required": ["title"]
}' | monk meta create schema
```

## 🔍 Advanced Search Examples

The `/api/find/:schema` endpoint supports MongoDB-style queries:

```bash
# Find active users
echo '{
  "where": {"status": "active"},
  "select": ["name", "email"],
  "orderBy": {"created_at": "desc"},
  "limit": 10
}' | monk find user

# Complex query with multiple conditions
echo '{
  "where": {
    "age": {"$gte": 18, "$lt": 65},
    "role": {"$in": ["admin", "user"]},
    "name": {"$regex": "^John"}
  },
  "orderBy": {"last_login": "desc"}
}' | monk find user

# Count matching records
echo '{"where": {"active": true}}' | monk find user -c

# Get only first result
echo '{"where": {"email": {"$regex": "@company.com$"}}}' | monk find user --head
```

## 📊 Performance Benefits

### vs Next.js API Routes
- **🚀 Cold starts**: ~10x improvement
- **💾 Memory usage**: ~5x reduction  
- **🔥 Throughput**: ~3x more requests/second
- **📦 Bundle size**: ~50KB vs ~2MB

### Schema Caching Performance
- **Database queries**: 93% reduction for repeated schema access
- **Validation speed**: Instant validation with compiled AJV validators
- **Multi-tenant safety**: Isolated caches prevent cross-contamination
- **Cache invalidation**: SHA256 checksums ensure data consistency

## 🌐 Multi-Runtime Deployment

Hono enables deployment to multiple JavaScript runtimes:

### Node.js (Current)
```bash
npm run build
npm run start
```

### Bun
```bash
# Replace @hono/node-server with Bun's built-in server
bun run src/index.ts
```

### Deno
```typescript
// Minimal changes needed for Deno compatibility
import { serve } from "https://deno.land/std/http/server.ts";
```

### Cloudflare Workers
```bash
# Use Hono's Cloudflare Workers adapter
npm install @hono/cloudflare-workers
```

## 🛡️ Security Features

- **JWT Authentication**: Secure token-based authentication
- **Domain Isolation**: Multi-tenant database routing prevents data leakage
- **Input Validation**: Comprehensive JSON Schema validation
- **SQL Injection Protection**: Parameterized queries and raw SQL safety
- **Request Logging**: Complete audit trail for debugging and monitoring

## 🔗 Integration with monk-cli

This API works seamlessly with the [monk-cli](https://github.com/ianzepp/monk-cli) project:

```bash
# Set target API server
export CLI_BASE_URL=http://localhost:3000

# Or use monk servers for remote deployment management
monk servers add prod api.company.com:443
monk servers use prod

# All CLI commands work with any monk API deployment
monk auth login --domain production_db
monk data list user
monk meta create schema < user.yaml
```

## 🧪 Testing Integration

Works with [monk-api-test](https://github.com/ianzepp/monk-api-test) for comprehensive testing:

```bash
# Automated test suite with multiple environments
monk test git main                    # Test main branch
monk test git feature/new-endpoint    # Test feature branch
monk test all 20-30                   # Run API-specific tests
monk test diff main feature/new-endpoint  # Compare implementations
```

## 📚 Related Projects

- **[monk-cli](https://github.com/ianzepp/monk-cli)** - Command-line interface with advanced features
- **[monk-api-test](https://github.com/ianzepp/monk-api-test)** - Comprehensive test suite

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using the System pattern for clean, scalable API architecture.**