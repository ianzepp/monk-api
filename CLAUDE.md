# Monk API (Hono) - System Pattern Architecture

## Overview
Lightweight PaaS backend API built with Hono, featuring System pattern architecture for clean per-request database context management.

## Key Features
- **High-Performance Schema Caching**: Multi-database schema caching with SHA256 checksum-based invalidation
- **JSON Schema Validation**: Complete AJV-based validation with compiled validator caching  
- **Optimized Batch Operations**: Efficient updateAll/createAll/deleteAll with batch database queries
- **Consistent API Design**: Array/object endpoint pattern (with ID = object, without ID = array)
- **Raw SQL Performance**: Custom SQL generation for maximum performance without ORM overhead
- **Multi-Tenant Architecture**: Per-request database context with domain-based routing
- **Request Logging**: Comprehensive request/error logging for debugging visibility

## System Pattern Architecture

### Core Classes

#### **System Class (`src/lib/system.ts`)**
- **Purpose**: Per-request context management and database routing
- **Key Methods**:
  - `handleContextDb(context, fn)` - For read operations (no transaction)
  - `handleContextTx(context, fn)` - For write operations (with transaction)
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
    return await handleContextDb(context, async (system: System) => {
        const schemaName = context.req.param('schema');
        return system.database.selectAny(schemaName);
    });
}
```

#### **Write Operations (handleTx):**
```typescript
export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system: System) => {
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
**Consistent Array/Object Pattern:**
- `GET /api/data/:schema` - List records → Returns array (handleContextDb)
- `POST /api/data/:schema` - Create records → Accepts/returns arrays (handleContextTx)  
- `PUT /api/data/:schema` - Update records → Accepts/returns arrays (handleContextTx)
- `DELETE /api/data/:schema` - Delete records → Accepts/returns arrays (handleContextTx)
- `GET /api/data/:schema/:id` - Get specific record → Returns object (handleContextDb)
- `PUT /api/data/:schema/:id` - Update record → Accepts/returns object (handleContextTx)
- `DELETE /api/data/:schema/:id` - Delete record → Returns object (handleContextTx)

### Meta Operations (`/api/meta/*`) - Protected
- `GET /api/meta/schema` - List schemas (handleContextDb)
- `GET /api/meta/schema/:name` - Get specific schema (handleContextDb)
- `POST /api/meta/schema` - Create schema (handleContextTx)
- `PUT /api/meta/schema/:name` - Update schema (handleContextTx)
- `DELETE /api/meta/schema/:name` - Delete schema (handleContextTx)

### Utility Endpoints
- `GET /ping` - Connectivity testing
- `GET /health` - Health check
- `POST /api/find/:schema` - Advanced search with filter DSL
- `POST /api/bulk` - Bulk operations (all use handleContextTx)

## Performance Architecture

### High-Performance Schema Caching
- **Multi-Database Caching**: Each database gets isolated cache space for multi-tenant safety
- **SHA256 Checksum Validation**: Fast cache invalidation using YAML content checksums
- **15x Performance Improvement**: Schema access reduced from 240ms → 16ms via caching
- **Compiled Validator Caching**: AJV validators cached in Schema instances for instant validation
- **Batch Optimization**: Single query validates multiple schema checksums simultaneously

### Optimized Database Operations
- **Raw SQL Performance**: Custom SQL generation without ORM overhead for maximum speed
- **Batch Operations**: `updateAll()` uses single `selectIds()` + batch updates vs N individual queries
- **Efficient Null Handling**: Optional field null values cleaned before validation (Set-based lookup)
- **Filter Clause Extraction**: Reusable WHERE/ORDER/LIMIT clauses via `getWhereClause()` methods

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

# Create test tenant
monk tenant create shared-dev

# Authenticate
monk auth login shared-dev root

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
- Use 15s as a bash timeout