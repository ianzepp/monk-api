# Monk API Developer Guide

## Overview

Monk API is a lightweight PaaS backend API built with **Hono** and **TypeScript**, featuring a **System pattern architecture** for clean per-request database context management. The project includes both a **Hono-based API server** and a **bashly-generated CLI** for comprehensive data management.

## Quick Start

### Prerequisites
- **Node.js 18+** and npm
- **PostgreSQL** server running and accessible
- **Ruby 3.0+** (for bashly CLI development)
- **jq** (for JSON processing in CLI and tests)

### Fresh Environment Setup
```bash
# 1. Clone and setup
git clone https://github.com/ianzepp/monk-api.git
cd monk-api

# 2. Automated setup (handles everything)
npm run autoinstall

# 3. Start development server
npm run start:dev

# 4. Verify installation
npm run test:one tests/10-connection/basic-ping-test.sh
```

The `npm run autoinstall` script handles all setup steps automatically:
- Verifies PostgreSQL connectivity
- Creates auth database (`monk-api-auth`) with tenant table
- Configures local server in `~/.config/monk/servers.json`
- Creates test tenant (`local-test`) for development
- Compiles TypeScript and verifies complete setup

## Project Architecture

### Core Components

#### **Hono API Server** (`src/`)
- **Observer-Driven Architecture**: Universal business logic execution through ring-based observer pipeline
- **Path-Based Route Structure**: Intuitive file organization where file path = URL path
- **Middleware Pattern**: System context and response formatting through clean middleware chain
- **Multi-tenant**: JWT-based database routing with auth database validation
- **High Performance**: Schema caching, bulk operations, selective ring execution, parameterized SQL
- **Security**: SQL injection prevention, ACL enforcement, soft deletes, observer-based validation and audit
- **Structured Logging**: Environment-aware logging with correlation tracking and rich metadata

#### **Bashly CLI** (`cli/`)
- **Generated CLI**: Source in `cli/src/`, compiled to `cli/monk`
- **Persistent Config**: Uses `~/.config/monk/` for servers, auth, and test config
- **Multi-server**: Switch between development, staging, production environments
- **Full CRUD**: Complete data and meta operations matching API endpoints

#### **Observer System** (`src/lib/observers/`, `src/observers/`)
- **Ring-Based Execution**: 10 ordered rings (0-9) for structured business logic execution
- **executeOne() Pattern**: Simplified per-record processing for field validation observers
- **Universal Coverage**: All database operations automatically run through observer pipeline
- **File-Based Discovery**: Observers organized by schema and ring number for easy management
- **Extensible Business Logic**: Add validation, security, audit, integration without touching core code
- **Clean Architecture**: BaseObserver pattern with consistent error handling and logging

#### **Test Suite** (`tests/`)
- **Three-layer Architecture**: test-all.sh → test-one.sh → individual tests
- **Tenant Isolation**: Each test gets fresh tenant database  
- **Pattern-based**: Organized by categories (05-infrastructure, 15-auth, etc.)
- **Comprehensive**: Authentication, meta API, data API, integration tests

### Observer-Driven Architecture

#### **System Class** (`src/lib/system.ts`)
- **Per-request context**: Created by `systemContextMiddleware` and attached to `context.get('system')`
- **Database routing**: JWT-based multi-tenant database context management
- **Service Integration**: Provides system.database.* and system.metabase.* unified APIs
- **Structured Logging**: Built-in system.info() and system.warn() with automatic correlation tracking
- **Dependency Injection**: Provides SystemContext interface to break circular dependencies

#### **Database Class** (`src/lib/database.ts`)  
- **Observer Integration**: All operations run through universal observer pipeline
- **Single→Array→Pipeline**: Consistent pattern across all CRUD methods
- **Recursion Protection**: `SQL_MAX_RECURSION = 3` prevents infinite observer loops
- **Universal Coverage**: createOne, updateOne, deleteOne, selectOne, revertOne all use observers
- **Parameterized SQL**: Secure queries using Filter.toSQL() pattern with PostgreSQL placeholders

#### **Metabase Class** (`src/lib/metabase.ts`)
- **Schema Definition Management**: Clean CRUD operations for schema YAML definitions
- **Consistent Patterns**: Follows Database class architecture (createOne, selectOne, updateOne, deleteOne)
- **Transaction Management**: Clean begin/commit/rollback pattern with run() method
- **DDL Generation**: Automatic PostgreSQL table creation from JSON Schema
- **System Integration**: Available via system.metabase.* for consistency with system.database.*

#### **Observer System** (`src/lib/observers/`)
- **Ring-Based Execution**: 10 ordered rings (0-9) with selective execution per operation type
- **BaseObserver Pattern**: executeTry/execute separation with comprehensive error handling
- **SqlObserver (Ring 5)**: Handles direct SQL execution using `system.dtx.query()`
- **File-Based Discovery**: Auto-loads observers from `src/observers/schema/ring/observer.ts`

#### **Logging System** (`src/lib/logger.ts`)
- **Universal Logger**: Standalone Logger class available anywhere via import
- **System Integration**: system.info() and system.warn() with automatic request context
- **Environment-Aware**: Pretty development logs, structured JSON for production
- **Correlation Tracking**: Automatic correlation IDs for request debugging
- **Rich Metadata**: Structured logging with tenant, operation, and timing context

#### **Middleware Architecture** (`src/lib/middleware/`)
- **systemContextMiddleware**: Universal System setup and global error handling
- **responseJsonMiddleware**: Automatic JSON formatting for `/api/data/*` routes  
- **responseYamlMiddleware**: Enhanced YAML formatting with automatic error handling for `/api/meta/*` routes
- **Clean Route Handlers**: Direct `context.get('system').database.*()` access

#### **Auth System** (`src/lib/auth.ts`, `src/routes/auth.ts`)
- **Multi-tenant auth**: Validates tenants against `monk-api-auth` database
- **JWT routing**: Tokens contain tenant and database routing information
- **User management**: Per-tenant user authentication and access control

## Documentation Reference

For detailed technical documentation, refer to these specialized guides:

### **📁 [docs/FTP.md](docs/FTP.md)** - FTP Middleware
- **Complete API Reference**: All `/ftp/*` endpoints with detailed examples
- **Request/Response Formats**: Full JSON schemas and TypeScript interfaces
- **Advanced Features**: Transaction management, wildcard patterns, caching
- **Testing Examples**: Unit tests, integration tests, manual curl commands

### **📁 [docs/FILTER.md](docs/FILTER.md)** - Filter System
- **Operator Reference**: 25+ operators with detailed examples and SQL generation
- **PostgreSQL Arrays**: ACL operations ($any, $all, $nany, $nall, $size)
- **Logical Operations**: Deep nesting with $and, $or, $not, $nand, $nor
- **Performance Patterns**: Complex queries, parameter management, optimization

### **🔄 Future Documentation**
- **docs/API.md** - REST API endpoints and patterns
- **docs/Observer.md** - Observer system development guide  
- **docs/Testing.md** - Comprehensive testing guide

> **Quick Reference**: This DEVELOPER.md file focuses on architecture overviews, development workflows, and quick command references. For detailed syntax, JSON schemas, and comprehensive examples, see the specialized docs/ files.

## Development Workflows

### API Development

#### **Starting Development Server**
```bash
# Development with auto-reload
npm run start:dev

# Production build and start
npm run compile && npm run start

# API-only development (port 9001)
npm run api:dev
```

