# Troubleshooting Guide

Quick solutions for common issues in the Monk API project.

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [PostgreSQL Issues](#postgresql-issues)
3. [Server Issues](#server-issues)
4. [Configuration Issues](#configuration-issues)
5. [Database Connection Issues](#database-connection-issues)
6. [Component-Specific Troubleshooting](#component-specific-troubleshooting)

## Quick Diagnosis

Follow this systematic approach to identify issues:

### 1. Check Basic Connectivity

```bash
# Test PostgreSQL directly
psql -d monk -c "SELECT current_user;"

# Test HTTP API (if running)
curl http://localhost:9001/health

# Test compilation
npm run build
```

### 2. Identify Issue Type

Create a diagnostic matrix:

| psql | Node.js | HTTP API | Issue Type |
|------|---------|----------|------------|
| ✅ | ❌ | ❌ | Authentication/Environment |
| ❌ | ❌ | ❌ | PostgreSQL Server |
| ✅ | ✅ | ❌ | HTTP/Code |
| ✅ | ✅ | ✅ | Test Configuration |

### 3. Check Environment

```bash
# Verify configuration
cat ~/.config/monk/env.json | jq .

# Check required environment variables
echo $DATABASE_URL    # Must include password for PostgreSQL 17+
echo $JWT_SECRET      # Should be set
echo $NODE_ENV        # development/production/test
```

## PostgreSQL Issues

### SCRAM Authentication Error

**Error Message:**
```
SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
```

**Symptoms:**
- `psql` command works fine
- Node.js applications fail with authentication error
- Started happening after PostgreSQL update

**Root Cause:**
PostgreSQL 17.6+ defaults to SCRAM-SHA-256 authentication which requires explicit passwords in connection strings. Connection strings without passwords (relying on peer/trust auth) will fail.

**Diagnostic Steps:**

```bash
# 1. Test direct psql (should work)
psql -U $USER -d monk -c "SELECT current_user;"

# 2. Check DATABASE_URL configuration
cat ~/.config/monk/env.json | grep DATABASE_URL

# 3. Verify password is included
# ✅ Correct: postgresql://user:password@localhost:5432/monk
# ❌ Wrong:   postgresql://user@localhost:5432/monk
```

**Solution:**

Update your `DATABASE_URL` to include the password:

```bash
# In ~/.config/monk/env.json or .env
DATABASE_URL=postgresql://user:password@localhost:5432/monk
```

If using peer authentication locally, you may need to:
1. Set a password for your PostgreSQL user
2. Update `pg_hba.conf` to allow password authentication
3. Include the password in all connection strings

**Code Pattern:**
All database connections should use the base `DATABASE_URL` with password:

```typescript
// ✅ Correct: Use DATABASE_URL as base
const connectionString = process.env.DATABASE_URL.replace('/monk', '/tenant_db');

// ❌ Wrong: Build connection string without password
const connectionString = `postgresql://${user}@${host}:${port}/${database}`;
```

### Connection Refused Errors

```bash
# Check PostgreSQL service status
sudo systemctl status postgresql
sudo systemctl start postgresql

# macOS (Homebrew)
brew services list
brew services restart postgresql@17

# Check listening ports
sudo netstat -tlnp | grep 5432
ps aux | grep postgres

# Test connection
pg_isready
```

### Permission Denied Errors

```bash
# Check database permissions
psql -d monk -c "\du"  # List users and roles

# Grant necessary permissions
psql -d monk -c "GRANT ALL PRIVILEGES ON DATABASE monk TO your_user;"
```

## Server Issues

### Server Won't Start

**Check port availability:**
```bash
# Check if port 9001 is in use
lsof -i :9001
netstat -tlnp | grep 9001

# Kill existing process if needed
kill -9 $(lsof -ti:9001)
```

**Check database connectivity:**
```bash
# Server requires database connection at startup
psql -d monk -c "SELECT 1;"

# If fails, fix PostgreSQL first (see PostgreSQL Issues)
```

**Check observer system:**
```bash
# Ensure TypeScript compiled
npm run build

# Start in development mode to see detailed logs
npm run start:dev

# Look for observer loading errors
# Should see: "✅ Observer loaded: ObserverName (ring N, schema: X)"
```

**Clean restart:**
```bash
# Stop any running servers
npm run stop

# Clean build
npm run build

# Start fresh
npm run start:dev
```

### API Endpoints Failing

**Test incrementally:**

```bash
# 1. Test health endpoint (no auth, no database)
curl http://localhost:9001/health

# 2. Test root endpoint (no auth, basic info)
curl http://localhost:9001/

# 3. Test authenticated endpoint
TOKEN=$(node -e "console.log(process.env.JWT_TOKEN)")
curl -H "Authorization: Bearer $TOKEN" http://localhost:9001/api/auth/whoami
```

**Check authentication:**
```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET

# Get fresh token
npm run test:sh 10-auth/public-auth.test.sh
```

## Configuration Issues

### Missing or Invalid Configuration

```bash
# Check configuration exists
ls -la ~/.config/monk/

# Validate JSON syntax
cat ~/.config/monk/env.json | jq .

# Check required fields
cat ~/.config/monk/env.json | jq '{DATABASE_URL, JWT_SECRET, NODE_ENV}'
```

### Reset Configuration

```bash
# Regenerate configuration (interactive)
npm run autoinstall

# Or manually create ~/.config/monk/env.json
{
  "DATABASE_URL": "postgresql://user:password@localhost:5432/monk",
  "JWT_SECRET": "your-secret-key",
  "NODE_ENV": "development",
  "PORT": "9001"
}
```

### Environment Variables Not Loading

```bash
# Check if .env file exists (if not using ~/.config/monk/)
ls -la .env

# Verify dotenv is loading
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL)"

# Source environment manually for debugging
export $(cat .env | xargs)
```

## Database Connection Issues

### Systematic Database Testing

Test each layer independently:

```bash
# 1. PostgreSQL server
psql -d postgres -c "SELECT version();"

# 2. Auth database (monk)
psql -d monk -c "SELECT COUNT(*) FROM tenants;"

# 3. Tenant database (if exists)
psql -d tenant_test_abc123 -c "SELECT COUNT(*) FROM schemas;"
```

### Connection String Debugging

```bash
# Compare working vs failing patterns

# ✅ Working (with password):
DATABASE_URL=postgresql://user:password@localhost:5432/monk

# ❌ Failing (without password on PostgreSQL 17+):
DATABASE_URL=postgresql://user@localhost:5432/monk

# Test connection string manually
psql "postgresql://user:password@localhost:5432/monk" -c "SELECT 1;"
```

### Database Not Found

```bash
# List all databases
psql -l

# Create monk database if missing
createdb monk

# Or via psql
psql -d postgres -c "CREATE DATABASE monk;"

# Initialize schema
npm run db:migrate  # If migration scripts exist
```

## Component-Specific Troubleshooting

For detailed troubleshooting of specific components, see:

### Testing
**Location:** [spec/README.md](spec/README.md#troubleshooting)

Common issues:
- Server won't start
- Database connection issues
- Test database pollution
- Tests timing out

```bash
# Quick fixes
npm run test:cleanup              # Clean test databases
npm run stop && npm run start:bg  # Restart server
npm run fixtures:build testing    # Rebuild templates
```

### Observers
**Location:** [src/observers/README.md](src/observers/README.md#best-practices)

Common issues:
- Observers not loading
- TypeScript compilation errors
- Observer execution errors

```bash
# Quick fixes
npm run build                     # Compile observers
npm run start:dev                 # Check loading logs
```

### Fixtures/Templates
**Location:** [fixtures/README.md](fixtures/README.md#troubleshooting)

Common issues:
- Template not found
- Template locked
- Permission denied

```bash
# Quick fixes
npm run fixtures:build testing   # Build template
rm fixtures/testing/.locked       # Unlock (if intentional)
```

## Quick Reference Commands

### Restart Everything
```bash
npm run stop
npm run build
npm run fixtures:build testing
npm run start:bg
```

### Check All Systems
```bash
# Database
psql -d monk -c "SELECT 1;"
pg_isready

# Server
curl http://localhost:9001/health

# Build
npm run build

# Tests
npm run test:sh 01-basic
```

### Clean Slate
```bash
# Stop server
npm run stop

# Clean test databases
npm run test:cleanup

# Rebuild everything
npm run build
npm run fixtures:build testing

# Start fresh
npm run start:dev
```

## Getting Help

If you're still stuck after trying these solutions:

1. **Check logs:** `npm run start:dev` provides detailed output
2. **Run tests:** `npm run test:sh 01-basic` to verify basic functionality
3. **Review recent changes:** `git log --oneline -10` to see what changed
4. **Check PostgreSQL logs:** Look for authentication or connection errors
5. **Verify environment:** Ensure all required environment variables are set

## Common Error Messages

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| `client password must be a string` | PostgreSQL SCRAM auth | Add password to DATABASE_URL |
| `Connection refused` | PostgreSQL not running | Start PostgreSQL service |
| `Port 9001 already in use` | Server already running | `npm run stop` |
| `Template database not found` | Missing fixtures | `npm run fixtures:build testing` |
| `JWT verification failed` | Invalid token | Regenerate with `/auth/login` |
| `permission denied` | Database permissions | Check user privileges |

---

**For detailed component documentation, see the README files in each directory.**
