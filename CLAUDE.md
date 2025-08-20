# Monk API (Hono) - System Pattern Architecture

## Overview
Lightweight PaaS backend API built with Hono, featuring System pattern architecture for clean per-request database context management.

## System Pattern Architecture

### Core Classes

#### **System Class (`src/lib/system.ts`)**
- **Purpose**: Per-request context management and database routing
- **Key Methods**:
  - `System.handleDb(context, fn)` - For read operations (no transaction)
  - `System.handleTx(context, fn)` - For write operations (with transaction)
  - `System.fromContext(context)` - Create System instance from Hono context

#### **Database Class (`src/lib/database.ts`)**
- **Purpose**: High-level database operations using System's database context
- **Constructor**: `new Database(system: System)`
- **Key Features**: Uses `this.system.dtx` for all database operations
- **Methods**: No tx/dtx parameters needed - all use system context

#### **Filter Class (`src/lib/filter.ts`)**
- **Purpose**: Advanced query filtering with System integration
- **Constructor**: `new Filter(system: System, schemaName, tableName)`
- **Execution**: Uses `this.system.databaseContext` for query execution

#### **Schema Class (`src/lib/schema.ts`)**
- **Purpose**: Schema operation proxies with System integration
- **Constructor**: `new Schema(system: System, schemaName, tableName, definition)`
- **Operations**: Uses `this.system.database.*` for all operations

### Route Handler Pattern

#### **Read Operations (handleDb):**
```typescript
export default async function (context: Context): Promise<any> {
    return await System.handleDb(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        return system.database.selectAny(schemaName);
    });
}
```

#### **Write Operations (handleTx):**
```typescript
export default async function (context: Context): Promise<any> {
    return await System.handleTx(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        const recordData = await context.req.json();
        return system.database.createOne(schemaName, recordData);
    });
}
```

## API Endpoints

### Authentication (`/auth/*`)
- `POST /auth/login` - Domain-based authentication (returns JWT)
- `POST /auth/refresh` - JWT token refresh
- `GET /auth/me` - Current user information

### Data Operations (`/api/data/*`) - Protected
- `GET /api/data/:schema` - List records (System.handleDb)
- `GET /api/data/:schema/:id` - Get specific record (System.handleDb)
- `POST /api/data/:schema` - Create record (System.handleTx)
- `PUT /api/data/:schema/:id` - Update record (System.handleTx)
- `DELETE /api/data/:schema/:id` - Delete record (System.handleTx)

### Meta Operations (`/api/meta/*`) - Protected
- `GET /api/meta/schema` - List schemas (System.handleDb)
- `GET /api/meta/schema/:name` - Get specific schema (System.handleDb)
- `POST /api/meta/schema` - Create schema (System.handleTx)
- `PUT /api/meta/schema/:name` - Update schema (System.handleTx)
- `DELETE /api/meta/schema/:name` - Delete schema (System.handleTx)

### Utility Endpoints
- `GET /ping` - Connectivity testing
- `GET /health` - Health check
- `POST /api/find/:schema` - Advanced search with filter DSL
- `POST /api/bulk` - Bulk operations (all use System.handleTx)

## Database Architecture

### Multi-Tenant Database Routing
- **JWT Domain Field**: Contains database name for request routing
- **Dynamic Connections**: Creates database connections on-demand per domain
- **System Integration**: Each request gets proper database context via System class

### Required Schema Tables
- **`schemas`**: Schema definitions and metadata
- **`columns`**: Individual field metadata and constraints
- **Dynamic Tables**: Created automatically when schemas are defined

### Database Pool Integration
- **Test Databases**: Automatically initialized with required schema tables
- **Isolation**: Each test domain gets its own database space
- **Pool Management**: Handled by monk CLI with automatic cleanup

## Development Workflow

### Local Development
```bash
# Start server
monk hono start

# Set up test database
monk test use monk_api_test_shared_dev

# Authenticate
monk auth login --domain monk_api_test_shared_dev

# Create schema
cat schema.yaml | monk meta create schema

# Create data
echo '{"name":"test"}' | monk data create user_schema
```

### Testing Workflow
```bash
# Test current main branch
monk test run main

# Test feature branch
monk test run feature/API-123

# Compare versions
monk test diff main feature/API-123

# Run specific test categories
monk test all 20-30  # Meta and Data API tests
```

## Key Benefits

### System Pattern Advantages
- **Clean Context Management**: Each request gets proper database context
- **No Singleton Issues**: Multiple databases can be accessed simultaneously
- **Transaction Boundaries**: Clear separation between read and write operations
- **Type Safety**: Full TypeScript support with proper context typing

### Multi-Tenant Architecture
- **Database Isolation**: Each JWT domain routes to separate database
- **Concurrent Testing**: Multiple test environments can run simultaneously
- **Resource Management**: Efficient connection pooling per database

### Developer Experience
- **Global CLI**: Available anywhere via `npm link`
- **Auto-Configuration**: Tests automatically detect server and database settings
- **Git Integration**: Version comparison and incremental builds
- **Comprehensive Testing**: Structured test organization with clear progression

This architecture provides a robust foundation for API development with proper context management and comprehensive testing capabilities.