#### **Database Management**
```bash
# Create new tenant
monk tenant create my-tenant

# Use tenant  
monk tenant use my-tenant

# Authenticate with tenant
monk auth login my-tenant root

# Test connectivity
monk ping
```

#### **Schema Development**
```bash
# Create schema from YAML
cat schema.yaml | monk meta create schema

# List schemas
monk meta list schema

# Delete schema
monk meta delete schema schema-name
```

### Observer Development

#### **Observer Ring System**
The observer system executes business logic in **10 ordered rings (0-9)** for every database operation:

```typescript
// Ring allocation and execution order
Ring 0: DataPreparation // Data loading, merging, input preparation
Ring 1: InputValidation // Schema validation, format checks, basic integrity
Ring 2: Security        // Access control, protection policies, rate limiting
Ring 3: Business        // Complex business logic, domain rules, workflows
Ring 4: Enrichment      // Data enrichment, defaults, computed fields
Ring 5: Database        // 🎯 SQL EXECUTION (SqlObserver)
Ring 6: PostDatabase    // Immediate post-database processing
Ring 7: Audit           // Audit logging, change tracking, compliance
Ring 8: Integration     // External APIs, webhooks, cache invalidation (async)
Ring 9: Notification    // User notifications, email alerts, real-time updates (async)
```

#### **Async Observer Architecture**

**Purpose**: Non-blocking execution for post-database operations that don't need to block API responses
- **Rings 6-9**: Perfect candidates for async execution (PostDatabase, Audit, Integration, Notification)
- **External operations**: Webhooks, email sending, cache clearing, audit logging
- **Error isolation**: Async failures don't trigger transaction rollback or affect committed data

**BaseAsyncObserver Usage**:
```typescript
import { BaseAsyncObserver } from '@lib/observers/base-async-observer.js';

export default class NotificationSender extends BaseAsyncObserver {
    ring = ObserverRing.Notification;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        // This executes asynchronously - doesn't block API response
        await this.sendEmailNotification(context.result);
        await this.sendPushNotification(context.result);
    }
}
```

**Async Execution Benefits**:
- ✅ **Faster responses**: External operations don't block API response
- ✅ **Error isolation**: Async failures logged via `system.warn()`, don't affect committed data
- ✅ **Timeout protection**: 10s default timeout for external service operations
- ✅ **Transaction safety**: Executes outside transaction context after commit

#### **Execution Profiling**

**Automatic Performance Monitoring**: All observers automatically tracked with nanosecond precision
- **Per-observer timing**: `[TIME] Observer: JsonSchemaValidator 23.527ms { ring: 1, operation: "create" }`
- **Async observer timing**: `[TIME] AsyncObserver: WebhookSender 156.789ms { ring: 8, status: "success" }`
- **Rich context**: Ring, operation, schema, success/failure status in timing logs

**Profiling Output Examples**:
```
[TIME] Observer: RecordPreloader 1.291ms { ring: 0, operation: "update", schemaName: "users", status: "success" }
[TIME] Observer: JsonSchemaValidator 0.090ms { ring: 1, operation: "update", schemaName: "users", status: "success" }
[TIME] Observer: SqlObserver 3.257ms { ring: 5, operation: "update", schemaName: "users", status: "success" }
[TIME] AsyncObserver: CacheInvalidator 1.625ms { ring: 8, operation: "update", status: "success" }
```

**Performance Analysis Enabled**:
- **Bottleneck identification**: Immediately see which observers are slow
- **Ring performance**: Understand time distribution across observer rings
- **Schema compilation caching**: See JsonSchemaValidator performance improve with caching
- **Database efficiency**: Monitor SQL operation timing and optimization opportunities

#### **Creating New Observers**
```bash
# 1. Create observer file in appropriate directory
src/observers/users/0/custom-validation.ts     # User schema, validation ring
src/observers/all/7/audit-logger.ts            # All schemas, audit ring

# 2. Choose appropriate base class and implement business logic

# Synchronous Observer (Rings 0-5: blocking execution)
export default class CustomValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const { system, schema, schemaName, data, metadata } = context;
        
        // Use preloaded data from RecordPreloader (Ring 0) for efficiency
        const existingRecords = RecordPreloader.getPreloadedRecords(context);
        
        for (const record of data) {
            // Access Schema object for validation
            schema.validateOrThrow(record);
            
            if (!this.isValid(record)) {
                throw new ValidationError('Invalid data', 'field');
            }
        }
        
        // Record validation metadata for audit
        metadata.set('custom_validation', 'passed');
        system.info('Custom validation completed', { schemaName, recordCount: data.length });
    }
}

# Asynchronous Observer (Rings 6-9: non-blocking execution)
export default class EmailNotifier extends BaseAsyncObserver {
    ring = ObserverRing.Notification;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        const { operation, schemaName, result } = context;
        
        // This executes asynchronously after database commit
        // Failures are logged but don't affect the API response
        await this.sendEmailNotification({
            event: `${schemaName}.${operation}`,
            data: result,
            timestamp: new Date()
        });
    }
}

# 3. Observer auto-discovery loads it at server startup
npm run start:dev  # Observer system loads new observer automatically
```

#### **Observer File Organization**
```
src/observers/:schema/:ring/:observer-name.ts

Phase 1+2 Examples (Data Integrity Pipeline):
src/observers/all/0/record-preloader.ts        # Ring 0: Data preparation, record preloading
src/observers/all/0/update-merger.ts           # Ring 0: Data preparation, update merging  
src/observers/all/0/input-sanitizer.ts         # Ring 0: Data preparation, input sanitization
src/observers/all/1/json-schema-validator.ts   # Ring 1: Input validation, JSON schema validation
src/observers/all/1/system-schema-protector.ts # Ring 1: Input validation, system schema protection
src/observers/all/1/required-fields.ts         # Ring 1: Input validation, required field checks
src/observers/all/2/soft-delete-protector.ts   # Ring 2: Security, soft delete protection
src/observers/all/2/existence-validator.ts     # Ring 2: Security, record existence validation
src/observers/all/4/uuid-array-processor.ts    # Ring 4: Enrichment, PostgreSQL UUID arrays
src/observers/all/7/change-tracker.ts          # Ring 7: Audit, change tracking (sync)
src/observers/all/8/cache-invalidator.ts       # Ring 8: Integration, cache invalidation (async)
src/observers/all/8/webhook-sender.ts          # Ring 8: Integration, webhook notifications (async)

Custom Examples:
src/observers/user/1/email-validation.ts       # Ring 1: User schema, email validation
src/observers/account/3/balance-validator.ts   # Ring 3: Account schema, business logic  
src/observers/all/7/change-tracker.ts          # Ring 7: All schemas, audit tracking
```

#### **Schema Targeting**
- **Specific schema**: `src/observers/users/` → Only applies to "users" schema
- **All schemas**: `src/observers/all/` → Applies to every schema
- **Auto-discovery**: Observer system loads all observers at server startup

#### **Observer Error Handling**
```typescript
// BaseObserver provides executeTry/execute pattern
abstract class BaseObserver {
    async executeTry(context) { /* Error handling, timeouts, logging */ }
    abstract async execute(context) { /* Pure business logic */ }
}

// Error types for proper handling
throw new ValidationError('Invalid email', 'email');     // User feedback
throw new BusinessLogicError('Insufficient balance');    // Business rules  
throw new SystemError('External API failed');           // Transaction rollback
```

### CLI Development

#### **Bashly Workflow**
The CLI is generated from source files using **bashly**:

