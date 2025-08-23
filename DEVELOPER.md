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
- **System Pattern**: Per-request context management with clean database routing
- **Multi-tenant**: JWT-based database routing with auth database validation
- **High Performance**: Schema caching, batch operations, raw SQL generation
- **Security**: ACL enforcement, soft deletes, authentication middleware

#### **Bashly CLI** (`cli/`)
- **Generated CLI**: Source in `cli/src/`, compiled to `cli/monk`
- **Persistent Config**: Uses `~/.config/monk/` for servers, auth, and test config
- **Multi-server**: Switch between development, staging, production environments
- **Full CRUD**: Complete data and meta operations matching API endpoints

#### **Test Suite** (`tests/`)
- **Three-layer Architecture**: test-all.sh → test-one.sh → individual tests
- **Tenant Isolation**: Each test gets fresh tenant database  
- **Pattern-based**: Organized by categories (05-infrastructure, 15-auth, etc.)
- **Comprehensive**: Authentication, meta API, data API, FTP, integration tests

### System Pattern Architecture

#### **System Class** (`src/lib/system.ts`)
- **Per-request context**: `System.fromContext(context)` 
- **Database routing**: `handleContextDb()` for reads, `handleContextTx()` for writes
- **Multi-tenant support**: JWT-based database context management

#### **Database Class** (`src/lib/database.ts`)  
- **System integration**: `new Database(system: System)`
- **High-level operations**: Uses `this.system.dtx` for all database access
- **Batch optimization**: Efficient updateAll, createAll, deleteAll methods
- **Security**: Soft delete protection, ACL integration, validation

#### **Auth System** (`src/lib/auth.ts`, `src/routes/auth.ts`)
- **Multi-tenant auth**: Validates tenants against `monk-api-auth` database
- **JWT routing**: Tokens contain tenant and database routing information
- **User management**: Per-tenant user authentication and access control

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
- **45-ftp**: FTP server functionality
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

## Common Development Tasks

### **Adding New API Endpoints**
```bash
# 1. Create route handler
src/routes/new-endpoint.ts

# 2. Use System pattern
export default async function (context: Context): Promise<any> {
    return await handleContextDb(context, async (system: System) => {
        // Read operation logic
        return system.database.selectAny(schemaName);
    });
}

# 3. Register in main router
src/index.ts
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

# FTP server development  
npm run ftp:dev                   # FTP server on port 2121
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

### **Common Issues**

#### **Authentication Problems**
```bash
# Check current server
monk servers current

# Verify connectivity  
monk ping

# Re-authenticate
monk auth login local-test root
```

#### **Database Connection Issues**
```bash
# Check PostgreSQL
psql -d postgres -c "SELECT version();"

# Verify auth database
psql -d monk-api-auth -c "SELECT COUNT(*) FROM tenants;"

# Check tenant database
psql -d "monk-api\$local-test" -c "SELECT COUNT(*) FROM schema;"
```

#### **CLI Regeneration Issues**
```bash
# Ensure Ruby and bashly
ruby --version && gem list bashly

# Clean regeneration
cd cli/src
rm -f ../monk
bashly generate
chmod +x ../monk
```

#### **Build Issues**
```bash
# Clean rebuild
rm -rf dist/ node_modules/
npm install
npm run compile

# Reset environment
npm run autoinstall --clean-node --clean-dist --clean-auth
```

### **Development Tips**

#### **Debugging API Issues**
- Use `npm run start:dev` for auto-reload and console logging
- Check `console.debug()` output for database operations
- Use `monk ping` to verify server connectivity and auth
- Check JWT token contents with `monk auth info`

#### **CLI Development**
- Always regenerate CLI after bashly.yml changes: `bashly generate`
- Use `CLI_VERBOSE=true` for detailed command output
- Test commands individually before batch testing
- Check `~/.config/monk/servers.json` for server configuration

#### **Database Development**  
- Use System pattern for all database operations
- Prefer batch operations (updateAll, createAll) for performance
- Always use parameterized queries for security
- Test multi-tenant scenarios with different tenant databases

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

# Testing
npm run test:all
npm run test:one tests/path/test.sh

# CLI regeneration
cd cli/src && bashly generate

# Schema management
cat schema.yaml | monk meta create schema
monk meta list schema

# Data operations
echo '{"field":"value"}' | monk data create schema
monk data list schema
monk data get schema <id>
```

### **Key Configuration Files**
- **~/.config/monk/servers.json**: Server registry and selection
- **~/.config/monk/env.json**: Environment variables  
- **~/.config/monk/test.json**: Test run history and configuration
- **cli/src/bashly.yml**: CLI command definitions
- **sql/init-auth.sql**: Auth database schema
- **sql/init-tenant.sql**: Tenant database schema

This guide provides everything needed to contribute effectively to the Monk API project, from initial setup through advanced development workflows.