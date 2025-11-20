# Developer Guide

> **Comprehensive developer and contributor guide for Monk API**

This document provides detailed architecture, development workflows, and technical specifications for contributors and advanced users.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Architecture](#project-architecture)
3. [Development Workflows](#development-workflows)
4. [Configuration Management](#configuration-management)
5. [Build and Deployment](#build-and-deployment)
6. [Performance Considerations](#performance-considerations)
7. [Contributing Guidelines](#contributing-guidelines)
8. [Recent Architectural Improvements](#recent-architectural-improvements)

## Quick Start

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
npm run test:sh spec/01-basic/api-discovery.test.sh
```

The `npm run autoinstall` script handles:
- Verifies PostgreSQL connectivity
- Creates auth database (`monk`) with tenant table
- Configures local server in `~/.config/monk/server.json`
- Creates test tenant (`local-test`) for development
- Compiles TypeScript and verifies setup

### Essential Commands

```bash
# Development
npm run start:dev                       # API server with auto-reload
npm run build                           # TypeScript compilation

# Testing
npm run test:sh                         # All shell integration tests
npm run test:cleanup                    # Clean test databases

# Fixtures
npm run fixtures:build testing         # Build test template
```

## Project Architecture

### Overview

Monk API is a lightweight PaaS backend built with **Hono** and **TypeScript**, featuring:
- **Observer-Driven Architecture**: Universal business logic through ring-based pipeline
- **Multi-tenant**: JWT-based database routing with tenant isolation
- **High Performance**: Schema caching, bulk operations, parameterized SQL
- **Security**: SQL injection prevention, ACL enforcement, soft deletes

### Core Components

#### **Hono API Server** (`src/`)
- Path-based route structure (file path = URL path)
- Middleware pattern for system context and response formatting
- Observer pipeline integration for all database operations

#### **Observer System** (`src/lib/observers/`, `src/observers/`)
- Ring-based execution: 10 ordered rings (0-9)
- Universal coverage: All database operations run through pipeline
- File-based discovery: Auto-loads from `src/observers/:schema/:ring/`
- See: [src/observers/README.md](src/observers/README.md)

#### **Test Suite** (`spec/`)
- Shell integration tests provide comprehensive coverage
- Tenant isolation: Each test gets fresh database
- Template-based: 30x faster setup with fixtures
- See: [spec/README.md](spec/README.md)

#### **Fixtures System** (`fixtures/`)
- Template-based database cloning for ultra-fast provisioning
- 30x faster setup (0.1s vs 2-3s) for tests, tenants, sandboxes
- Templates: `default` (minimal), `testing`, `testing_xl`, `demo`
- Infrastructure integration with templates, sandboxes, snapshots
- See: [fixtures/README.md](fixtures/README.md)

### System Architecture

#### **System Class** (`src/lib/system.ts`)
- Per-request context created by `systemContextMiddleware`
- Database routing: JWT-based multi-tenant context
- Service integration: `system.database.*` and `system.describe.*`

#### **Database Class** (`src/lib/database.ts`)
- Observer integration: All operations run through pipeline
- Single→Array→Pipeline pattern
- Parameterized SQL: Secure queries with PostgreSQL placeholders

#### **Describe Class** (`src/lib/describe.ts`)
- Schema definition management (CRUD)
- DDL generation: Automatic PostgreSQL table creation
- Transaction management with `run()` method

## Development Workflows

### API Development

```bash
# Development with auto-reload
npm run start:dev

# Production build and start
npm run build && npm run start
```

### Observer Development

Create observers in `src/observers/:schema/:ring/:observer-name.ts`:

```typescript
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';

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
```

Observers auto-load at server startup. See: [src/observers/README.md](src/observers/README.md)

### Testing Development

```bash
# Run all tests
npm run test:sh

# Run specific test series
npm run test:sh 31-describe-api

# Run single test
./spec/31-describe-api/create-schema.test.sh

# Clean up test databases
npm run test:cleanup
```

See: [spec/README.md](spec/README.md)

## Configuration Management

### User Configuration (`~/.config/monk/`)

The CLI and development tools use persistent configuration:

**`server.json`** - Server registry with current selection:
```json
{
  "servers": {
    "local": {
      "hostname": "localhost",
      "port": 9001,
      "protocol": "http"
    },
    "staging": {
      "hostname": "api-staging.example.com",
      "port": 443,
      "protocol": "https"
    }
  },
  "current": "local"
}
```

**`env.json`** - Environment variables:
```json
{
  "DATABASE_URL": "postgresql://user:password@localhost:5432/",
  "NODE_ENV": "development",
  "PORT": "9001",
  "JWT_SECRET": "your-secret-key"
}
```

**`test.json`** - Test run history and configuration

### Server Management

```bash
# Add servers
monk server add local localhost:9001
monk server add staging api-staging.example.com:443

# Switch servers (persistent)
monk server use staging
monk server current

# All subsequent monk commands use selected server
monk ping                           # Pings staging server
monk data select account            # Lists from staging database
```

### Multi-tenant Architecture

Monk API implements a sophisticated multi-database architecture with four entity types:

#### Infrastructure Entities

**Templates** (Immutable Prototypes)
- **Database**: `monk_template_*` (e.g., `monk_template_system`)
- **Registry**: `templates` table in central `monk` database
- **Purpose**: Pre-configured schemas for fast tenant/sandbox provisioning
- **Lifecycle**: Immutable, created via fixtures build process
- **Performance**: Instant cloning via PostgreSQL's `CREATE DATABASE WITH TEMPLATE`

**Tenants** (Production Databases)
- **Database**: `tenant_*` (e.g., `tenant_acme_abc123`)
- **Registry**: `tenants` table in central `monk` database
- **Purpose**: Production customer databases
- **Lifecycle**: Long-lived, created from templates
- **JWT Routing**: Tokens contain tenant and database information for automatic routing
- **Isolation**: Each tenant gets separate database and user management

**Sandboxes** (Temporary Testing)
- **Database**: `sandbox_*` (e.g., `sandbox_acme_xyz789`)
- **Registry**: `sandboxes` table in central `monk` database
- **Purpose**: Temporary experimental environments for safe testing
- **Lifecycle**: Short-lived with expiration dates (typically 7-14 days)
- **Source**: Cloned from templates or tenants
- **Ownership**: Team-scoped (belongs to parent tenant for collaboration)
- **API**: Managed via `/api/sudo/sandboxes/*` endpoints

**Snapshots** (Point-in-Time Backups)
- **Database**: `snapshot_*` (e.g., `snapshot_acme_backup123`)
- **Registry**: `snapshots` table in **tenant databases** (not central `monk`)
- **Purpose**: Backup before migrations, disaster recovery
- **Processing**: Async via observer pipeline using `pg_dump`/`pg_restore`
- **Status**: `pending` → `processing` → `active` or `failed`
- **Immutability**: Read-only after creation (`default_transaction_read_only = on`)
- **Restriction**: Only from tenant databases (not sandboxes)
- **API**: Managed via `/api/sudo/snapshots/*` endpoints

#### Infrastructure Management

All infrastructure operations require **sudo access** via `/api/sudo/*` endpoints:

```bash
# 1. Get sudo token (15 min validity)
POST /api/user/sudo

# 2. List templates
GET /api/sudo/templates

# 3. Create sandbox from template
POST /api/sudo/sandboxes
{
  "template": "testing",
  "expires_in_days": 7
}

# 4. Create snapshot (async)
POST /api/sudo/snapshots
{
  "name": "pre-migration",
  "snapshot_type": "pre_migration"
}

# 5. Poll snapshot status
GET /api/sudo/snapshots/pre-migration
# → Check status: pending → processing → active
```

**Complete API Reference**: [src/routes/api/sudo/PUBLIC.md](src/routes/api/sudo/PUBLIC.md)

## Build and Deployment

### Build Process

```bash
# TypeScript compilation
npm run build                       # Compiles src/ to dist/

# Complete setup
npm run autoinstall                 # Full environment setup
```

### Version Control and Releases

The project uses **managed npm package versioning**:

```bash
# Bug fixes and patches
npm run version:patch

# New features
npm run version:minor

# Major releases
npm run version:major
```

Each version command automatically:
1. **Pre-version validation**: Runs `npm run build && npm run test:sh`
2. **Version bump**: Updates `package.json` and creates Git tag
3. **Release automation**: Pushes commits/tags, creates GitHub release with auto-generated notes

### Deployment Checklist

- [ ] Run full test suite: `npm run test:sh`
- [ ] Verify build: `npm run build`
- [ ] Update version: `npm run version:minor` (or patch/major)
- [ ] Verify release created on GitHub
- [ ] Deploy to production environment
- [ ] Verify health endpoint: `curl https://api.example.com/health`

## Performance Considerations

### Schema Operations
- Schema definitions cached with SHA256 checksums (15x improvement)
- Compiled AJV validators reused across requests
- Batch operations minimize database round trips

### Database Operations
- Use batch methods (`updateAll`, `createAll`) vs individual operations
- System pattern provides efficient connection pooling per tenant
- Raw SQL generation avoids ORM overhead
- Observer pipeline optimized with preloading and single-pass execution

### Testing Performance
- Tenant isolation prevents test pollution
- Template-based testing: 30x faster setup (0.1s vs 2-3s)
- Pattern-based execution allows focused testing

**Optimization Tips:**
- Use fixtures/templates for test data
- Use batch operations for multiple records
- Cache schema compilations
- Use `where` filters to limit data processing

## Contributing Guidelines

### Git Workflow

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

### Branch Naming Conventions

- **feature/description-issue-123**: New features
- **fix/description-issue-123**: Bug fixes
- **docs/description-issue-123**: Documentation updates
- **refactor/description-issue-123**: Code refactoring
- **test/description-issue-123**: Test additions/fixes

### Code Style

**TypeScript**
- Strict typing enabled
- Use async/await patterns
- Explicit return types for public methods

**Error Handling**
- Use descriptive error messages
- Include error codes for programmatic handling
- Never expose sensitive information in errors

**Logging**
- Use global `logger` consistently
- Include structured metadata: `logger.info('message', { context })`
- Never log secrets or sensitive data

**Security**
- Validate all inputs
- Use parameterized queries (never string concatenation)
- Implement proper authentication/authorization checks
- Follow principle of least privilege

### Testing Requirements

**New Features**
- Must include comprehensive test coverage
- Add integration tests in `spec/` directory
- Update relevant README files if API changes

**Bug Fixes**
- Must include regression test
- Test should fail without the fix
- Test should pass with the fix

**API Changes**
- Update route README files
- Update PUBLIC.md if public-facing
- Add migration notes for breaking changes

### Documentation Updates

**When to Update Documentation:**
- API endpoint changes → Update `src/routes/*/README.md`
- Observer changes → Update `src/observers/README.md`
- Test changes → Update `spec/README.md`
- Architecture changes → Update this file (DEVELOPER.md)
- Breaking changes → Update migration notes

**Documentation Standards:**
- Include code examples
- Provide before/after comparisons for changes
- Use clear, concise language
- Include troubleshooting tips

### Pull Request Guidelines

**PR Title Format:**
```
Type: Brief description (#issue-number)

Examples:
Feature: Add history tracking API (#145)
Fix: Resolve SCRAM authentication issue (#152)
Docs: Update observer development guide (#160)
```

**PR Description Should Include:**
- Summary of changes
- Link to related issue(s)
- Testing performed
- Breaking changes (if any)
- Screenshots/examples (if applicable)

### Code Review Process

1. **Automated Checks**: Must pass all CI/CD checks
2. **Peer Review**: At least one approval required
3. **Testing**: All tests must pass
4. **Documentation**: Relevant docs updated
5. **Merge**: Squash and merge to main

## Recent Architectural Improvements

### Configuration Management & Security (August 2025)
- **Eliminated Security Risks**: Removed dangerous JWT_SECRET and DATABASE_URL defaults
- **Fail-Fast Validation**: Critical configuration validated with clear error messages
- **Environment-First**: Configuration must be explicitly set in `~/.config/monk/env.json`

### Logging Architecture (August 2025)
- **Global Logger Pattern**: TypeScript global declarations in `src/types/globals.d.ts`
- **Consistent Logging**: 100+ files updated with unified approach
- **Import Cleanup**: Removed logger import boilerplate across codebase

### Import Path Standardization (August 2025)
- **Explicit Structure**: All imports use `@src` namespace
- **Architectural Clarity**: Directory organization visible in imports
- **Example**: `import { BaseObserver } from '@src/lib/observers/base-observer.js'`

### Route Handler Deduplication (August 2025)
- **withParams() Pattern**: Pre-extracts common parameters (system, schema, recordId)
- **Transaction Boundary**: `withTransactionParams()` for write operations
- **25-50% Reduction**: Route handlers focus on business logic
- **Barrel Exports**: Clean organization with consistent naming

### GitHub Actions Integration (August 2025)
- **Automated Compilation**: TypeScript check on all PRs
- **Branch Protection**: Main requires passing compilation
- **Fast Feedback**: Quick validation in CI/CD pipeline

### Observer System Evolution (2024-2025)
- **Ring-Based Pipeline**: 10 ordered rings for structured execution
- **Universal Coverage**: All database operations use observers
- **Schema Integration**: Full Schema objects available to observers
- **Performance**: Preloading optimization, single-pass execution

### Testing Infrastructure (2024-2025)
- **Template System**: 30x faster test setup with fixtures
- **Tenant Isolation**: Per-test database isolation
- **Pattern Matching**: Flexible test selection
- **Comprehensive Coverage**: 200+ integration tests

---

## Additional Resources

### Component Documentation

- **Testing**: [spec/README.md](spec/README.md)
- **Observers**: [src/observers/README.md](src/observers/README.md)
- **Fixtures**: [fixtures/README.md](fixtures/README.md)
- **API Reference**: [src/routes/PUBLIC.md](src/routes/PUBLIC.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

### Route-Specific Documentation

Each API route has detailed documentation:
- Auth API: [src/routes/auth/README.md](src/routes/auth/README.md)
- Data API: [src/routes/api/data/README.md](src/routes/api/data/README.md)
- Describe API: [src/routes/api/describe/README.md](src/routes/api/describe/README.md)
- Find API: [src/routes/api/find/README.md](src/routes/api/find/README.md)
- And more in `src/routes/*/README.md`

### External Resources

- **GitHub Repository**: https://github.com/ianzepp/monk-api
- **Issue Tracker**: https://github.com/ianzepp/monk-api/issues
- **CLI Tool**: https://github.com/ianzepp/monk-cli

---

Happy coding! 🚀