```bash
# Install bashly
gem install bashly

# Regenerate CLI from sources (after changes)
cd cli/src
bashly generate

# The generated CLI is: cli/monk
# Test the CLI
../monk --help
```

#### **CLI Source Structure**
```
cli/src/
├── bashly.yml                    # CLI command definitions
├── lib/common.sh                 # Shared utilities and functions
├── auth_*_command.sh            # Authentication commands
├── data_*_command.sh            # Data CRUD commands  
├── meta_*_command.sh            # Schema management commands
├── servers_*_command.sh         # Server management commands
├── tenant_*_command.sh          # Tenant management commands
└── test_*_command.sh            # Testing commands
```

#### **Adding New CLI Commands**
1. **Update bashly.yml**: Add command definition
2. **Create command script**: `new_command.sh` with implementation
3. **Regenerate CLI**: Run `bashly generate`
4. **Test**: Verify new command works correctly

### Testing Development

#### **Test Architecture**
```bash
# Layer 1: Pattern matching and orchestration
npm run test:all [pattern]        # scripts/test-all.sh

# Layer 2: Tenant lifecycle management  
npm run test:one <test-file>      # scripts/test-one.sh

# Layer 3: Individual test files
tests/15-authentication/basic-auth-test.sh
```

#### **Writing New Tests**
```bash
# 1. Create test file in appropriate category
tests/25-new-feature/my-test.sh

# 2. Use standard pattern
#!/bin/bash
set -e

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"
source "$(dirname "$0")/../auth-helper.sh"

# Test implementation with auth_as_user "root"
# Use $TEST_TENANT_NAME (provided by test-one.sh)

# 3. Make executable
chmod +x tests/25-new-feature/my-test.sh

# 4. Test individually
npm run test:one tests/25-new-feature/my-test.sh

# 5. Test with pattern
npm run test:all 25
```

#### **Test Categories**
- **05-infrastructure**: Server config, basic connectivity
- **10-connection**: Database connectivity, ping tests
- **15-authentication**: Auth flows, JWT, multi-user scenarios
- **20-meta-api**: Schema management, meta operations
- **30-data-api**: CRUD operations, data validation
- **50-integration**: End-to-end workflows  
- **60-lifecycle**: Record lifecycle, soft deletes
- **70-validation**: Schema validation, constraints

### Git-based Testing

#### **Testing Different Branches**
```bash
# Create isolated git test environment
monk test git main                # Test main branch
monk test git feature/new-api     # Test feature branch
monk test git main abc123def      # Test specific commit

# Each creates isolated environment in /tmp/monk-builds/
# With independent database, server, and configuration
```

#### **Test Environment Management**
```bash
# The monk test git command:
# 1. Clones repo to /tmp/monk-builds/<run-name>/
# 2. Checks out specified branch/commit
# 3. Runs npm install && npm run compile  
# 4. Allocates port and creates isolated config
# 5. Updates ~/.config/monk/test.json with run info

# Then manually run tests in environment:
cd /tmp/monk-builds/main-12345678/monk-api
npm run test:one tests/specific-test.sh
```

## Configuration Management

### **User Configuration** (`~/.config/monk/`)
- **servers.json**: Server registry with current server selection
- **env.json**: Environment variables (DATABASE_URL, NODE_ENV, PORT)  
- **test.json**: Test run history and configuration

### **Server Management**
```bash
# Add servers
monk servers add local localhost:9001
monk servers add staging api-staging.example.com:443

# Switch servers (persistent)
monk servers use staging
monk servers current

# All subsequent monk commands use selected server
monk ping                         # Pings staging server
monk data list account            # Lists from staging database
```

### **Multi-tenant Architecture**
- **Auth Database**: `monk-api-auth` contains tenant registry
- **Tenant Databases**: `monk-api$tenant-name` for each tenant
- **JWT Routing**: Tokens contain tenant and database routing information
- **Isolation**: Each tenant gets separate database and user management

## API Endpoints & Patterns

### **Path-Based Route Structure**
Routes follow intuitive file organization where file path directly maps to URL path:
```
/routes/data/:schema/POST.ts        → POST /api/data/:schema
/routes/data/:schema/:id/GET.ts     → GET /api/data/:schema/:id
/routes/meta/schema/:name/PUT.ts    → PUT /api/meta/schema/:name
/routes/auth/login/POST.ts          → POST /auth/login
```

### **Consistent Array/Object Pattern**
```bash
# Array endpoints (bulk operations)
GET /api/data/:schema           → Returns: []
POST /api/data/:schema          → Expects: [], Returns: []
PUT /api/data/:schema           → Expects: [], Returns: []
DELETE /api/data/:schema        → Expects: [], Returns: []

# Object endpoints (single record)  
GET /api/data/:schema/:id       → Returns: {}
PUT /api/data/:schema/:id       → Expects: {}, Returns: {}
DELETE /api/data/:schema/:id    → Returns: {}
```

### **CLI Command Mapping**
```bash
# CLI automatically handles array/object conversion
monk data create account        # Wraps {} in [] for API
monk data list account          # Calls array endpoint  
monk data get account <id>      # Calls object endpoint
monk data update account <id>   # Calls object endpoint
```

### **Soft Delete System**
Three-tier access pattern:
- **📋 List Operations**: Hide trashed records (`monk data list`)
- **🔍 Direct Access**: Allow ID retrieval (`monk data get <id>`)  
- **🔒 Update Operations**: Block modifications until restoration

### **FTP Middleware (Phase 3)**

Filesystem-like access to API data through HTTP endpoints that simulate FTP operations.

#### **Quick Overview**
- **Path Structure**: `/data/users/user-123.json` → Complete record access
- **Core Operations**: `POST /ftp/list`, `POST /ftp/store`, `POST /ftp/delete`
- **Advanced Features**: Wildcard patterns, atomic transactions, caching
- **Integration**: ACL permissions, observer pipeline, soft-delete support

#### **Quick Example**
```bash
# List users
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/users/", "ftp_options": {"long_format": true}}'

# Create user
curl -X POST http://localhost:9001/ftp/store \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/users/new-user.json", "content": {"name": "User"}}'
```

> **📋 Complete Documentation**: See [docs/FTP.md](docs/FTP.md) for detailed API reference, request/response formats, advanced features, and testing examples.

## Common Development Tasks

### **Adding New API Endpoints**
```bash
# 1. Create route handler
src/routes/new-endpoint.ts

# 2. Use middleware pattern (systemContextMiddleware provides system)
export default async function (context: Context) {
    const schema = context.req.param('schema');
    const system = context.get('system');
    
    // Database operations automatically run observer pipeline
    const result = await system.database.selectAny(schema);
    setRouteResult(context, result);
}

# 3. Register in main router with appropriate response middleware
src/index.ts
app.use('/api/new/*', responseJsonMiddleware);  // For JSON responses
app.route('/api/new', newRouter);
```

### **Schema Development**
```bash
# 1. Create YAML schema
tests/schemas/new-schema.yaml

# 2. Deploy for testing
cat tests/schemas/new-schema.yaml | monk meta create schema

# 3. Test CRUD operations
echo '{"field": "value"}' | monk data create new-schema
monk data list new-schema
```

