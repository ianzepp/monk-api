# Troubleshooting Guide

## Table of Contents
1. [Systematic Debugging Approach](#systematic-debugging-approach)
2. [Common Issues](#common-issues)
3. [Advanced Debugging Techniques](#advanced-debugging-techniques)
4. [Component-Specific Debugging](#component-specific-debugging)
5. [Development Tips](#development-tips)

## Systematic Debugging Approach

When issues arise, follow this systematic approach based on recent debugging experience:

### 1. Isolate the Problem Scope
```bash
# Determine if issue is environmental or code-related
git status                              # Check for uncommitted changes
npm run compile                         # Verify TypeScript compilation
npm run spec:all unit                   # Test unit tests (no external dependencies)

# Check basic connectivity
psql -d monk-api-auth -c "SELECT current_user;"   # Test direct PostgreSQL
curl http://localhost:9001/health               # Test HTTP API if running
```

### 2. Environment vs Code Issues
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

### 3. Database-Specific Debugging
```bash
# Test database layers systematically
psql -d postgres -c "SELECT version();"                    # PostgreSQL server
psql -d monk-api-auth -c "SELECT COUNT(*) FROM tenants;"   # Auth database
psql -d "monk-api\$local-test" -c "SELECT COUNT(*) FROM schema;" # Tenant database

# Test Node.js database connections
npm run spec:one spec/unit/database-connection-test.test.ts  # Direct connections
npm run spec:one spec/05-infrastructure/connectivity.test.ts # Integration tests
```

## Common Issues

### PostgreSQL Authentication Problems

#### SCRAM Authentication Error
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

#### Connection Refused Errors
```bash
# Check PostgreSQL service status
sudo systemctl status postgresql
sudo systemctl start postgresql

# Check listening ports
sudo netstat -tlnp | grep 5432
ps aux | grep postgres
```

### TypeScript Testing Issues

#### Integration Tests Failing
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

#### Unit Tests vs Integration Tests
```bash
# Unit tests should always work (no external dependencies)
npm run spec:all unit                   # Should pass consistently

# Integration tests require database and configuration
npm run spec:all integration            # May fail with config issues

# If unit tests fail → Code issue
# If integration tests fail → Environment/config issue
```

### HTTP API Issues

#### Server Won't Start
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

#### API Endpoints Failing
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

### Configuration Issues
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

### Observer System Issues
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

## Advanced Debugging Techniques

### When "Everything Worked Before" Issues
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

### Environment vs Code Issue Identification
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

### Database Connection Debugging
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

## Component-Specific Debugging

### Filter System Debugging
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

### FTP Middleware Debugging
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

### Observer System Debugging
```bash
# Test observer loading and execution
npm run compile                         # Ensure observers compiled
npm run start:dev                       # Check observer loading logs

# Look for observer loading messages:
# "✅ Observer loaded: ObserverName (ring N, schema X)"

# Test individual observers
npm run spec:all unit/observers         # Unit test observers
npm run spec:one spec/integration/observer-pipeline.test.ts

# Debug observer execution in development
# Look for execution timing logs:
# "[TIME] Observer: ObserverName 1.234ms { ring: N, operation: 'create' }"
```

### CLI Development Debugging
```bash
# Check CLI regeneration
cd cli/src && bashly generate

# Test CLI commands individually
monk --help                             # Basic CLI functionality
monk server list                       # Server configuration
monk auth token                         # Authentication

# Enable verbose CLI output
CLI_VERBOSE=true monk data select schema

# Check monk configuration
cat ~/.config/monk/server.json
cat ~/.config/monk/env.json
```

### Database Operations Debugging
```bash
# Check database connections
psql -d monk-api-auth -c "SELECT current_user;"
psql -d "monk-api\$local-test" -c "SELECT name FROM schema;"

# Test database operations manually
npm run compile                         # Ensure compiled
node -e "
  import { System } from './dist/lib/system.js';
  // Test database operations directly
"

# Check observer pipeline execution
npm run spec:one spec/integration/observer-pipeline.test.ts
```

## Development Tips

### Debugging API Issues
- **Start simple**: Test `/health` endpoint first, then build complexity
- **Layer by layer**: HTTP → Auth → Database → Business Logic
- **Systematic isolation**: Unit tests → Integration tests → HTTP endpoints
- **Environment first**: Rule out external dependencies before code debugging
- **Use manual testing**: curl commands to verify endpoint functionality
- **Check logs**: `npm run start:dev` provides detailed operation logging

### CLI Development
- Always regenerate CLI after bashly.yml changes: `bashly generate`
- Use `CLI_VERBOSE=true` for detailed command output
- Test commands individually before batch testing
- Check `~/.config/monk/server.json` for server configuration

### Observer Development
- **All Database operations** automatically run observer pipeline with 10-ring execution
- **Schema objects available**: Observers receive full `Schema` objects with validation capabilities
- **Create observers** in `src/observers/schema/ring/` for auto-discovery by ObserverRunner
- **Use `BaseObserver`** class with executeTry/execute pattern for error handling
- **Observer context**: Access `context.schema.isSystemSchema()`, `context.schema.validateOrThrow()`
- **Unit testable**: Most observers can be unit tested without database setup
- **Test integration**: Use vitest framework for real database observer testing
- **Check logs**: Look for `✅ Observer executed:` messages during development

### Database Development  
- **All CRUD operations** now use universal observer pipeline with Schema object context
- **Database methods** follow single→array→pipeline pattern consistently
- **Route handlers**: Use `context.get('system').database.*()` for database operations
- **Observer pipeline**: Provides validation, security, audit automatically with Schema objects
- **Schema loading**: ObserverRunner loads Schema objects once per operation for all observers
- **Test integration**: Observer pipeline transparent to existing database tests

### Transaction Management
- **Clean DB/TX separation**: `system.db` (always available) vs `system.tx` (SQL Observer managed)
- **Observer-driven transactions**: Observers signal transaction needs via `this.needsTransaction(context, reason)`
- **SQL Observer control**: Ring 5 manages all transaction boundaries (begin/commit/rollback)
- **Transaction visibility**: Nested database calls automatically use active transaction context
- **ACID compliance**: Multi-observer operations maintain data integrity with proper isolation

### Logging Patterns
- **`logger.info/warn`**: Use consistently throughout codebase (global logger pattern)
- **Observer logging**: Always use `logger.info()` since global logger is available
- **Structured metadata**: Include schemaName, operation, and relevant context in logs
- **Performance timing**: Use manual timing with `logger.info()` for performance tracking

### Performance Debugging
```bash
# Monitor observer execution times
npm run start:dev                       # Watch for timing logs

# Test with integration tests
npm run spec:ts integration             # Run integration test suite

# Database query analysis
# Enable PostgreSQL query logging if needed
# Check for N+1 queries, missing indexes, etc.
```

### Configuration Debugging
```bash
# Verify all configuration files
ls -la ~/.config/monk/
cat ~/.config/monk/env.json | jq .
cat ~/.config/monk/server.json | jq .

# Test configuration loading
node -e "
  import { MonkEnv } from './dist/lib/monk-env.js';
  console.log('DATABASE_URL:', MonkEnv.get('DATABASE_URL'));
  console.log('JWT_SECRET:', MonkEnv.get('JWT_SECRET') ? '[SET]' : '[NOT SET]');
"

# Reset configuration if needed
rm -rf ~/.config/monk/
npm run autoinstall
```

### Error Analysis Patterns
```bash
# Categorize errors by type
# 1. Compilation errors → TypeScript issues
# 2. Connection errors → Database/network issues
# 3. Authentication errors → JWT/tenant issues
# 4. Validation errors → Schema/data issues
# 5. Observer errors → Business logic issues

# Use appropriate debugging approach for each category
npm run compile                         # For compilation errors
psql -d monk-api-auth -c "SELECT 1;"   # For connection errors
monk auth token                         # For authentication errors
npm run spec:all unit/filter            # For validation errors
npm run spec:all unit/observers         # For observer errors
```

---

This troubleshooting guide provides systematic approaches to diagnose and resolve common issues in the Monk API project. For component-specific details, refer to the specialized documentation files ([OBSERVERS.md](OBSERVERS.md), [TESTING.md](TESTING.md), etc.).