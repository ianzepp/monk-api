# PostgreSQL Schemas Architecture Refactor

**Status**: Design Document
**Created**: 2025-01-23
**Purpose**: Comprehensive guide for refactoring from multi-database to hybrid database+schema architecture

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Architecture Design](#architecture-design)
4. [Key Decisions](#key-decisions)
5. [Database Structure](#database-structure)
6. [Infrastructure Changes](#infrastructure-changes)
7. [Code Changes](#code-changes)
8. [Fixture System Redesign](#fixture-system-redesign)
9. [Security Considerations](#security-considerations)
10. [Performance Implications](#performance-implications)
11. [Implementation Checklist](#implementation-checklist)
12. [Future Optimizations](#future-optimizations)

---

## Problem Statement

### Current Architecture

**Multi-Database Approach:**
- Main database: `monk` (infrastructure registry)
- Template databases: `monk_template_system`, `monk_template_demo_crm`, etc.
- Tenant databases: `tenant_<hash-16>` (one database per tenant)
- Test databases: `test_<hash-16>` (one database per test)

**Critical Issue: Connection Pool Exhaustion**

Documented in `src/lib/database-connection.ts:10-67`:

```
Math: 10 (main) + 20 tenants × 5 connections = 110 connections
→ EXCEEDS default PostgreSQL max_connections=100
```

**Symptoms:**
- "sorry, too many clients already" errors during tests
- Failed tenant registrations during burst signups
- Tests cannot run in parallel (each test creates new database)
- Scalability ceiling at ~20 active tenants

**Current Mitigation (Insufficient):**
- Semaphore limiting (3 concurrent tenant creations)
- Idle timeout: 30 seconds
- Reduced pool sizes for test databases (2 connections)

### Why Not PgBouncer?

While PgBouncer is industry standard, we prefer to:
1. **Fix the root cause** rather than add another network layer
2. **Maintain simplicity** in development/testing environments
3. **Keep PgBouncer as future option** if additional pooling needed later
4. **Solve locally first** before introducing external dependencies

---

## Solution Overview

### Hybrid Database + Schema Architecture

**Core Principle**: Separate logical tenant isolation (schemas) from physical database distribution.

**Every tenant uses schemas internally**, but can be distributed across databases based on:
- **Volume**: High-volume tenants get dedicated database
- **Security**: Security-sensitive tenants get database-level isolation
- **Geography**: Regional distribution (db_us_east, db_us_west)
- **Performance**: Resource isolation for premium clients

### The Key Insight

Instead of choosing "database-per-tenant" XOR "schema-per-tenant", we choose BOTH:

```
Tenants table:
  database: "db_main"              ← Which physical database
  schema: "ns_tenant_a1b2c3d4"     ← Which schema (namespace) within that database
```

**Benefits:**
- ✅ Solves connection pool exhaustion (shared pools)
- ✅ Maintains flexibility for premium isolation (dedicated databases)
- ✅ Enables regional distribution
- ✅ Simplifies test infrastructure (schema creation ~50ms vs database ~1-2s)
- ✅ Future-proof for horizontal scaling

---

## Architecture Design

### Database Distribution Strategy

```
monk (infrastructure database)
├── public schema
│   ├── templates (infrastructure table)
│   ├── tenants (infrastructure table)
│   ├── sandboxes (infrastructure table)
│   └── requests (infrastructure table)
├── monk_system schema
│   ├── models, fields, users, snapshots, etc.
│   └── (was monk_template_system database)
└── monk_template_<name> schemas
    ├── monk_template_demo_crm
    ├── monk_template_testing
    └── ...

db_main (default shared tenant database)
├── ns_tenant_a1b2c3d4
├── ns_tenant_b2c3d4e5
├── ns_tenant_c3d4e5f6
└── ... (hundreds/thousands of lightweight tenants)

db_test (test database)
├── ns_test_abc12345
├── ns_test_def67890
└── ... (test schemas, fast creation/cleanup)

db_us_east (regional database - optional)
├── ns_tenant_regional_001
├── ns_tenant_regional_002
└── monk_template_demo_crm (for regional testing/rollout)

db_us_west (regional database - optional)
├── ns_tenant_regional_003
└── monk_template_demo_crm (controlled rollout validation)

db_premium_<id> (dedicated database - optional)
└── ns_tenant_premium_001 (single tenant, dedicated resources)
```

### Tenant Distribution Examples

**Lightweight Tenants (Shared Database):**
```
name: "startup-a"
database: "db_main"
schema: "ns_tenant_a1b2c3d4"

name: "startup-b"
database: "db_main"
schema: "ns_tenant_e5f6789a"
```

**Premium Tenant (Dedicated Database):**
```
name: "enterprise-corp"
database: "db_premium_abc123"
schema: "ns_tenant_abc12345"
```

**Regional Distribution:**
```
name: "global-corp-us"
database: "db_us_east"
schema: "ns_tenant_us_001"

name: "global-corp-eu"
database: "db_eu_west"
schema: "ns_tenant_eu_001"
```

---

## Key Decisions

### 1. Hash Length: 8 Characters

**Current**: 16 hex characters (SHA256 truncated)
**New**: 8 hex characters

**Math**: `16^8 = 4,294,967,296` (~4.3 billion unique combinations)

**Rationale**:
- More than sufficient for any realistic tenant count
- Shorter names easier to work with
- Reduces database identifier lengths
- Same format for both database and schema identifiers

**Implementation**:
```typescript
// DatabaseNaming class
const hash = createHash('sha256')
    .update(normalizedName, 'utf8')
    .digest('hex')
    .substring(0, 8);  // Changed from 16 to 8

return `ns_tenant_${hash}`;
```

### 2. Naming Conventions

**Databases:**
```
monk           # Infrastructure + system fixture + default templates
db_main        # Default shared tenant database
db_test        # Test database
db_us_east     # Regional databases (optional)
db_us_west     # Regional databases (optional)
db_premium_*   # Premium tenant databases (created on-demand)
```

**Schemas (Namespaces):**
```
monk_system                  # System fixture (singleton)
monk_template_<name>         # Templates
ns_tenant_<hash-8>           # Tenants
ns_test_<hash-8>             # Tests
ns_sandbox_<hash-8>          # Sandboxes
```

### 3. Default Shared Database: `db_main`

**Why `db_main` instead of `db_shared`?**
- Matches `db_test` naming pattern
- Clear primary/default designation
- Easier to type/remember

### 4. Templates Storage

**Templates are schemas**, not databases:
- Default location: `monk.monk_template_<name>`
- Regional testing: `db_us_west.monk_template_<name>`
- Enables controlled rollouts region-by-region

### 5. System Fixture as Schema

**Old**: `monk_template_system` (separate database)
**New**: `monk.monk_system` (schema in infrastructure database)

**Rationale**:
- System model definitions are infrastructure metadata
- Co-locate with infrastructure tables
- Simplifies architecture (one less database)
- Each tenant gets copy of system tables (maintains isolation)

### 6. Fixture System: Build + Deploy Separation

**Two-Phase Architecture:**

**Phase 1: `fixtures:build` (Compilation)**
- Happens at development/CI time
- Reads fixture source files
- Generates single optimized SQL file
- Output committed to git

**Phase 2: `fixtures:deploy` (Execution)**
- Happens at runtime (tests, registration, etc.)
- Executes compiled fixture with parameters
- Fast (~200-500ms for system fixture)

**Decisions:**
- Compiled fixtures committed to git ✓ (reproducibility)
- Parameterization: `:schema` syntax ✓ (simple)
- Optimization: Minimal for now ✓ (add later)
- Build trigger: Manual ✓ (explicit control)

**Benefits:**
- No template database cloning needed
- Fast enough for tests
- Works identically locally and remotely
- Version controlled build artifacts
- Debuggable (can inspect compiled SQL)

### 7. Acceptable Tenant Onboarding Time

**Production Registration**: 20 seconds to several minutes is acceptable

**Why this works:**
- User registration shows "provisioning" state
- Asynchronous tenant creation possible
- One-time cost per tenant
- Not a user-facing bottleneck

**Test Creation**: ~200-500ms (fast enough for parallel tests)

### 8. No Existing Tenant Migration

All existing tenants can be wiped/recreated during refactor.

---

## Database Structure

### Default Databases to Create

```sql
-- Infrastructure database
CREATE DATABASE monk;

-- Default shared tenant database
CREATE DATABASE db_main;

-- Test database
CREATE DATABASE db_test;
```

**Optional databases** (created on-demand):
```sql
-- Premium tenant (one per client)
CREATE DATABASE db_premium_<id>;

-- Regional distribution
CREATE DATABASE db_us_east;
CREATE DATABASE db_us_west;
CREATE DATABASE db_eu_west;
```

### Schema Types

```typescript
// System fixture (singleton in monk database)
const SYSTEM_SCHEMA = 'monk_system';

// Templates (in any database)
const TEMPLATE_PREFIX = 'monk_template_';
// Examples: monk_template_system, monk_template_demo_crm

// Tenants (in any tenant database)
const TENANT_PREFIX = 'ns_tenant_';
// Example: ns_tenant_a1b2c3d4

// Tests (in db_test)
const TEST_PREFIX = 'ns_test_';
// Example: ns_test_abc12345

// Sandboxes (in any database)
const SANDBOX_PREFIX = 'ns_sandbox_';
// Example: ns_sandbox_xyz78901
```

---

## Infrastructure Changes

### Templates Table

**Add `schema` column, modify `database` semantics:**

```sql
-- Current structure
CREATE TABLE templates (
    id uuid PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    database VARCHAR(255) NOT NULL UNIQUE,  -- Was: monk_template_<name>
    version INTEGER DEFAULT 1,
    ...
);

-- New structure
ALTER TABLE templates
    -- database now holds: monk, db_us_west, etc.
    ALTER COLUMN database TYPE VARCHAR(255),
    DROP CONSTRAINT templates_database_unique,

    -- Add schema column
    ADD COLUMN schema VARCHAR(255) NOT NULL,

    -- Schema must be unique within database
    ADD CONSTRAINT templates_database_schema_unique UNIQUE(database, schema),

    -- Schema naming validation
    ADD CONSTRAINT templates_schema_prefix
        CHECK (schema LIKE 'monk_template_%');

-- Update indexes
CREATE INDEX idx_templates_database ON templates(database);
CREATE INDEX idx_templates_schema ON templates(schema);
```

**Example data:**
```sql
INSERT INTO templates (name, database, schema, version) VALUES
    ('system', 'monk', 'monk_system', 1),
    ('demo-crm', 'monk', 'monk_template_demo_crm', 1),
    ('demo-crm', 'db_us_west', 'monk_template_demo_crm', 2),  -- Regional testing
    ('testing', 'monk', 'monk_template_testing', 1);
```

### Tenants Table

**Add `schema` column, modify `database` semantics:**

```sql
-- Current structure
CREATE TABLE tenants (
    id uuid PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    database VARCHAR(255) NOT NULL UNIQUE,  -- Was: tenant_<hash-16>
    ...
);

-- New structure
ALTER TABLE tenants
    -- database now holds: db_main, db_us_east, db_premium_xyz, etc.
    ALTER COLUMN database TYPE VARCHAR(255),
    DROP CONSTRAINT tenants_database_unique,
    DROP CONSTRAINT tenants_database_prefix,

    -- Add schema column
    ADD COLUMN schema VARCHAR(255) NOT NULL,

    -- Schema must be unique within database
    ADD CONSTRAINT tenants_database_schema_unique UNIQUE(database, schema),

    -- Schema naming validation
    ADD CONSTRAINT tenants_schema_prefix
        CHECK (schema LIKE 'ns_tenant_%');

-- Update indexes
CREATE INDEX idx_tenants_database ON tenants(database);
CREATE INDEX idx_tenants_schema ON tenants(schema);
CREATE INDEX idx_tenants_database_schema ON tenants(database, schema);
```

**Example data:**
```sql
INSERT INTO tenants (name, database, schema, source_template, owner_id) VALUES
    ('startup-a', 'db_main', 'ns_tenant_a1b2c3d4', 'system', '...'),
    ('startup-b', 'db_main', 'ns_tenant_e5f6789a', 'system', '...'),
    ('enterprise-x', 'db_premium_001', 'ns_tenant_abc12345', 'demo-crm', '...');
```

### Sandboxes Table

**Add `schema` column, modify `database` semantics:**

```sql
-- New structure
ALTER TABLE sandboxes
    ALTER COLUMN database TYPE VARCHAR(255),
    DROP CONSTRAINT sandboxes_database_unique,
    DROP CONSTRAINT sandboxes_database_prefix,

    ADD COLUMN schema VARCHAR(255) NOT NULL,
    ADD CONSTRAINT sandboxes_database_schema_unique UNIQUE(database, schema),
    ADD CONSTRAINT sandboxes_schema_prefix
        CHECK (schema LIKE 'ns_sandbox_%');

CREATE INDEX idx_sandboxes_database ON sandboxes(database);
CREATE INDEX idx_sandboxes_schema ON sandboxes(schema);
```

### Updated `fixtures/infrastructure/init.sql`

Complete rewrite to reflect new schema. See implementation checklist.

---

## Code Changes

### 1. DatabaseNaming Class

**File**: `src/lib/database-naming.ts`

**Changes:**
- Reduce hash from 16 to 8 characters
- Update comments/documentation
- Add schema name generation methods

```typescript
export class DatabaseNaming {
    /**
     * Generate tenant namespace (schema) name (8-char hash)
     *
     * @returns Namespace: ns_tenant_<hash-8>
     */
    static generateTenantNsName(tenantName: string): string {
        const normalizedName = tenantName.trim().normalize('NFC');
        const hash = createHash('sha256')
            .update(normalizedName, 'utf8')
            .digest('hex')
            .substring(0, 8);  // Changed from 16 to 8

        return `ns_tenant_${hash}`;
    }

    /**
     * Generate test namespace (schema) name
     */
    static generateTestNsName(): string {
        return `ns_test_${randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate sandbox namespace (schema) name
     */
    static generateSandboxNsName(): string {
        return `ns_sandbox_${randomBytes(4).toString('hex')}`;
    }
}
```

### 2. DatabaseConnection Class

**File**: `src/lib/database-connection.ts`

**New Methods:**

```typescript
export class DatabaseConnection {
    /**
     * Set search path for namespace-scoped operations
     *
     * CRITICAL: Prevents SQL injection via namespace validation
     */
    static async setSearchPath(
        client: pg.Client | pg.PoolClient,
        nsName: string
    ): Promise<void> {
        // Validate namespace (prevent SQL injection)
        if (!/^[a-zA-Z0-9_]+$/.test(nsName)) {
            throw new Error(`Invalid namespace: ${nsName}`);
        }

        // Use identifier quoting for safety
        await client.query(`SET search_path TO "${nsName}", public`);
    }

    /**
     * Set search path to transaction scope (safer but slower)
     */
    static async setLocalSearchPath(
        client: pg.Client | pg.PoolClient,
        nsName: string
    ): Promise<void> {
        if (!/^[a-zA-Z0-9_]+$/.test(nsName)) {
            throw new Error(`Invalid namespace: ${nsName}`);
        }

        // LOCAL = transaction-scoped, reverts after commit/rollback
        await client.query(`SET LOCAL search_path TO "${nsName}", public`);
    }

    /**
     * Execute query in specific database + namespace context
     *
     * @example
     * await DatabaseConnection.queryInNamespace(
     *   'db_main',
     *   'ns_tenant_a1b2c3d4',
     *   'SELECT * FROM users'
     * );
     */
    static async queryInNamespace(
        dbName: string,
        nsName: string,
        query: string,
        params?: any[]
    ): Promise<pg.QueryResult> {
        const pool = this.getPool(dbName);
        const client = await pool.connect();

        try {
            await this.setLocalSearchPath(client, nsName);
            return await client.query(query, params);
        } finally {
            client.release();
        }
    }

    /**
     * Attach tenant database + namespace to Hono context
     *
     * UPDATED: Now sets both database and namespace from JWT
     */
    static setDatabaseForRequest(c: any, dbName: string, nsName: string): void {
        const pool = this.getPool(dbName);
        c.set('database', pool);
        c.set('dbName', dbName);
        c.set('nsName', nsName);
    }
}
```

**Remove/Deprecate:**
- `getTenantPool(dbName)` - replaced by `getPool(dbName)` + `setSearchPath(nsName)`
- `MONK_DB_TENANT_PREFIX` constant - no longer needed
- Database prefix validation for tenants - now validates namespace names

### 3. Schema Management Utilities

**New File**: `src/lib/schema-manager.ts`

```typescript
import pg from 'pg';
import { DatabaseConnection } from './database-connection.js';

export class NamespaceManager {
    /**
     * Create new namespace (schema) in target database
     */
    static async createNamespace(dbName: string, nsName: string): Promise<void> {
        this.validateNamespaceName(nsName);

        const pool = DatabaseConnection.getPool(dbName);
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${nsName}"`);

        console.info('Namespace created', { dbName, nsName });
    }

    /**
     * Drop namespace (schema) and all objects within it
     */
    static async dropNamespace(dbName: string, nsName: string): Promise<void> {
        this.validateNamespaceName(nsName);

        const pool = DatabaseConnection.getPool(dbName);
        await pool.query(`DROP SCHEMA IF EXISTS "${nsName}" CASCADE`);

        console.info('Namespace dropped', { dbName, nsName });
    }

    /**
     * Check if namespace (schema) exists
     */
    static async namespaceExists(dbName: string, nsName: string): Promise<boolean> {
        const pool = DatabaseConnection.getPool(dbName);
        const result = await pool.query(
            `SELECT EXISTS(
                SELECT 1 FROM information_schema.schemata
                WHERE schema_name = $1
            )`,
            [nsName]
        );
        return result.rows[0].exists;
    }

    /**
     * Get all namespaces (schemas) in database (excluding system schemas)
     */
    static async listNamespaces(dbName: string): Promise<string[]> {
        const pool = DatabaseConnection.getPool(dbName);
        const result = await pool.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
                AND schema_name NOT LIKE 'pg_%'
            ORDER BY schema_name
        `);
        return result.rows.map(row => row.schema_name);
    }

    /**
     * Validate namespace (schema) name (prevent SQL injection)
     */
    private static validateNamespaceName(nsName: string): void {
        if (typeof nsName !== 'string' || !nsName.trim()) {
            throw new Error('Namespace name must be a non-empty string');
        }

        if (!/^[a-zA-Z0-9_]+$/.test(nsName)) {
            throw new Error(
                `Invalid namespace name "${nsName}". ` +
                'Must contain only alphanumeric characters and underscores.'
            );
        }

        if (nsName.length > 63) {
            throw new Error(
                `Namespace name "${nsName}" exceeds PostgreSQL limit (63 chars)`
            );
        }
    }
}
```

### 4. JWT Payload Updates

**File**: `src/lib/services/tenant.ts`

**Add `db` and `ns` fields:**

```typescript
export interface JWTPayload {
    sub: string;                // Subject/system identifier
    user_id: string | null;     // User ID for database records
    tenant: string;             // Tenant name (human-readable)
    db: string;                 // NEW: Database name (db_main, db_premium_xyz, etc.)
    ns: string;                 // NEW: Namespace (ns_tenant_<hash-8>)
    access: string;             // Access level
    access_read: string[];
    access_edit: string[];
    access_full: string[];
    iat: number;
    exp: number;
    [key: string]: any;
}
```

**Update token generation:**

```typescript
static async generateToken(user: any): Promise<string> {
    const payload: JWTPayload = {
        sub: user.id,
        user_id: user.user_id || null,
        tenant: user.tenant,
        db: user.dbName,              // NEW: Compact JWT field
        ns: user.nsName,              // NEW: Compact JWT field
        access: user.access || 'root',
        access_read: user.access_read || [],
        access_edit: user.access_edit || [],
        access_full: user.access_full || [],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.tokenExpiry,
    };

    return await sign(payload, this.getJwtSecret());
}
```

### 5. TenantService Updates

**File**: `src/lib/services/tenant.ts`

**Update `createTenant` method:**

```typescript
static async createTenant(
    tenantName: string,
    template: string = 'system',
    dbName: string = 'db_main',  // NEW: Which database to create in
    force: boolean = false
): Promise<TenantInfo> {
    const nsName = DatabaseNaming.generateTenantNsName(tenantName);

    // Check if tenant already exists
    if (!force && await this.tenantExists(tenantName)) {
        throw new Error(`Tenant '${tenantName}' already exists`);
    }

    // Check if namespace already exists in target database
    if (!force && await NamespaceManager.namespaceExists(dbName, nsName)) {
        throw new Error(`Namespace '${nsName}' already exists in ${dbName}`);
    }

    try {
        // Deploy fixture to create namespace
        await FixtureDeployer.deploy(template, { dbName, nsName });

        // Create root user in tenant namespace
        await this.createRootUser(dbName, nsName, tenantName);

        // Insert tenant record
        await this.insertTenantRecord(tenantName, dbName, nsName, template);

        return { name: tenantName, dbName, nsName };
    } catch (error) {
        // Clean up namespace if initialization failed
        try {
            await NamespaceManager.dropNamespace(dbName, nsName);
        } catch (cleanupError) {
            console.warn(`Failed to cleanup namespace: ${cleanupError}`);
        }
        throw error;
    }
}
```

**Update `login` method to include database/namespace:**

```typescript
static async login(tenant: string, username: string): Promise<LoginResult | null> {
    // Look up tenant to get database and namespace
    const authDb = this.getAuthPool();
    const tenantResult = await authDb.query(
        'SELECT name, database, schema FROM tenants WHERE name = $1 AND is_active = true',
        [tenant]
    );

    if (!tenantResult.rows || tenantResult.rows.length === 0) {
        return null;
    }

    const { name, database, schema } = tenantResult.rows[0];

    // Look up user in tenant namespace
    const userResult = await DatabaseConnection.queryInNamespace(
        database,
        schema,
        'SELECT * FROM users WHERE auth = $1 AND deleted_at IS NULL',
        [username]
    );

    if (!userResult.rows || userResult.rows.length === 0) {
        return null;
    }

    const user = userResult.rows[0];

    // Create auth user object
    const authUser = {
        id: user.id,
        user_id: user.id,
        tenant: name,
        dbName: database,      // NEW: Use in code
        nsName: schema,        // NEW: Use in code
        username: user.auth,
        access: user.access,
        // ...
    };

    const token = await this.generateToken(authUser);

    return {
        token,
        user: {
            id: authUser.id,
            username: authUser.username,
            tenant: authUser.tenant,
            dbName: authUser.dbName,
            nsName: authUser.nsName,
            access: authUser.access,
        },
    };
}
```

### 6. DatabaseTemplate Updates

**File**: `src/lib/database-template.ts`

**Replace template cloning with fixture deployment:**

```typescript
export class DatabaseTemplate {
    static async cloneTemplate(options: TemplateCloneOptions): Promise<TemplateCloneResult> {
        const { template_name, user_access = 'root' } = options;

        const mainPool = DatabaseConnection.getMainPool();

        // 1. Look up template
        const templateResult = await mainPool.query(
            'SELECT name, database, schema FROM templates WHERE name = $1',
            [template_name]
        );

        if (templateResult.rows.length === 0) {
            throw HttpErrors.notFound(`Template '${template_name}' not found`);
        }

        // 2. Generate tenant name if not provided
        let tenantName = options.tenant_name;
        if (!tenantName) {
            const timestamp = Date.now();
            const random = randomBytes(4).toString('hex');
            tenantName = `demo_${timestamp}_${random}`;
        }

        const username = options.username || 'root';

        // 3. Determine target database (default: db_main)
        const targetDbName = 'db_main';
        const targetNsName = DatabaseNaming.generateTenantNsName(tenantName);

        // 4. Check if tenant/namespace exists
        const existingCheck = await mainPool.query(
            'SELECT COUNT(*) FROM tenants WHERE name = $1',
            [tenantName]
        );
        if (existingCheck.rows[0].count > 0) {
            throw HttpErrors.conflict(`Tenant '${tenantName}' already exists`);
        }

        // 5. Deploy fixture to create namespace
        await FixtureDeployer.deploy(template_name, {
            dbName: targetDbName,
            nsName: targetNsName
        });

        // 6. Create user in tenant namespace
        const newUser = await DatabaseConnection.queryInNamespace(
            targetDbName,
            targetNsName,
            `INSERT INTO users (name, auth, access, access_read, access_edit, access_full, access_deny)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [`Demo User (${username})`, username, user_access, '{}', '{}', '{}', '{}']
        );

        // 7. Register tenant
        const tenantInsertResult = await mainPool.query(
            `INSERT INTO tenants (name, database, schema, description, source_template, owner_id, host, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
                tenantName,
                targetDbName,
                targetNsName,
                options.description || null,
                template_name,
                newUser.rows[0].id,
                'localhost',
                true,
            ]
        );

        return {
            tenant: tenantName,
            dbName: targetDbName,
            nsName: targetNsName,
            user: {
                id: newUser.rows[0].id,
                name: newUser.rows[0].name,
                auth: newUser.rows[0].auth,
                access: newUser.rows[0].access,
                access_read: newUser.rows[0].access_read || [],
                access_edit: newUser.rows[0].access_edit || [],
                access_full: newUser.rows[0].access_full || [],
                access_deny: newUser.rows[0].access_deny || [],
            },
            template_used: template_name,
        };
    }
}
```

### 7. Middleware Updates

**File**: `src/middleware/auth.ts` (or wherever JWT middleware lives)

**Update to use database + namespace from JWT:**

```typescript
export const authMiddleware = async (c: Context, next: Next) => {
    const token = extractToken(c);

    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
        const payload = await TenantService.verifyToken(token);

        // Extract from compact JWT fields and use in code
        const dbName = payload.db;   // Compact JWT field
        const nsName = payload.ns;   // Compact JWT field

        // Set database context from JWT
        DatabaseConnection.setDatabaseForRequest(c, dbName, nsName);

        // Store user info
        c.set('user', payload);

        await next();
    } catch (error) {
        return c.json({ error: 'Invalid token' }, 401);
    }
};
```

**All route handlers now use:**

```typescript
// Instead of:
const db = c.get('database');  // Was a pool for specific database

// Now:
const db = c.get('database');     // Pool for the database
const nsName = c.get('nsName');   // Namespace name

// Queries automatically scoped via search_path set in middleware
await db.query('SELECT * FROM users');  // Queries ns_tenant_xyz.users
```

---

## Fixture System Redesign

### Overview

Two-phase architecture:
1. **Build Phase** (compilation): fixtures → optimized SQL
2. **Deploy Phase** (execution): compiled SQL → database + schema

### Build Phase Implementation

**New File**: `src/lib/fixtures/builder.ts`

```typescript
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface BuildOptions {
    optimize?: boolean;  // Future: convert INSERT → COPY
}

export class FixtureBuilder {
    /**
     * Build (compile) a fixture into optimized SQL
     *
     * @param fixtureName - Name of fixture (system, demo-crm, etc.)
     * @param options - Build options
     */
    async build(fixtureName: string, options: BuildOptions = {}): Promise<void> {
        console.log(`Building fixture: ${fixtureName}`);

        const fixturePath = join(process.cwd(), 'fixtures', fixtureName);
        const outputPath = join(process.cwd(), 'dist', 'fixtures', `${fixtureName}.sql`);

        // 1. Read load.sql (master file)
        const loadSql = await readFile(join(fixturePath, 'load.sql'), 'utf-8');

        // 2. Parse \ir directives and inline referenced files
        const compiled = await this.inlineIncludes(fixturePath, loadSql);

        // 3. Add parameterization
        const parameterized = this.addParameterization(compiled);

        // 4. Optimize (future)
        const optimized = options.optimize
            ? this.optimize(parameterized)
            : parameterized;

        // 5. Write output
        await mkdir(join(process.cwd(), 'dist', 'fixtures'), { recursive: true });
        await writeFile(outputPath, optimized);

        console.log(`✓ Compiled: ${outputPath}`);
    }

    /**
     * Inline all \ir (include relative) directives
     */
    private async inlineIncludes(basePath: string, sql: string): Promise<string> {
        const lines = sql.split('\n');
        const result: string[] = [];

        for (const line of lines) {
            // Match: \ir path/to/file.sql
            const match = line.match(/^\\ir\s+(.+)$/);

            if (match) {
                const relativePath = match[1].trim();
                const fullPath = join(basePath, relativePath);

                try {
                    const content = await readFile(fullPath, 'utf-8');
                    result.push(`-- BEGIN: ${relativePath}`);
                    result.push(content);
                    result.push(`-- END: ${relativePath}`);
                } catch (error) {
                    console.warn(`Warning: Could not read ${relativePath}`);
                    result.push(line);  // Keep original line
                }
            } else {
                result.push(line);
            }
        }

        return result.join('\n');
    }

    /**
     * Add parameterization for database/schema
     */
    private addParameterization(sql: string): string {
        const header = `-- Compiled Fixture
-- Generated: ${new Date().toISOString()}
-- Parameters: :database, :schema

BEGIN;

-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS :schema;

-- Set search path to target schema
SET search_path TO :schema, public;

`;
        const footer = `
COMMIT;
`;

        return header + sql + footer;
    }

    /**
     * Optimize SQL (future enhancement)
     * - Convert INSERT statements to COPY
     * - Reorder operations for performance
     * - Defer index creation
     */
    private optimize(sql: string): string {
        // TODO: Implement optimizations
        // For now, just return as-is
        return sql;
    }
}
```

### Deploy Phase Implementation

**New File**: `src/lib/fixtures/deployer.ts`

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';
import { DatabaseConnection } from '../database-connection.js';

export interface DeployTarget {
    dbName: string;  // db_main, db_test, db_us_east, etc.
    nsName: string;  // ns_tenant_xyz, ns_test_abc, monk_template_demo, etc.
}

export class FixtureDeployer {
    /**
     * Deploy compiled fixture to target database + schema
     *
     * @param fixtureName - Name of fixture (system, demo-crm, etc.)
     * @param target - Target database and schema
     */
    static async deploy(fixtureName: string, target: DeployTarget): Promise<void> {
        console.log(`Deploying ${fixtureName} to ${target.dbName}.${target.nsName}`);

        // 1. Read compiled fixture
        const fixturePath = join(
            process.cwd(),
            'dist',
            'fixtures',
            `${fixtureName}.sql`
        );

        const sql = await readFile(fixturePath, 'utf-8');

        // 2. Inject parameters
        const parameterized = sql
            .replace(/:database/g, target.dbName)
            .replace(/:schema/g, target.nsName);

        // 3. Execute
        const pool = DatabaseConnection.getPool(target.dbName);
        await pool.query(parameterized);

        console.log(`✓ Deployed successfully`);
    }
}
```

### CLI Commands

**Update `package.json` scripts:**

```json
{
  "scripts": {
    "fixtures:build": "tsx scripts/fixtures-build.ts",
    "fixtures:deploy": "tsx scripts/fixtures-deploy.ts"
  }
}
```

**New File**: `scripts/fixtures-build.ts`

```typescript
import { FixtureBuilder } from '@/lib/fixtures/builder';

const fixtureName = process.argv[2];

if (!fixtureName) {
    console.error('Usage: npm run fixtures:build <fixture-name>');
    process.exit(1);
}

const builder = new FixtureBuilder();
await builder.build(fixtureName);
```

**New File**: `scripts/fixtures-deploy.ts`

```typescript
import { FixtureDeployer } from '@/lib/fixtures/deployer';

// Parse args: npm run fixtures:deploy system -- --database db_test --schema test_123
const args = process.argv.slice(2);
const fixtureName = args[0];

const databaseIdx = args.indexOf('--database');
const schemaIdx = args.indexOf('--schema');

if (!fixtureName || databaseIdx === -1 || schemaIdx === -1) {
    console.error('Usage: npm run fixtures:deploy <fixture> -- --database <db> --schema <schema>');
    process.exit(1);
}

const database = args[databaseIdx + 1];
const schema = args[schemaIdx + 1];

await FixtureDeployer.deploy(fixtureName, { database, schema });
```

### Usage Examples

**Build fixtures:**
```bash
npm run fixtures:build system
npm run fixtures:build demo-crm
npm run fixtures:build testing
```

**Deploy fixtures:**
```bash
# Development
npm run fixtures:deploy system -- --database db_test --schema ns_test_abc123

# Production tenant
npm run fixtures:deploy demo-crm -- --database db_main --schema ns_tenant_xyz789

# Regional testing
npm run fixtures:deploy demo-crm -- --database db_us_west --schema monk_template_demo_crm
```

**Programmatic usage:**
```typescript
import { FixtureDeployer } from '@/lib/fixtures/deployer';

// In tests
await FixtureDeployer.deploy('system', {
    dbName: 'db_test',
    nsName: 'ns_test_abc123'
});

// In registration
await FixtureDeployer.deploy('demo-crm', {
    dbName: 'db_main',
    nsName: 'ns_tenant_xyz789'
});
```

---

## Security Considerations

### 1. Schema Name SQL Injection Prevention

**Risk**: User-controlled schema names could enable SQL injection

**Mitigation**:
```typescript
// ALWAYS validate namespace names
function validateNamespaceName(nsName: string): void {
    if (!/^[a-zA-Z0-9_]+$/.test(nsName)) {
        throw new Error('Invalid namespace name');
    }
}

// Use identifier quoting
await client.query(`SET search_path TO "${nsName}", public`);

// NOT string interpolation
await client.query(`SET search_path TO ${nsName}`);  // ❌ DANGEROUS
```

### 2. Search Path Security

**Risk**: Incorrect search_path could expose wrong tenant data

**Mitigation**:
- Always set `search_path` at transaction start
- Use `SET LOCAL search_path` (transaction-scoped) for critical operations
- Validate search_path before sensitive queries
- Log search_path changes for audit

```typescript
// Transaction-scoped (safer)
await client.query('BEGIN');
await client.query(`SET LOCAL search_path TO "${nsName}"`);
// ... queries ...
await client.query('COMMIT');  // search_path reverts
```

### 3. Cross-Schema Access

**Risk**: Shared database enables cross-schema queries

**Mitigation**:
- Revoke PUBLIC schema access:
  ```sql
  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  ```
- Grant per-namespace permissions:
  ```sql
  GRANT ALL ON SCHEMA ns_tenant_xyz TO app_user;
  ```
- Monitor for cross-schema queries in logs
- Use row-level security (RLS) as additional layer

### 4. Connection Pool Isolation

**Current Risk**: Shared connection pool could leak search_path between requests

**Mitigation**:
- Always set search_path per transaction
- Use `SET LOCAL` to ensure revert after transaction
- Consider connection pool per database (not per schema)
- Monitor for search_path leaks via logging

---

## Performance Implications

### Improvements

**Connection Pool Efficiency:**
- Before: 20 tenants × 5 connections = 100 connections
- After: 1 shared DB × 10 connections = 10 connections
- **10x reduction in connection usage**

**Test Performance:**
- Before: CREATE DATABASE ~1-2 seconds
- After: CREATE SCHEMA + deploy fixture ~200-500ms
- **3-5x faster test setup**

**Parallel Test Execution:**
- Before: Serial (connection exhaustion)
- After: Parallel (no connection limits)
- **Enables full test parallelization**

### Trade-offs

**Schema Creation vs Database Cloning:**
- Template database cloning: ~100-200ms (copy-on-write)
- Schema deployment: ~200-500ms (execute SQL)
- **Acceptable for 20s onboarding target**

**Query Performance:**
- Schema-based: Identical to database-based (same query plans)
- Search path: Minimal overhead (<1ms per query)
- Indexing: Same performance characteristics

**Disk I/O:**
- Shared database: More checkpoint activity
- Trade-off: Better for small tenants, worse for large tenants
- Solution: Large tenants get dedicated databases

---

## Implementation Checklist

### Phase 1: Infrastructure Setup

- [ ] Create `dist/fixtures/` directory in .gitignore
- [ ] Update `.gitignore` to include `dist/fixtures/*.sql`
- [ ] Create default databases:
  ```bash
  createdb monk
  createdb db_main
  createdb db_test
  ```
- [ ] Update `fixtures/infrastructure/init.sql`:
  - [ ] Add `schema` column to `templates` table
  - [ ] Add `schema` column to `tenants` table
  - [ ] Add `schema` column to `sandboxes` table
  - [ ] Update constraints and indexes
  - [ ] Remove database prefix checks
- [ ] Run infrastructure init:
  ```bash
  psql -d monk -f fixtures/infrastructure/init.sql
  ```

### Phase 2: Core Library Changes

- [ ] Update `src/lib/database-naming.ts`:
  - [ ] Change hash length from 16 to 8 characters
  - [ ] Add `generateTenantNsName()` method
  - [ ] Add `generateTestNsName()` method
  - [ ] Add `generateSandboxNsName()` method
  - [ ] Update tests

- [ ] Create `src/lib/namespace-manager.ts`:
  - [ ] Implement `createNamespace()`
  - [ ] Implement `dropNamespace()`
  - [ ] Implement `namespaceExists()`
  - [ ] Implement `listNamespaces()`
  - [ ] Implement `validateNamespaceName()`
  - [ ] Add tests

- [ ] Update `src/lib/database-connection.ts`:
  - [ ] Add `setSearchPath()` method (uses `nsName` parameter)
  - [ ] Add `setLocalSearchPath()` method (uses `nsName` parameter)
  - [ ] Add `queryInNamespace()` method (uses `dbName` and `nsName`)
  - [ ] Update `setDatabaseForRequest()` signature (uses `dbName` and `nsName`)
  - [ ] Remove/deprecate `getTenantPool()`
  - [ ] Update comments/documentation
  - [ ] Add tests

- [ ] Update `src/lib/database-types.ts`:
  - [ ] Add `dbName` and `nsName` to relevant interfaces

### Phase 3: Fixture System

- [ ] Create `src/lib/fixtures/builder.ts`:
  - [ ] Implement `FixtureBuilder` class
  - [ ] Implement `build()` method
  - [ ] Implement `inlineIncludes()` method
  - [ ] Implement `addParameterization()` method
  - [ ] Add placeholder for `optimize()` method
  - [ ] Add tests

- [ ] Create `src/lib/fixtures/deployer.ts`:
  - [ ] Implement `FixtureDeployer` class
  - [ ] Implement `deploy()` method
  - [ ] Add parameter injection
  - [ ] Add tests

- [ ] Create `scripts/fixtures-build.ts`:
  - [ ] CLI argument parsing
  - [ ] Error handling
  - [ ] Usage documentation

- [ ] Create `scripts/fixtures-deploy.ts`:
  - [ ] CLI argument parsing
  - [ ] Error handling
  - [ ] Usage documentation

- [ ] Update `package.json`:
  - [ ] Add `fixtures:build` script
  - [ ] Add `fixtures:deploy` script

- [ ] Build all fixtures:
  ```bash
  npm run fixtures:build system
  npm run fixtures:build demo-crm
  npm run fixtures:build testing
  ```

- [ ] Test fixture deployment:
  ```bash
  npm run fixtures:deploy system -- --database db_test --schema test_validate
  ```

### Phase 4: Service Layer Updates

- [ ] Update `src/lib/services/tenant.ts`:
  - [ ] Update `JWTPayload` interface (add `db`, `ns` fields for JWT)
  - [ ] Update `generateToken()` method (use compact `db`/`ns` in JWT)
  - [ ] Update `login()` method (use `dbName`/`nsName` in code)
  - [ ] Update `createTenant()` method (use `dbName`/`nsName` parameters)
  - [ ] Update `deleteTenant()` method
  - [ ] Update `getTenant()` method
  - [ ] Update `listTenants()` method
  - [ ] Remove database-specific logic
  - [ ] Add namespace-specific logic
  - [ ] Update tests

- [ ] Update `src/lib/database-template.ts`:
  - [ ] Replace `createdb` with `FixtureDeployer.deploy()`
  - [ ] Update to use `dbName` + `nsName` pattern
  - [ ] Remove database cloning logic
  - [ ] Update tests

### Phase 5: Middleware & Routes

- [ ] Update auth middleware:
  - [ ] Extract `db` and `ns` from JWT payload
  - [ ] Map to `dbName` and `nsName` variables in code
  - [ ] Update `setDatabaseForRequest()` call with `dbName` and `nsName`
  - [ ] Set namespace context in request

- [ ] Update route handlers (if needed):
  - [ ] Verify database context is correct
  - [ ] Test search_path is set correctly
  - [ ] Validate cross-namespace isolation

### Phase 6: Test Infrastructure

- [ ] Update `spec/test-database-helper.ts`:
  - [ ] Replace `createdb` with namespace creation
  - [ ] Use `FixtureDeployer.deploy()` for setup
  - [ ] Update cleanup to `DROP SCHEMA CASCADE`
  - [ ] Update database naming to use `db_test`
  - [ ] Add namespace naming with `ns_test_` prefix

- [ ] Update test files:
  - [ ] Replace database references with `dbName` + `nsName`
  - [ ] Update JWT mocking to include `db`/`ns` fields
  - [ ] Verify test isolation

- [ ] Run test suite:
  ```bash
  npm test
  ```

- [ ] Verify parallel test execution:
  ```bash
  npm test -- --parallel
  ```

### Phase 7: Documentation

- [ ] Update `README.md`:
  - [ ] Document new architecture
  - [ ] Update examples with `dbName` + `nsName`

- [ ] Update `DEVELOPER.md`:
  - [ ] Explain namespace-based architecture
  - [ ] Document fixture build/deploy workflow
  - [ ] Add namespace management examples

- [ ] Update `spec/README.md`:
  - [ ] Document new test infrastructure
  - [ ] Explain namespace-based test isolation

- [ ] Add migration guide (this document):
  - [ ] Create `SCHEMAS_REFACTOR.md` ✓

### Phase 8: Cleanup

- [ ] Remove old code:
  - [ ] Remove database cloning logic
  - [ ] Remove per-tenant pool creation
  - [ ] Remove database prefix validation for tenants

- [ ] Update environment variables (if needed):
  - [ ] Document database URL format
  - [ ] Add connection pool configuration

- [ ] Remove old template databases (if any):
  ```bash
  dropdb monk_template_system
  dropdb monk_template_testing
  ```

---

## Future Optimizations

### 1. Fixture Compilation Optimizations

**INSERT → COPY Conversion** (5-10x faster)

Currently:
```sql
INSERT INTO models (id, name, label) VALUES ('uuid1', 'models', 'Models');
INSERT INTO models (id, name, label) VALUES ('uuid2', 'fields', 'Fields');
```

Optimized:
```sql
COPY models (id, name, label) FROM STDIN;
uuid1\tmodels\tModels
uuid2\tfields\tFields
\.
```

**Implementation Notes**:
- Add to `FixtureBuilder.optimize()` method
- Parse INSERT statements
- Group by table
- Convert to COPY format
- Estimate: 200-500ms → 50-100ms for system fixture

### 2. Deferred Index Creation

Currently: Indexes created during table creation

Optimized: Create indexes after data load
```sql
-- 1. Create tables (no indexes)
CREATE TABLE models (...);

-- 2. Load data (fast, no index maintenance)
COPY models FROM STDIN;

-- 3. Create indexes (once, on full dataset)
CREATE INDEX idx_models_name ON models(name);
```

**Benefit**: 2-3x faster bulk loading

### 3. Schema Pool for Tests

Pre-create pool of ready schemas for instant test allocation:

```typescript
class SchemaPool {
    private pool: string[] = [];

    async getSchema(): Promise<string> {
        if (this.pool.length === 0) {
            await this.refillPool();
        }
        return this.pool.shift()!;
    }

    private async refillPool(): Promise<void> {
        // Background: Create 10 ready namespaces
        for (let i = 0; i < 10; i++) {
            const nsName = `ns_test_pool_${randomBytes(4).toString('hex')}`;
            await FixtureDeployer.deploy('system', {
                dbName: 'db_test',
                nsName: nsName
            });
            this.pool.push(nsName);
        }
    }
}
```

**Benefit**: Test setup time → near zero

### 4. Connection Pool Optimization

Per-database pools with schema routing:
```typescript
// Instead of single shared pool
const pools = {
    'db_main': new Pool({ max: 50 }),
    'db_test': new Pool({ max: 20 }),
    'db_us_east': new Pool({ max: 30 }),
};

// Route based on tenant database
const pool = pools[tenant.dbName];
```

**Benefit**: Better resource distribution

### 5. Monitoring & Metrics

Track schema distribution and performance:
```typescript
interface NamespaceMetrics {
    dbName: string;
    nsName: string;
    tenantName: string;
    queryCount: number;
    avgQueryTime: number;
    diskUsage: bigint;
    lastAccessed: Date;
}
```

**Use cases**:
- Identify candidates for database promotion (high-volume tenants)
- Track resource usage per tenant
- Optimize schema placement

### 6. Automated Schema Consolidation

Move tenants between databases based on usage:
```typescript
async function promoteToDatabase(tenantName: string): Promise<void> {
    // 1. Create dedicated database
    const newDb = `db_premium_${hash(tenantName)}`;
    await createDatabase(newDb);

    // 2. Export schema from shared DB
    await pg_dump(...);

    // 3. Import to dedicated DB
    await pg_restore(...);

    // 4. Update tenant record
    await updateTenant(tenantName, { dbName: newDb });

    // 5. Drop old namespace
    await dropNamespace('db_main', oldNsName);
}
```

---

## Appendix: Quick Reference

### Database Naming

```
monk              # Infrastructure database
db_main           # Default shared tenant database
db_test           # Test database
db_<region>       # Regional databases (us_east, eu_west, etc.)
db_premium_<id>   # Premium tenant databases
```

### Schema (Namespace) Naming

```
monk_system                  # System fixture (singleton)
monk_template_<name>         # Templates
ns_tenant_<hash-8>           # Tenants
ns_test_<hash-8>             # Tests
ns_sandbox_<hash-8>          # Sandboxes
```

### Common Operations

**Create tenant:**
```typescript
await FixtureDeployer.deploy('system', {
    dbName: 'db_main',
    nsName: 'ns_tenant_a1b2c3d4'
});
```

**Query tenant data:**
```typescript
await DatabaseConnection.queryInNamespace(
    'db_main',
    'ns_tenant_a1b2c3d4',
    'SELECT * FROM users'
);
```

**Set search path:**
```typescript
const client = await pool.connect();
await DatabaseConnection.setLocalSearchPath(client, 'ns_tenant_a1b2c3d4');
// All queries now scoped to ns_tenant_a1b2c3d4 namespace
```

**Build fixture:**
```bash
npm run fixtures:build system
```

**Deploy fixture:**
```bash
npm run fixtures:deploy system -- --database db_test --schema ns_test_123
```

---

## Questions & Decisions Log

### Resolved Decisions

1. ✅ Hash length: 8 characters
2. ✅ Shared database name: `db_main`
3. ✅ Test database name: `db_test`
4. ✅ Template storage: Schemas in databases (not separate DBs)
5. ✅ System fixture: `monk.monk_system` schema
6. ✅ Fixture compilation: Build + deploy separation
7. ✅ Compiled fixtures: Committed to git
8. ✅ Parameterization: `:schema` syntax
9. ✅ Initial optimization: Minimal
10. ✅ Build trigger: Manual
11. ✅ Tenant onboarding time: 20s-minutes acceptable
12. ✅ No existing tenant migration needed

### Open Questions (for implementation)

None - all design decisions finalized.

---

## Success Criteria

Implementation is complete when:

- [ ] All tests pass with namespace-based infrastructure
- [ ] Tests run in parallel without connection errors
- [ ] Tenant creation uses namespace deployment (~200-500ms)
- [ ] JWT includes `db` and `ns` fields (compact)
- [ ] Code uses `dbName` and `nsName` variables (readable)
- [ ] All fixtures compiled to `dist/fixtures/*.sql`
- [ ] Documentation updated
- [ ] Connection pool usage reduced by ~90%
- [ ] Can create 100+ test namespaces without errors
- [ ] Can deploy tenants to different databases (db_main, db_us_east, etc.)

---

**End of Document**