### **Observer Development**
```bash
# 1. Create observer file (auto-discovery by file location)
src/observers/users/0/custom-validator.ts      # User schema, validation ring
src/observers/all/7/audit-logger.ts            # All schemas, audit ring

# 2. Implement observer extending BaseObserver
export default class CustomValidator extends BaseObserver {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;
    
    async execute(context: ObserverContext): Promise<void> {
        for (const record of context.data) {
            // Validation logic
            if (!this.isValid(record)) {
                throw new ValidationError('Invalid data', 'field');
            }
        }
    }
}

# 3. Test observer execution
npm run start:dev                              # Auto-loads new observer
npm run test:one tests/85-observer-integration/observer-startup-test.sh

# 4. Verify observer loading in logs
# Look for: "✅ Observer loaded: CustomValidator (ring 0, schema users)"
```

### **Database Operations**
```bash
# Development database access
psql -d monk-api-auth            # Auth database
psql -d "monk-api\$local-test"   # Tenant database

# View tenant registry
psql -d monk-api-auth -c "SELECT * FROM tenants;"

# Check schema tables
psql -d "monk-api\$local-test" -c "SELECT name FROM schema;"
```

## Enterprise Filter System

### **Filter Operator Categories**

The monk-api Filter system provides **25+ advanced operators** for sophisticated database querying, restored from the 2019 cloud-api implementation with modern enhancements.

#### **Comparison Operators (8)**
- **$eq, $ne, $neq**: Equality and inequality operations
- **$gt, $gte, $lt, $lte**: Numeric and date comparisons
- **$between**: Range operations with validation

#### **Pattern Matching Operators (4)**  
- **$like, $nlike**: Case-sensitive SQL LIKE operations
- **$ilike, $nilike**: Case-insensitive PostgreSQL ILIKE operations  
- **$regex, $nregex**: Regular expression matching

#### **Array Membership Operators (2)**
- **$in, $nin**: Value membership in arrays

#### **PostgreSQL Array Operations (5) - Critical for ACL**
- **$any**: Array overlap (`access_read && ARRAY[user_context]`)
- **$all**: Array contains all values (`tags @> ARRAY['required', 'tags']`)
- **$nany, $nall**: Negated array operations for denial logic
- **$size**: Array size with nested operator support (`{ $size: { $gte: 1 } }`)

#### **Logical Operators (5) - Critical for FTP Wildcards**
- **$and, $or**: Standard logical operations with unlimited nesting depth
- **$not**: Negation operations
- **$nand, $nor**: Advanced logical operations for complex business rules

#### **Search & Existence Operators (4)**
- **$find, $text**: Full-text search capabilities (PostgreSQL-ready)
- **$exists, $null**: Field existence and null validation

### **Complex Filter Examples**

#### **Multi-Tenant ACL Filtering**
```bash
# API Query with enterprise ACL
POST /api/data/documents
{
  "where": {
    "$and": [
      {
        "$or": [
          { "access_read": { "$any": ["user-123", "group-456", "tenant-abc"] } },
          { "access_edit": { "$any": ["user-123", "group-456", "tenant-abc"] } },
          { "access_full": { "$any": ["user-123", "group-456", "tenant-abc"] } }
        ]
      },
      { "access_deny": { "$nany": ["user-123", "group-456", "tenant-abc"] } },
      { "tenant": { "$in": ["tenant-abc", "shared"] } },
      { "status": { "$nin": ["archived", "deleted"] } }
    ]
  }
}
```


#### **Advanced Content Search**
```bash
# Complex search with permissions and quality constraints
{
  "where": {
    "$and": [
      {
        "$or": [
          { "title": { "$find": "database optimization" } },
          { "content": { "$text": "performance tuning" } },
          { "keywords": { "$any": ["postgresql", "sql", "database"] } }
        ]
      },
      { "published_at": { "$between": ["2024-01-01", "2024-12-31"] } },
      { "quality_score": { "$between": [4, 5] } },
      { "author_permissions": { "$size": { "$gte": 1 } } },
      { "restricted_tags": { "$nall": ["confidential", "internal"] } }
    ]
  },
  "order": ["quality_score desc", "published_at desc"],
  "limit": 25
}
```

### **Performance Capabilities**
- **Deep Nesting**: 6+ levels of logical operator nesting
- **Large Arrays**: 200+ element PostgreSQL array operations
- **Complex Branching**: 100+ OR conditions in single query
- **Parameter Management**: 500+ parameters with proper SQL parameterization
- **Enterprise Scale**: Multi-tenant ACL queries with inheritance hierarchies

