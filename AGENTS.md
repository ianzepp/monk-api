# Monk API - AI Agent Architecture Guide

> **Quick reference for AI agents working on Monk API codebase**
> 
> This guide provides essential architectural knowledge for effective code contribution and maintenance.

## 🏗️ Core Architecture Overview

**Monk API** is a lightweight PaaS backend built with **Hono + TypeScript**, featuring:
- **Schema-first development** with JSON Schema validation
- **Multi-tenant PostgreSQL** with automatic tenant routing  
- **Ring-based observer system** (0-9) for universal business logic execution
- **Ultra-fast performance** (~50KB framework, 15x schema caching improvement)

### Key Architectural Patterns

#### 1. System Pattern Architecture
```typescript
// Per-request database context management
const system = context.get('system'); // SystemContext
const result = await system.database.selectAny('users', { where: { active: true } });
```

#### 2. Observer Pipeline (Universal Execution)
```typescript
// All database operations automatically run through 10-ring observer pipeline
Ring 0: DataPreparation → Ring 1: InputValidation → Ring 2: Security → 
Ring 3: Business → Ring 4: Enrichment → Ring 5: Database → 
Ring 6: PostDatabase → Ring 7: Audit → Ring 8: Integration → Ring 9: Notification
```

#### 3. Route Handler Patterns
```typescript
// withParams() extracts common parameters automatically
export default withParams(async (context, { system, schema, recordId, body }) => {
    const result = await system.database.selectAny(schema!);
    setRouteResult(context, result);
});

// withTransactionParams() wraps write operations in transactions
export default withTransactionParams(async (context, { system, schema, body }) => {
    return await system.database.createAll(schema!, body);
});
```

## 📁 Directory Structure

```
src/
├── lib/                    # Core libraries
│   ├── observers/         # Observer system (runner, base classes, types)
│   ├── middleware/        # Hono middleware (JWT, system context, responses)
│   ├── database.ts        # Database operations with observer integration
│   ├── system.ts          # System context and per-request management
│   └── describe.ts        # Schema management (DDL from JSON Schema)
├── routes/                # API endpoints (path-based organization)
│   ├── data/             # CRUD operations (/api/data/:schema)
│   ├── describe/         # Schema management (/api/describe/:schema)
│   ├── find/             # Advanced search (/api/find/:schema)
│   ├── auth/             # Authentication (/auth/*)
│   └── root/             # Admin operations (/api/root/*)
├── observers/             # Business logic observers (schema/ring/observer.ts)
└── types/globals.d.ts     # Global TypeScript declarations
```

## 🔧 Development Patterns

### Creating New API Endpoints
```typescript
// src/routes/data/:schema/GET.ts
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';

export default withParams(async (context, { system, schema }) => {
    const result = await system.database.selectAny(schema!);
    setRouteResult(context, result);
});
```

### Creating Observers
```typescript
// src/observers/users/1/email-validator.ts
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class EmailValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { data } = context;
        for (const record of data) {
            if (!this.isValidEmail(record.email)) {
                throw new ValidationError('Invalid email format', 'email');
            }
        }
    }
}
```

### Database Operations with Observers
```typescript
// All operations automatically trigger observer pipeline
await system.database.createOne('users', userData);     // Rings 0-9
await system.database.updateOne('users', id, updates);  // Rings 0-9
await system.database.deleteOne('users', id);          // Rings 0-9
await system.database.selectAny('users', filter);      // Rings 0-4 (read-only)
```

## 🧪 Testing Strategy

### Test Organization
```bash
spec/                      # Test specifications
├── 01-basic/             # Basic connectivity tests
├── 30-auth-api/          # Authentication API tests
├── 31-meta-api/          # Schema management tests
├── 32-data-api/          # CRUD operation tests
├── 33-find-api/          # Advanced search tests
└── 35-bulk-api/          # Bulk operation tests
```

### Running Tests
```bash
npm run test:sh           # All shell integration tests
npm run test:sh 15        # Auth tests only
npm run test:sh spec/32-data-api/create-record.test.sh  # Single test
```

