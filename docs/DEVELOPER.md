# Monk API Developer Guide

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Project Architecture](#2-project-architecture)
3. [Development Workflows](#3-development-workflows)
4. [Configuration Management](#4-configuration-management)
5. [Build and Deployment](#5-build-and-deployment)
6. [Performance Considerations](#6-performance-considerations)
7. [Contributing Guidelines](#7-contributing-guidelines)
8. [Quick Reference](#8-quick-reference)
9. [Recent Architectural Improvements](#9-recent-architectural-improvements)

## 📋 Complete Documentation Index

- **🏗️ [DEVELOPER.md](DEVELOPER.md)** - This guide: Architecture, workflows, quick start
- **🔍 [docs/API.md](docs/API.md)** - Complete API endpoints, patterns, and examples
- **👁️ [docs/OBSERVERS.md](docs/OBSERVERS.md)** - Observer system development guide
- **🧪 [docs/TESTING.md](docs/TESTING.md)** - Comprehensive testing strategies and patterns
- **🔧 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Systematic debugging and issue resolution
- **📁 [docs/FILE.md](docs/FILE.md)** - FS middleware filesystem-like interface
- **🔎 [docs/FILTER.md](docs/FILTER.md)** - Enterprise filter system with 25+ operators
- **📊 [docs/SPEC.md](docs/SPEC.md)** - Complete test specification and template system

---

## 1. Quick Start

### Prerequisites

- **Node.js 18+** and npm
- **PostgreSQL 12+** server running and accessible
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
npm run spec:sh spec/10-connection/basic-ping.test.sh
```

The `npm run autoinstall` script handles all setup steps automatically:
- Verifies PostgreSQL connectivity
- Creates auth database (`monk_main`) with tenant table
- Configures local server in `~/.config/monk/server.json`
- Creates test tenant (`local-test`) for development
- Compiles TypeScript and verifies complete setup

### Essential Commands

```bash
# Development
npm run start:dev                       # API server with auto-reload
monk server use local                  # Switch to local server
monk auth login local-test root         # Authenticate

# Testing
npm run spec                           # All tests (TypeScript → Shell)
npm run spec:ts unit                   # Unit tests only
npm run spec:sh 15                     # Authentication tests

# Schema management
cat contacts.json | monk describe create schema
monk describe select schema contacts

# Data operations (automatic observer pipeline)
echo '{"name":"test"}' | monk data create users
monk data select users
```

> **📖 For detailed testing strategies, see [docs/TESTING.md](docs/TESTING.md)**

---

## 2. Project Architecture

### Overview

Monk API is a lightweight PaaS backend built with **Hono** and **TypeScript**, featuring a **System pattern architecture** for clean per-request database context management.

### Core Components

#### **Hono API Server** (`src/`)
- **Observer-Driven Architecture**: Universal business logic execution through ring-based observer pipeline
- **Path-Based Route Structure**: Intuitive file organization where file path = URL path
- **Middleware Pattern**: System context and response formatting through clean middleware chain
- **Multi-tenant**: JWT-based database routing with auth database validation
- **High Performance**: Schema caching, bulk operations, selective ring execution, parameterized SQL
- **Security**: SQL injection prevention, ACL enforcement, soft deletes, observer-based validation and audit

#### **API Management**
- **CLI Tool**: Available as standalone [monk-cli](https://github.com/ianzepp/monk-cli) project
- **Persistent Config**: Uses `~/.config/monk/` for servers, auth, and test config
- **Multi-server**: Switch between development, staging, production environments
- **Full CRUD**: Complete data and describe operations matching API endpoints

#### **Observer System** (`src/lib/observers/`, `src/observers/`)
- **Ring-Based Execution**: 10 ordered rings (0-9) for structured business logic execution
- **Universal Coverage**: All database operations automatically run through observer pipeline
- **File-Based Discovery**: Observers organized by schema and ring number for easy management
- **Extensible Business Logic**: Add validation, security, audit, integration without touching core code

> **📖 For complete observer development guide, see [docs/OBSERVERS.md](docs/OBSERVERS.md)**

#### **Unified Test Suite** (`spec/`)
- **Side-by-side Organization**: TypeScript (.test.ts) and Shell (.test.sh) tests co-located by functionality
- **Three-tier Commands**: `npm run spec` (both), `npm run spec:ts` (TypeScript), `npm run spec:sh` (Shell)
- **Tenant Isolation**: Each test gets fresh tenant database
- **Comprehensive Testing**: Isolated test environments with shell script and TypeScript integration

> **📖 For comprehensive testing guide, see [docs/TESTING.md](docs/TESTING.md)**

### Observer-Driven Architecture

#### **System Class** (`src/lib/system.ts`)
- **Per-request context**: Created by `systemContextMiddleware` and attached to `context.get('system')`
- **Database routing**: JWT-based multi-tenant database context management
- **Service Integration**: Provides system.database.* and system.describe.* unified APIs
- **Dependency Injection**: Provides SystemContext interface to break circular dependencies

#### **Database Class** (`src/lib/database.ts`)
- **Observer Integration**: All operations run through universal observer pipeline
- **Single→Array→Pipeline**: Consistent pattern across all CRUD methods
- **Recursion Protection**: `SQL_MAX_RECURSION = 3` prevents infinite observer loops
- **Universal Coverage**: createOne, updateOne, deleteOne, selectOne, revertOne all use observers
- **Parameterized SQL**: Secure queries using Filter.toSQL() pattern with PostgreSQL placeholders

#### **Describe Class** (`src/lib/describe.ts`)
- **Schema Definition Management**: Clean CRUD operations for schema JSON definitions
- **Consistent Patterns**: Follows Database class architecture (createOne, selectOne, updateOne, deleteOne)
- **Transaction Management**: Clean begin/commit/rollback pattern with run() method
- **DDL Generation**: Automatic PostgreSQL table creation from JSON Schema

#### **Middleware Architecture** (`src/lib/middleware/`)
- **systemContextMiddleware**: Universal System setup and global error handling
- **responseJsonMiddleware**: Automatic JSON formatting for `/api/data/*` routes
- **responseJsonMiddleware**: Enhanced JSON formatting with automatic error handling for `/api/describe/*` routes

> **📖 For complete API documentation, see [docs/API.md](docs/API.md)**

### Enterprise Systems

#### **Filter System** - 25+ Advanced Operators
- **PostgreSQL Arrays**: ACL operations ($any, $all, $nany, $nall, $size)
- **Logical Operations**: Deep nesting with $and, $or, $not, $nand, $nor
- **Performance**: 500+ parameters, 6+ nesting levels, complex ACL queries

> **📖 For complete filter documentation, see [docs/FILTER.md](docs/FILTER.md)**

#### **FS Middleware** - Filesystem-like API Access
- **Path Structure**: `/data/users/user-123.json` → Complete record access
- **Core Operations**: `POST /api/file/list`, `POST /api/file/store`, `POST /api/file/delete`
- **Advanced Features**: Wildcard patterns, atomic transactions, caching

> **📖 For complete FS documentation, see [docs/FILE.md](docs/FILE.md)**

---

## 3. Development Workflows

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
# Create schema from JSON
cat contacts.json | monk describe create schema

# Read new schema JSON
monk describe select schema contacts

# Delete schema
monk describe delete schema contacts
```

### Observer Development

#### **Observer Ring System (Brief Overview)**

The observer system executes business logic in **10 ordered rings (0-9)** for every database operation:

```typescript
Ring 0: DataPreparation // Data loading, merging, input preparation
Ring 1: InputValidation // Schema validation, format checks, basic integrity
Ring 2: Security        // Access control, protection policies, rate limiting
Ring 3: Business        // Complex business logic, domain rules, workflows
Ring 4: Enrichment      // Data enrichment, defaults, computed fields
Ring 5: Database        // 🎯 SQL EXECUTION
Ring 6: PostDatabase    // Immediate post-database processing
Ring 7: Audit           // Audit logging, change tracking, compliance
Ring 8: Integration     // External APIs, webhooks, cache invalidation (async)
Ring 9: Notification    // User notifications, email alerts, real-time updates (async)
```

#### **Creating Basic Observer**

```bash
# 1. Create observer file in appropriate directory
src/observers/users/1/custom-validation.ts     # User schema, validation ring
src/observers/all/7/audit-logger.ts            # All schemas, audit ring

# 2. Implement observer
export default class CustomValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { schema, data } = context;

        for (const record of data) {
            schema.validateOrThrow(record);
            // Custom validation logic
        }
    }
}

# 3. Observer auto-discovery loads it at server startup
npm run start:dev  # Observer system loads new observer automatically
```

> **📖 For complete observer development guide, see [docs/OBSERVERS.md](docs/OBSERVERS.md)**

### Testing Development

#### **Unified Test Commands**

```bash
npm run spec [pattern]              # Complete coverage (TypeScript → Shell)
npm run spec:ts [pattern]           # TypeScript tests only
npm run spec:sh [pattern]           # Shell tests only

# Examples
npm run spec 15                     # All auth tests
npm run spec:ts unit/filter         # Filter unit tests
npm run spec:sh observer-startup    # Observer integration test
```

#### **Testing Development**

Run tests for validation and development:

```bash
# Quick validation
npm run spec:ts unit                   # Fast unit tests
npm run spec:sh basic-ping             # Basic connectivity test
```

> **📖 For comprehensive testing guide, see [docs/TESTING.md](docs/TESTING.md)**

---

## 4. Configuration Management

### **User Configuration** (`~/.config/monk/`)
- **server.json**: Server registry with current server selection
- **env.json**: Environment variables (DATABASE_URL, NODE_ENV, PORT)
- **test.json**: Test run history and configuration

### **Server Management**
```bash
# Add servers
monk server add local localhost:9001
monk server add staging api-staging.example.com:443

# Switch servers (persistent)
monk server use staging
monk server current

# All subsequent monk commands use selected server
monk ping                         # Pings staging server
monk data select account            # Lists from staging database
```

### **Multi-tenant Architecture**
- **Main Database**: `monk_main` contains tenant registry
- **Tenant Databases**: `tenant_12345678` for each tenant
- **JWT Routing**: Tokens contain tenant and database routing information
- **Isolation**: Each tenant gets separate database and user management

### **Environment Configuration**
```bash
# ~/.config/monk/env.json
{
  "DATABASE_URL": "postgresql://user:pass@localhost:5432/",
  "NODE_ENV": "development",
  "PORT": "9001"
}

# ~/.config/monk/server.json
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

---

## 5. Build and Deployment

### **Build Process**
```bash
# TypeScript compilation
npm run compile                   # Compiles src/ to dist/

# Complete build
npm run autoinstall              # Full environment setup
```

### **Version Control and Releases**

The project uses **managed npm package versioning** with manual control:

```bash
# Bug fixes and patches
npm run version:patch

# New features
npm run version:minor

# Major releases
npm run version:major
```

Each version command automatically:
1. **Pre-version validation**: Runs `npm run compile && npm run test:all`
2. **Version bump**: Updates `package.json` version and creates Git tag
3. **Release automation**: Pushes commits/tags, creates GitHub release with auto-generated notes

---

## 6. Performance Considerations

### **Schema Operations**
- Schema definitions are cached with SHA256 checksums (15x performance improvement)
- Compiled AJV validators are reused across requests
- Batch operations minimize database round trips

### **Database Operations**
- Use batch methods (updateAll, createAll) vs individual operations
- System pattern provides efficient connection pooling per tenant
- Raw SQL generation avoids ORM overhead
- Observer pipeline optimized with preloading and single-pass execution

### **Testing Performance**
- Tenant isolation ensures no test pollution
- Template-based testing provides 25-130x faster setup
- Pattern-based test execution allows focused testing

---

## 7. Contributing Guidelines

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
- **Logging**: Use global logger consistently, structured metadata
- **Security**: Never log secrets, validate all inputs, use parameterized queries

### **Testing Requirements**
- **New features**: Must include comprehensive test coverage
- **Bug fixes**: Must include regression test
- **API changes**: Update integration tests

### **Documentation Updates**
- **API changes**: Update route documentation
- **Architecture changes**: Update specialized documentation files
- **Breaking changes**: Update migration notes

---

## 8. Quick Reference

### **Essential Commands**
```bash
# Setup
npm run autoinstall

# Development
npm run start:dev
monk server use local
monk auth login local-test root

# Testing
npm run spec                           # All tests
npm run spec:ts unit                   # Unit tests only
npm run spec:sh 15                     # Auth tests
npm run spec:one spec/path/test.test.ts # Single test

# Schema management
cat contacts.json | monk describe create schema
monk describe select schema contacts

# Data operations (automatic observer pipeline)
echo '{"field":"value"}' | monk data create contacts
monk data select contacts
monk data select contacts <id>

# Observer development
# Create: src/observers/schema/ring/observer.ts
# Test: npm run spec:ts unit/observers
# Integration: npm run spec:sh observer-startup-test.sh

# Releases
npm run version:patch
npm run version:minor
npm run version:major
```

### **Key Configuration Files**
- **~/.config/monk/server.json**: Server registry and selection
- **~/.config/monk/env.json**: Environment variables
- **~/.config/monk/test.json**: Test run history and configuration
- **sql/init-auth.sql**: Auth database schema
- **sql/init-tenant.sql**: Tenant database schema

### **Common Development Tasks**

#### **Adding New API Endpoints**
```typescript
// src/routes/new-endpoint.ts
import { withParams } from '@src/lib/route-helpers.js';

export default withParams(async (context, { system, schema, body }) => {
    const result = await system.database.selectAny(schema!);
    setRouteResult(context, result);
});
```

#### **Creating Observers**
```typescript
// src/observers/users/1/validator.ts
export default class UserValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        // Implementation
    }
}
```

### **Troubleshooting Quick Checks**
```bash
# Check system health
npm run compile                    # TypeScript compilation
psql -d monk_main -c "SELECT 1;" # Database connectivity
curl http://localhost:9001/health  # API server

# Common fixes
npm run autoinstall               # Reset configuration
rm -rf ~/.config/monk/ && npm run autoinstall # Nuclear reset
```

> **📖 For systematic troubleshooting, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**

---

## 9. Recent Architectural Improvements

### **Configuration Management & Security Hardening** (August 2025)
- **Eliminated Security Risks**: Removed dangerous JWT_SECRET and DATABASE_URL defaults
- **Fail-Fast Validation**: All critical configuration values properly validated with clear error messages

### **Logging Architecture Modernization** (August 2025)
- **Global Logger Pattern**: Implemented TypeScript global declarations in `src/types/globals.d.ts`
- **Consistent Logging**: 100+ files updated with unified global logger approach
- **Import Cleanup**: Removed logger import boilerplate across entire codebase

### **Import Path Standardization** (August 2025)
- **Explicit Directory Structure**: All imports use @src namespace for clear visibility
- **Architectural Clarity**: Directory organization visible in every import statement
- **Example**: `import { BaseObserver } from '@src/lib/observers/base-observer.js'`

### **Route Handler Deduplication** (August 2025)
- **withParams() Pattern**: Pre-extracts common parameters (system, schema, recordId, body)
- **Content-Type Intelligence**: JSON/Binary body handling for future file upload support
- **25-50% Boilerplate Reduction**: Route handlers focus on pure business logic
- **Barrel Exports**: Clean organization with SchemaGet/RecordGet naming convention

### **GitHub Actions Integration** (August 2025)
- **Automated Compilation**: TypeScript compile check on all pull requests
- **Branch Protection**: Main branch requires passing compilation before merge
- **Fast Feedback**: Quick validation of TypeScript changes in CI/CD pipeline

---

## Next Steps

This guide provides everything needed to contribute effectively to the Monk API project. For deeper dives into specific areas:

- **🔍 API Development**: Start with [docs/API.md](docs/API.md) for endpoint patterns and examples
- **👁️ Observer Development**: See [docs/OBSERVERS.md](docs/OBSERVERS.md) for complete observer guide
- **🧪 Testing Strategy**: Review [docs/TESTING.md](docs/TESTING.md) for comprehensive testing approaches
- **🔧 Issues & Debugging**: Consult [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for systematic problem-solving
- **📁 Advanced Features**: Explore [docs/FILE.md](docs/FILE.md) and [docs/FILTER.md](docs/FILTER.md) for specialized systems

Happy coding! 🚀