### **Critical Unblocked Features**
- **ACL System (Issues #4-7)**: PostgreSQL array operations enable user context filtering
- **FTP Server (Epic #122)**: Logical operators enable complex wildcard pattern translation
- **Advanced APIs**: Sophisticated filtering capabilities for complex business logic

## Build and Deployment

### **Build Process**
```bash
# TypeScript compilation
npm run compile                   # Compiles src/ to dist/

# CLI regeneration (after bashly.yml changes)
cd cli/src && bashly generate

# Complete build
npm run autoinstall              # Full environment setup
```

### **Environment Configuration**
```bash
# ~/.config/monk/env.json
{
  "DATABASE_URL": "postgresql://user:pass@localhost:5432/",
  "NODE_ENV": "development", 
  "PORT": "9001"
}

# ~/.config/monk/servers.json  
{
  "servers": {
    "local": {
      "hostname": "localhost",
      "port": 9001,
      "protocol": "http"
    }
  },
  "current": "local"
}
```

## Testing Guide

### **Running Tests**
```bash
# All tests
npm run test:all

# Pattern matching
npm run test:all 15              # Auth tests (15-authentication)
npm run test:all 20-30           # Meta and data API tests

# Individual test
npm run test:one tests/15-authentication/basic-auth-test.sh

# Verbose output
npm run test:one tests/path/test.sh --verbose
```

### **Test Development Patterns**
```bash
# Standard test template
#!/bin/bash
set -e

# Required setup
source "$(dirname "$0")/../test-env-setup.sh"
source "$(dirname "$0")/../auth-helper.sh"

# Use provided TEST_TENANT_NAME and auth_as_user "root"
if [ -z "$TEST_TENANT_NAME" ]; then
    echo "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

# Authenticate and run tests
if ! auth_as_user "root"; then
    exit 1
fi

# Test implementation...
```

### **Database Testing**
- Each test gets a **fresh tenant database** (`test-$(date +%s)`)
- **No database pollution** between tests
- **Automatic cleanup** handled by test-one.sh
- **Authentication isolation** per test run

## TypeScript Test Framework (Vitest)

### **Running Spec Tests**
```bash
# All spec tests
npm run spec:all

# Pattern matching (sorted execution order)
npm run spec:all 05              # Infrastructure tests (05-infrastructure)
npm run spec:all 15              # Authentication tests (15-authentication)
npm run spec:all 05-20           # Infrastructure through meta-api tests
npm run spec:all unit            # All unit tests (no database required)
npm run spec:all integration     # All integration tests (requires database)

# Category-specific testing
npm run spec:all unit/filter     # Filter operator tests
npm run spec:all unit/ftp        # FTP middleware unit tests
npm run spec:all unit/observers  # Observer system unit tests

# Individual test files
npm run spec:one spec/15-authentication/basic-auth.test.ts
npm run spec:one spec/unit/filter/logical-operators.test.ts

# Verbose output
npm run spec:all unit --verbose
npm run spec:one spec/path/test.test.ts --verbose
```

### **Comprehensive Test Architecture**

#### **Current Test Structure**
```bash
spec/
├── 05-infrastructure/                    # Core connectivity and configuration
│   ├── connectivity.test.ts             # Database, Metabase, System connectivity
│   └── server-config.test.ts            # TenantService and environment setup
├── 15-authentication/                    # Authentication workflow
│   └── basic-auth.test.ts               # Tenant creation → login → authenticated operations
├── 20-meta-api/                         # Schema management (YAML)
│   └── schema-operations.test.ts        # metabase.createOne() → selectOne() → deleteOne()
├── 30-data-api/                         # Data operations (JSON)
│   └── data-operations.test.ts          # database.createAll() → selectAny() → updateAll()
├── unit/                                # Unit tests (no database dependencies)
│   ├── filter/                          # Enhanced Filter system tests
│   │   ├── logical-operators.test.ts    # AND, OR, NOT, NAND, NOR operations
│   │   ├── array-operators.test.ts      # PostgreSQL array operations ($any, $all, $size)
│   │   ├── search-operators.test.ts     # Full-text search ($find, $text)
│   │   ├── range-existence-operators.test.ts # Range ($between) and existence ($exists, $null)
│   │   └── complex-scenarios.test.ts    # Real-world ACL and FTP wildcard scenarios
│   ├── ftp/                             # FTP middleware unit tests
│   │   ├── ftp-path-parsing.test.ts     # Path structure validation and parsing
│   │   └── ftp-utilities.test.ts        # Permission calculation, content formatting
│   └── observers/                       # Observer system unit tests
│       ├── sql-observer.test.ts         # Database operation observer
│       ├── uuid-array-processor.test.ts # PostgreSQL array processing
│       └── filter-where.test.ts         # WHERE clause generation
├── integration/                         # Integration tests (require database)
│   ├── observer-pipeline.test.ts        # Complete observer pipeline testing
│   └── ftp/                             # FTP middleware integration tests
│       ├── ftp-list.test.ts             # Directory listing with real data
│       ├── ftp-retrieve.test.ts         # File retrieval and content handling
│       ├── ftp-store.test.ts            # Record creation and field updates
│       └── ftp-stat.test.ts             # Status information and metadata
└── helpers/
    ├── test-tenant.ts                   # Real tenant creation and TypeScript context
    └── observer-helpers.ts              # Mock system and observer testing utilities
```

#### **Test Categories and Coverage**

##### **Unit Tests (No Database Required) - 210+ Tests**
- **Filter Operators (162 tests)**: Comprehensive coverage of 25+ operators
  - **Logical operators**: Deep nesting, complex combinations, parameter management
  - **PostgreSQL arrays**: ACL filtering, array operations, size constraints
  - **Search operations**: Full-text search, content discovery patterns
  - **Range/existence**: Date ranges, field validation, null handling
  - **Complex scenarios**: Real-world ACL, FTP wildcards, enterprise patterns

- **FTP Middleware (48 tests)**: Path parsing, utilities, protocol compliance
  - **Path parsing**: All path levels, wildcard detection, normalization
  - **Utilities**: Permission calculation, content formatting, ETag generation
  - **Protocol compliance**: FTP timestamps, content types, response structures

- **Observer System (35+ tests)**: Business logic validation and execution
  - **Individual observers**: SQL observer, UUID processors, validators
  - **Observer patterns**: BaseObserver, execution flows, error handling

##### **Integration Tests (Database Required) - 100+ Tests**
- **API Operations**: Real database testing of System, Database, Metabase classes
- **Observer Pipeline**: Complete 10-ring execution with real data
- **FTP Endpoints**: End-to-end workflow testing with account/contact schemas
- **Authentication**: JWT generation, tenant creation, user context setup

### **Test Development Patterns**

#### **Unit Test Pattern (No Database)**
```typescript
// Unit tests for pure logic validation
import { describe, test, expect } from 'vitest';
import { FilterWhere } from '@lib/filter-where.js';

describe('Component Unit Tests', () => {
  test('should validate core logic', () => {
    // Test pure functions and logic
    const { whereClause, params } = FilterWhere.generate({
      $and: [
        { access_read: { $any: ['user-123'] } },
        { status: 'active' }
      ]
    });
    
    expect(whereClause).toContain('"access_read" && ARRAY[$1]');
    expect(params).toEqual(['user-123', 'active']);
  });
  
  test('should handle edge cases', () => {
    // Test boundary conditions and error scenarios
    expect(() => {
      FilterWhere.generate({ field: { $between: [null] } });
    }).toThrow('$between requires array with exactly 2 values');
  });
});
```

#### **Integration Test Pattern (Database Required)**
```typescript
// Integration tests with real database operations
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';

describe('Integration Test Suite', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');

    // Create test schemas and data
    const schemaYaml = await readFile('test/schemas/account.yaml', 'utf-8');
    await testContext.metabase.createOne('account', schemaYaml);
    
    await testContext.database.createOne('account', {
      id: 'test-account',
      name: 'Test User',
      email: 'test@example.com',
      username: 'testuser',
      account_type: 'personal'
    });
  });

  afterAll(async () => {
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  test('should test database operations', async () => {
    const result = await testContext.database.selectOne('account', {
      where: { id: 'test-account' }
    });
    
    expect(result).toBeDefined();
    expect(result.name).toBe('Test User');
  });
});
```

#### **HTTP Endpoint Testing Pattern**
```typescript
// Testing HTTP endpoints with real requests
describe('HTTP Endpoint Tests', () => {
  beforeAll(async () => {
    // Set up test tenant and context
    tenantManager = await createTestTenant();
    testContext = await createTestContext(tenantManager.tenant!, 'root');
  });

  test('should test API endpoint', async () => {
    const response = await fetch('http://localhost:9001/ftp/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testContext.jwtToken}`
      },
      body: JSON.stringify({
        path: '/data/',
        ftp_options: { show_hidden: false, long_format: true, recursive: false }
      })
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
  });
});
```

### **TypeScript Testing Features**

#### **Core Capabilities**
- **Real Database Testing**: Fresh tenant per test suite using `TenantService.createTenant()`
- **TypeScript Classes**: Direct testing of System, Database, Metabase, TenantService
- **Observer Integration**: Full 10-ring observer pipeline execution with `ObserverLoader.preloadObservers()`
- **Authenticated Context**: Proper JWT generation and System context setup
- **Automatic Cleanup**: Tenant and database cleanup after each test suite
- **Path Aliases**: Clean imports using `@lib`, `@spec`, `@src` patterns

#### **Advanced Testing Capabilities**
- **Complex Filter Testing**: 6+ level nesting, 500+ parameters, PostgreSQL array operations
- **HTTP Endpoint Testing**: Real API requests with authentication and validation
- **Mock System Support**: Observer testing with controlled environments
- **Schema Integration**: Real YAML schemas from test/schemas/ directory
- **Performance Testing**: Large datasets, complex queries, stress scenarios
- **Error Boundary Testing**: Comprehensive error handling validation

#### **Test Data Management**
- **Schema Templates**: account.yaml, contact.yaml for realistic testing
- **Isolated Tenants**: Fresh database per test suite prevents pollution
- **Controlled Data**: Predictable test records for consistent assertions
- **Edge Case Coverage**: Null values, empty arrays, validation failures

### **Spec vs Shell Tests**
- **spec/** directory: TypeScript vitest tests for unit and integration testing
- **tests/** directory: Shell integration tests for CLI and end-to-end workflows
- **Both frameworks**: Support same numbering pattern (05, 15, 20, 30)
- **Execution order**: Both run tests in sorted order (infrastructure → auth → apis)
- **Fresh tenants**: Both create isolated test environments per test

### **Testing Best Practices**

#### **Unit vs Integration Test Selection**
- **Unit Tests**: Use for pure logic, utilities, parsing, validation without database
- **Integration Tests**: Use for database operations, API endpoints, observer pipeline
- **Performance**: Unit tests run faster (no database setup), prefer when possible

#### **Test Organization Guidelines**
- **Group by functionality**: Filter tests in `unit/filter/`, FTP tests in `unit/ftp/`
- **Logical separation**: One test file per major component or operator group
- **Descriptive naming**: Clear test descriptions that explain the scenario being tested

#### **Vitest Testing Requirements**
- **Observer preloading**: Call `await ObserverLoader.preloadObservers()` in `beforeAll` for integration tests
- **Real tenants**: Use `createTestTenant()` for isolated database testing
- **TypeScript context**: Use `createTestContext()` for authenticated System instances
- **Proper imports**: Use path aliases (`@lib`, `@spec`, `@src`) for clean code organization

#### **Common Testing Patterns**
```typescript
// Test complex Filter operators
const { whereClause, params } = FilterWhere.generate({
  $and: [
    { access_read: { $any: ['user-123'] } },
    { status: { $nin: ['deleted', 'suspended'] } }
  ]
});