## 🔍 Key Implementation Details

### Multi-Tenant Architecture
- **JWT-based routing**: Tokens contain tenant and database information
- **Database isolation**: Each tenant gets separate PostgreSQL database
- **Main database**: `monk` contains tenant registry
- **Tenant databases**: `tenant_12345678` for each tenant

### Schema System
- **JSON Schema validation**: Uses AJV for high-performance validation
- **Automatic DDL**: Schema JSON → PostgreSQL table creation
- **Caching**: SHA256-based schema caching (15x performance improvement)
- **System schemas**: Protected schemas (account, user, etc.)

### Observer System Features
- **File-based discovery**: Auto-loads from `src/observers/schema/ring/`
- **Universal coverage**: All database operations trigger observers
- **Performance profiling**: Automatic timing with nanosecond precision
- **Error isolation**: Async observers don't affect API responses
- **Cross-observer communication**: Metadata map for data sharing

### Security Features
- **SQL injection prevention**: Parameterized queries only
- **JWT validation**: Middleware-based authentication
- **ACL system**: Record-level access control
- **Soft delete protection**: Prevents operations on deleted records
- **Input validation**: JSON Schema + custom validation

## 🚨 Common Pitfalls & Solutions

### Import Path Issues
```typescript
// ✅ Correct: Use @src namespace
import { BaseObserver } from '@src/lib/observers/base-observer.js';

// ❌ Wrong: Relative paths
import { BaseObserver } from '../../../lib/observers/base-observer.js';
```

### Observer Ring Selection
```typescript
// ✅ Correct: Choose appropriate ring
ring = ObserverRing.InputValidation;  // For validation
ring = ObserverRing.Security;         // For access control
ring = ObserverRing.Business;         // For business logic

// ❌ Wrong: Putting SQL in wrong ring
ring = ObserverRing.InputValidation;  // Don't put SQL here!
```

### Database Transaction Management
```typescript
// ✅ Correct: Use withTransactionParams() for writes
export default withTransactionParams(async (context, { system, schema, body }) => {
    return await system.database.createAll(schema!, body);
});

// ❌ Wrong: Manual transaction management in observers
// Observers should NEVER manage transactions directly
```

### Error Handling
```typescript
// ✅ Correct: Use appropriate error types
throw new ValidationError('Invalid email', 'email');
throw new BusinessLogicError('Insufficient funds');
throw new SystemError('Database connection failed');

// ❌ Wrong: Generic errors
throw new Error('Something went wrong');
```

## 🚀 Quick Commands

```bash
# Development
npm run start:dev                    # Start dev server with auto-reload
npm run build                        # TypeScript compilation
npm run autoinstall                  # Complete environment setup

# Testing
npm run test:sh                      # Run all shell tests
npm run test:sh 15                   # Run auth tests only
npm run test:cleanup                 # Clean up test databases

# Schema Management
monk describe select schema users    # Get schema definition
monk describe create schema < file.json  # Create new schema

# Data Operations
monk data select users               # List all users
monk data create users '{"name":"John"}'  # Create user
```

## 📚 Essential Documentation

- **[docs/DEVELOPER.md](docs/DEVELOPER.md)** - Complete architecture guide
- **[docs/OBSERVERS.md](docs/OBSERVERS.md)** - Observer system details
- **[docs/API.md](docs/API.md)** - Complete API reference
- **[docs/TEST.md](docs/TEST.md)** - Testing strategies
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues

## 🔧 Technology Stack

- **Framework**: Hono (ultra-fast, ~50KB)
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL (multi-tenant)
- **Validation**: AJV (JSON Schema)
- **Authentication**: JWT
- **Runtime**: Node.js 18+ (also supports Bun, Deno, Cloudflare Workers)

---

**Next Steps**: Start with `npm run autoinstall` for setup, then explore the codebase using the patterns above. For detailed implementation questions, refer to the linked documentation files.