// Test HTTP endpoints
const response = await fetch('http://localhost:9001/ftp/list', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ path: '/data/' })
});

// Test database operations  
const record = await testContext.database.createOne('account', testData);
expect(record.id).toBeDefined();
```

#### **Test Data Strategy**
- **Use existing schemas**: `test/schemas/account.yaml`, `contact.yaml` for realistic testing
- **Predictable IDs**: Use descriptive test record IDs like `account-test-001`
- **Edge cases**: Test null values, empty arrays, boundary conditions
- **Performance data**: Large objects, many records for stress testing

## Contributing Guidelines

### **Git Workflow**
```bash
# 1. Create feature branch
git checkout -b feature/description-issue-123

# 2. Make changes and commit frequently
git add . && git commit -m "Implement feature X"

# 3. Push and create PR
git push -u origin feature/description-issue-123
gh pr create --title "Feature: Description (#123)"

# 4. After approval, merge and cleanup
gh pr merge 123 --squash
git checkout main && git pull
```

### **Branch Naming Conventions**
- **feature/description-issue-123**: New features
- **fix/description-issue-123**: Bug fixes  
- **docs/description-issue-123**: Documentation
- **refactor/description-issue-123**: Code refactoring

### **Code Style**
- **TypeScript**: Strict typing, async/await patterns
- **Error Handling**: Descriptive errors with error codes
- **Logging**: Use console.debug for development, structured logging
- **Security**: Never log secrets, validate all inputs, use parameterized queries

### **Testing Requirements**
- **New features**: Must include comprehensive test coverage
- **Bug fixes**: Must include regression test
- **API changes**: Update integration tests
- **CLI changes**: Test with bashly regeneration

### **Documentation Updates**
- **API changes**: Update route documentation
- **CLI changes**: Update command help text in bashly.yml
- **Architecture changes**: Update CLAUDE.md system documentation
- **Breaking changes**: Update migration notes

## Development Environment Details

### **Required Tools**

#### **Core Development**
```bash
# Node.js and npm
node --version    # Should be 18+
npm --version

# PostgreSQL
psql --version    # Should be 12+
createdb --version

# JSON processing
jq --version      # Required for CLI and tests
```

#### **CLI Development** 
```bash
# Ruby and bashly
ruby --version    # Should be 3.0+
gem install bashly

# Verify bashly
bashly --version
```

### **Database Setup**
```bash
# The autoinstall script handles this, but manual steps:

# 1. Create auth database
createdb monk-api-auth
psql -d monk-api-auth -f sql/init-auth.sql

# 2. Create tenant
monk tenant create local-test

# 3. Verify setup
monk auth login local-test root
monk ping
```

### **Development Server Options**
```bash
# Full API server (recommended)
npm run start:dev                 # http://localhost:9001 with auto-reload

# Production build
npm run compile && npm run start

# For FTP server development, see: https://github.com/ianzepp/monk-ftp
```

## Advanced Topics

### **Schema Caching System**
- **15x performance improvement**: Schema access from 240ms → 16ms
- **SHA256 checksums**: Fast cache invalidation using YAML content hashing
- **Multi-database caching**: Isolated cache per tenant database
- **Compiled validators**: AJV validators cached in Schema instances

### **Multi-tenant Database Routing**
```typescript
// JWT contains routing information
interface JWTPayload {
    tenant: string;        // Tenant name
    database: string;      // Full database name (monk-api$tenant)
    access: string;        // User access level
    // ... other fields
}

// System class provides database context
const system = System.fromContext(context);
const database = new Database(system);
// All operations use tenant's database automatically
```

### **Soft Delete Implementation**
- **Soft delete**: Sets `trashed_at` timestamp, record hidden from lists
- **Hard delete**: Sets `deleted_at` timestamp, permanent removal marker
- **Update protection**: Trashed/deleted records cannot be modified (Issue #30 fix)
- **Restoration workflow**: Must restore before updating

### **Testing Architecture Deep Dive**

#### **Tenant Lifecycle Management**
```bash
# test-all.sh (Layer 1): Pattern matching, orchestration
npm run test:all 15              # Finds all tests/15-*/*.sh files

# test-one.sh (Layer 2): Tenant management per test
scripts/test-one.sh test.sh      # Creates test-$(timestamp) tenant
                                 # Exports TEST_TENANT_NAME
                                 # Cleans up tenant after test

# Individual tests (Layer 3): Test logic and scenarios  
tests/15-authentication/basic-auth-test.sh  # Uses TEST_TENANT_NAME
                                            # Calls auth_as_user "root"
```

#### **Git-based Testing**
```bash
# Creates isolated test environments
monk test git main               # /tmp/monk-builds/main-12345678/
                                 # Independent git checkout, build, config
                                 # Ready for: cd dir && npm run test:one test.sh
```

## Troubleshooting

### **Systematic Debugging Approach**

When issues arise, follow this systematic approach based on recent debugging experience:

#### **1. Isolate the Problem Scope**
```bash
# Determine if issue is environmental or code-related
git status                              # Check for uncommitted changes
npm run compile                         # Verify TypeScript compilation
npm run spec:all unit                   # Test unit tests (no external dependencies)

# Check basic connectivity
psql -d monk-api-auth -c "SELECT current_user;"   # Test direct PostgreSQL
curl http://localhost:9001/health               # Test HTTP API if running
```

#### **2. Environment vs Code Issues**
```bash
# If psql works but Node.js fails → Environment issue
# If both fail → PostgreSQL configuration issue  
# If HTTP API works but tests fail → Test configuration issue
# If compilation fails → Code issue

# Check environment configuration
cat ~/.config/monk/env.json
echo $DATABASE_URL                     # Should match env.json
node --version && npm --version        # Check runtime versions
```

#### **3. Database-Specific Debugging**
```bash
# Test database layers systematically
psql -d postgres -c "SELECT version();"                    # PostgreSQL server
psql -d monk-api-auth -c "SELECT COUNT(*) FROM tenants;"   # Auth database
psql -d "monk-api\$local-test" -c "SELECT COUNT(*) FROM schema;" # Tenant database

# Test Node.js database connections
npm run spec:one spec/unit/database-connection-test.test.ts  # Direct connections
npm run spec:one spec/05-infrastructure/connectivity.test.ts # Integration tests
```

### **Common Issues**

#### **PostgreSQL Authentication Problems**

##### **SCRAM Authentication Error**
```bash
# Error: "SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string"
# Symptoms: psql works fine, but Node.js applications fail

# Root Cause: Connection strings missing passwords for SCRAM authentication
# PostgreSQL 17.6+ defaults to SCRAM-SHA-256 which requires explicit passwords

# Diagnostic Steps:
psql -U $USER -d monk-api-auth -c "SELECT current_user;"    # Should work
npm run spec:one spec/unit/tenant-service-debug.test.ts     # May fail

# Verify DATABASE_URL configuration
cat ~/.config/monk/env.json | grep DATABASE_URL
# Must include password: "postgresql://user:password@localhost:5432/"

# Fix: Update TenantService to use DATABASE_URL consistently
# All connection strings should use baseUrl.replace() pattern
```

##### **Connection Refused Errors**
```bash
# Check PostgreSQL service status
sudo systemctl status postgresql
sudo systemctl start postgresql

# Check listening ports
sudo netstat -tlnp | grep 5432
ps aux | grep postgres
```

#### **TypeScript Testing Issues**

##### **Integration Tests Failing**
```bash
# Check observer system preloading
npm run spec:one spec/05-infrastructure/connectivity.test.ts

# Common issue: Observers not loaded
# Solution: Add await ObserverLoader.preloadObservers() to test setup

# Check test tenant creation
npm run spec:one spec/unit/tenant-service-debug.test.ts

# Environment isolation issues
# Each test creates fresh tenant - verify cleanup working
```

##### **Unit Tests vs Integration Tests**
```bash
# Unit tests should always work (no external dependencies)
npm run spec:all unit                   # Should pass consistently

# Integration tests require database and configuration
npm run spec:all integration            # May fail with config issues

# If unit tests fail → Code issue
# If integration tests fail → Environment/config issue
```

#### **HTTP API Issues**

##### **Server Won't Start**
```bash
# Check port availability
lsof -i :9001
netstat -tlnp | grep 9001

# Check database connectivity before server start
psql -d monk-api-auth -c "SELECT 1;"

# Check observer system
npm run compile                         # Ensure TypeScript compiled
# Look for observer loading errors in startup logs
```

##### **API Endpoints Failing**
```bash
# Test with minimal endpoint first
curl http://localhost:9001/health

# Check authentication
curl -H "Authorization: Bearer $(monk auth token)" http://localhost:9001/ping

# Test database-dependent endpoints
curl -X POST http://localhost:9001/ftp/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(monk auth token)" \
  -d '{"path": "/", "ftp_options": {"show_hidden": false, "long_format": true, "recursive": false}}'
```

#### **Configuration Issues**
```bash
# Verify monk configuration exists and is valid
ls -la ~/.config/monk/
cat ~/.config/monk/env.json | jq .      # Validate JSON syntax

# Check required environment variables
echo $DATABASE_URL                      # Must include password
echo $JWT_SECRET                        # Should be set
echo $NODE_ENV                          # Should be development/production

# Reset configuration if corrupted
npm run autoinstall                     # Regenerate configuration
```

#### **Observer System Issues**
```bash
# Check observer loading
npm run compile                         # Compile observers
npm run start:dev                       # Look for observer loading logs

# Test observer system directly
npm run spec:all unit/observers         # Unit test observers
npm run spec:one spec/integration/observer-pipeline.test.ts

# Common observer issues:
# - Missing observer files in src/observers/
# - TypeScript compilation errors
# - Circular dependency issues
```

### **Advanced Debugging Techniques**

#### **When "Everything Worked Before" Issues**
```bash
# Systematic git archaeology approach
git log --oneline -10                   # Check recent commits
git log --oneline --since="4 hours ago" # Recent changes

# Test specific commits to isolate when issue started
git checkout <commit-hash>              # Test earlier commit
npm run spec:one spec/05-infrastructure/connectivity.test.ts

# Common causes of "worked before" issues:
# - External system updates (PostgreSQL, Node.js, OS packages)
# - Environment configuration changes
# - Dependency version changes (check package-lock.json)
# - Database authentication method changes
```

#### **Environment vs Code Issue Identification**
```bash
# Create diagnostic matrix
# ✅ psql works + ❌ Node.js fails = Authentication/environment issue
# ❌ psql fails + ❌ Node.js fails = PostgreSQL server issue  
# ✅ HTTP API works + ❌ Tests fail = Test configuration issue
# ❌ HTTP API fails + ❌ Tests fail = Code/database issue

# Test each layer independently
curl http://localhost:9001/health       # HTTP layer
npm run spec:all unit                   # Code logic layer  
npm run spec:one spec/unit/database-connection-test.test.ts # Database layer
```

#### **Database Connection Debugging**
```bash
# Compare working vs failing connection patterns
# Working: DatabaseManager (main API) 
# Failing: TenantService (tests)

# Check connection string differences
echo "Main API uses: $DATABASE_URL"
echo "TenantService builds: postgresql://user@host:port/db"

# Test connection methods systematically:
# 1. Direct psql command
# 2. Node.js pg client with connection string
# 3. Node.js pg client with explicit parameters
# 4. Integration test tenant creation
```

#### **Filter System Debugging**
```bash
# Test filter operators systematically by category
npm run spec:all unit/filter/logical-operators      # AND, OR, NOT operations
npm run spec:all unit/filter/array-operators        # PostgreSQL arrays
npm run spec:all unit/filter/complex-scenarios      # Real-world patterns

# Debug SQL generation
const { whereClause, params } = FilterWhere.generate({ complex: 'filter' });
console.log('SQL:', whereClause);
console.log('Params:', params);

# Test specific operator combinations
npm run spec:one spec/unit/filter/logical-operators.test.ts
```

#### **FTP Middleware Debugging**
```bash
# Test FTP endpoints systematically
# 1. Unit tests (path parsing, utilities)
npm run spec:all unit/ftp

# 2. Direct HTTP endpoint testing  
TOKEN=$(monk auth token)
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/", "ftp_options": {}}'

# 3. Integration tests (requires database)
npm run spec:all integration/ftp
```

### **Development Tips**

#### **Debugging API Issues**
- **Start simple**: Test `/health` endpoint first, then build complexity
- **Layer by layer**: HTTP → Auth → Database → Business Logic
- **Systematic isolation**: Unit tests → Integration tests → HTTP endpoints
- **Environment first**: Rule out external dependencies before code debugging
- **Use manual testing**: curl commands to verify endpoint functionality
- **Check logs**: `npm run start:dev` provides detailed operation logging

#### **CLI Development**
- Always regenerate CLI after bashly.yml changes: `bashly generate`
- Use `CLI_VERBOSE=true` for detailed command output
- Test commands individually before batch testing
- Check `~/.config/monk/servers.json` for server configuration

#### **Observer Development**
- **All Database operations** automatically run observer pipeline with 10-ring execution
- **Schema objects available**: Observers receive full `Schema` objects with validation capabilities
- **Create observers** in `src/observers/schema/ring/` for auto-discovery by ObserverRunner
- **Use `BaseObserver`** class with executeTry/execute pattern for error handling
- **Observer context**: Access `context.schema.isSystemSchema()`, `context.schema.validateOrThrow()`
- **Unit testable**: Most observers can be unit tested without database setup
- **Test integration**: Use vitest framework for real database observer testing
- **Check logs**: Look for `✅ Observer executed:` messages during development

#### **Data Integrity Observer Pipeline** (Issue #101 Complete)

**Phase 1: Schema Validation (Ring 0)**
- **SystemSchemaProtector**: Prevents data operations on system schemas using `schema.isSystemSchema()`
- **JsonSchemaValidator**: Validates all data against JSON Schema definitions with `schema.validateOrThrow()`
- **29 unit tests** covering schema protection and validation workflows

**Phase 2: Data Integrity & Business Logic (Rings 0-2)**
- **RecordPreloader** (Ring 0): Efficient single-query preloading of existing records for other observers
- **UpdateMerger** (Ring 0): Proper record merging preserving unchanged fields with timestamp management
- **JsonSchemaValidator** (Ring 1): Validates all data against JSON Schema definitions after data preparation
- **SoftDeleteProtector** (Ring 2): Prevents operations on trashed/deleted records using preloaded data
- **ExistenceValidator** (Ring 2): Validates records exist before update/delete/revert operations
- **131 unit tests total** covering complete data integrity pipeline

**Universal Coverage & Performance**
- **All schemas protected**: Every database operation gets validation, security, business logic automatically
- **Single query preloading**: O(1) vs O(N) database calls for multi-record operations
- **Read-only safety**: Frozen preloaded objects prevent accidental mutation
- **Clean SQL transport**: SqlObserver (Ring 5) handles pure database operations after validation

#### **Database Development**  
- **All CRUD operations** now use universal observer pipeline with Schema object context
- **Database methods** follow single→array→pipeline pattern consistently
- **Route handlers**: Use `context.get('system').database.*()` for database operations
- **Observer pipeline**: Provides validation, security, audit automatically with Schema objects
- **Schema loading**: ObserverRunner loads Schema objects once per operation for all observers
- **Test integration**: Observer pipeline transparent to existing database tests

#### **Transaction Management**
- **Clean DB/TX separation**: `system.db` (always available) vs `system.tx` (SQL Observer managed)
- **Observer-driven transactions**: Observers signal transaction needs via `this.needsTransaction(context, reason)`
- **SQL Observer control**: Ring 5 manages all transaction boundaries (begin/commit/rollback)
- **Transaction visibility**: Nested database calls automatically use active transaction context
- **ACID compliance**: Multi-observer operations maintain data integrity with proper isolation

#### **Logging Patterns**
- **`system.info/warn`**: Use in observers and route handlers (has request context)
- **`logger.info/warn`**: Use in infrastructure code (no System context available)
- **Observer logging**: Always use `system.info()` since `context.system` is available
- **Structured metadata**: Include schemaName, operation, and relevant context in logs
- **Performance timing**: Use `system.time(label, startTime, context)` for automatic profiling with hrtime precision

## Release Management

### **Version Control and Releases**

The project uses **managed npm package versioning** with manual control over version bumps and automated release workflows.

#### **Release Workflow**
```bash
# Bug fixes and patches
npm run version:patch

# New features (your discretion)
npm run version:minor

# Major releases (your discretion) 
npm run version:major
```

#### **Automated Release Process**
Each version command automatically:

1. **Pre-version validation**: Runs `npm run compile && npm run test:all`
2. **Version bump**: Updates `package.json` version and creates Git tag
3. **Release automation**: 
   - Pushes commits and tags to remote repository
   - Creates GitHub release with auto-generated release notes
   - Maintains release history for rollback capabilities

#### **Release Guidelines**
- **Manual Control**: Developer decides timing and type of version bump
- **Quality Gates**: All tests must pass before version bump succeeds
- **Professional Releases**: GitHub releases include auto-generated changelogs
- **Branch Strategy**: Releases are created from `main` branch
- **Rollback Safety**: Each release is tagged for easy rollback if needed

#### **Version Strategy**
- **Patch (x.x.1)**: Bug fixes, security patches, minor improvements
- **Minor (x.1.x)**: New features, significant enhancements, API additions
- **Major (1.x.x)**: Breaking changes, architecture changes, API restructuring

## Performance Considerations

### **Schema Operations**
- Schema definitions are cached with SHA256 checksums
- Compiled AJV validators are reused across requests
- Batch operations minimize database round trips

### **Database Operations**
- Use batch methods (updateAll, createAll) vs individual operations
- System pattern provides efficient connection pooling per tenant
- Raw SQL generation avoids ORM overhead

### **Testing Performance**
- Tenant isolation ensures no test pollution
- Git environments are reused when possible
- Pattern-based test execution allows focused testing

---

## Quick Reference

### **Essential Commands**
```bash
# Setup
npm run autoinstall

# Development  
npm run start:dev
monk servers use local
monk auth login local-test root

# Shell Testing
npm run test:all
npm run test:one tests/path/test.sh
npm run test:one tests/85-observer-integration/observer-startup-test.sh

# TypeScript Testing (Vitest Framework)
npm run spec:all                        # All TypeScript tests
npm run spec:all unit                   # All unit tests (no database)
npm run spec:all integration            # All integration tests (requires database)

# Component-specific testing
npm run spec:all unit/filter            # Enhanced Filter operator tests (162 tests)
npm run spec:all unit/ftp               # FTP middleware unit tests (93+ tests)
npm run spec:all unit/observers         # Observer system unit tests
npm run spec:all integration/ftp        # FTP integration tests (database required)
npm run spec:all 05-20                  # Infrastructure through meta-api tests
npm run spec:all auth                   # Authentication-related tests

# Individual test files
npm run spec:one spec/unit/filter/logical-operators.test.ts
npm run spec:one spec/integration/ftp/ftp-list.test.ts
npm run spec:one spec/20-meta-api/schema-operations.test.ts

# Releases
npm run version:patch
npm run version:minor
npm run version:major

# CLI regeneration
cd cli/src && bashly generate

# Schema management
cat schema.yaml | monk meta create schema
monk meta list schema

# Data operations (automatically run observer pipeline)
echo '{"field":"value"}' | monk data create schema     # Validation, business logic, audit
monk data list schema                                   # Security, integration rings
monk data get schema <id>                               # Observer coverage automatic

# Observer development (Phase 1+2 data integrity pipeline complete)
# Create observer: src/observers/schema/ring/observer.ts
# Unit test: npm run spec:one spec/unit/observers/observer-name.test.ts
# Integration test: npm run test:one test/85-observer-integration/observer-startup-test.sh
# Phase 2 observer tests: npm run spec:all unit/observers

# Advanced testing examples
npm run spec:all unit/filter/logical-operators  # Deep logical operator nesting
npm run spec:all unit/filter/complex-scenarios  # Real-world ACL and FTP patterns
npm run spec:one spec/unit/ftp/ftp-path-parsing.test.ts # FTP path validation

# Enterprise Filter System testing (Issue #121)
npm run spec:all unit/filter                    # All 162 filter operator tests
npm run spec:one spec/unit/filter/array-operators.test.ts # PostgreSQL array operations

# FTP Middleware testing
npm run spec:all unit/ftp                       # FTP middleware unit tests  
npm run spec:all integration/ftp                # FTP integration tests

# FTP Operations (see docs/FTP.md for complete examples)
curl -X POST http://localhost:9001/ftp/store -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/data/users/test.json", "content": {"name": "Test"}}'
```

### **Key Configuration Files**
- **~/.config/monk/servers.json**: Server registry and selection
- **~/.config/monk/env.json**: Environment variables  
- **~/.config/monk/test.json**: Test run history and configuration
- **cli/src/bashly.yml**: CLI command definitions
- **sql/init-auth.sql**: Auth database schema
- **sql/init-tenant.sql**: Tenant database schema

This guide provides everything needed to contribute effectively to the Monk API project, from initial setup through advanced development workflows.