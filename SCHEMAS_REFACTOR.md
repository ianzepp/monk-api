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
│   ├── tenants (infrastructure table)
│   ├── tenant_fixtures (tracks deployed fixtures per tenant)
│   ├── sandboxes (infrastructure table)
│   └── requests (infrastructure table)

db_main (default shared tenant database)
├── ns_tenant_a1b2c3d4 (system fixture only)
├── ns_tenant_b2c3d4e5 (system + crm fixtures)
├── ns_tenant_c3d4e5f6 (system + crm + chat + projects fixtures)
└── ... (hundreds/thousands of lightweight tenants)

db_test (test database)
├── ns_test_abc12345 (system + testing fixtures)
├── ns_test_def67890 (system + crm + testing fixtures)
└── ... (test schemas, fast creation/cleanup)

db_us_east (regional database - optional)
├── ns_tenant_regional_001
└── ns_tenant_regional_002

db_us_west (regional database - optional)
└── ns_tenant_regional_003

db_premium_<id> (dedicated database - optional)
└── ns_tenant_premium_001 (single tenant, dedicated resources)
```

**Note**: Templates are no longer stored as schemas. They exist only as fixture files in the `fixtures/` directory and are deployed on-demand to tenant namespaces.

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

### 4. Compositional Fixture Architecture

**Fixtures are SQL file sets**, not schemas:
- Source: `fixtures/<name>/` directory with `load.sql`, `template.json`, `describe/`, `data/`
- Compiled: `dist/fixtures/<name>.sql` (single optimized file)
- Deployed: Executed into tenant namespaces on-demand

**Key Principle**: Fixtures compose together - `system` is always required, additional fixtures layer on top.

**Examples**:
- Minimal tenant: `system` fixture only
- CRM tenant: `system` + `crm` fixtures
- Full-featured: `system` + `crm` + `chat` + `projects` fixtures
- Test tenant: `system` + `testing` fixtures (prebuilt test data)

### 5. No Template Schema Storage

**Old Approach**: Template databases/schemas to clone
```
monk_template_system database  → clone to → tenant_xyz database
```

**New Approach**: Fixtures deploy from compiled SQL
```
fixtures/system/load.sql → compile → dist/fixtures/system.sql → deploy to → ns_tenant_xyz
```

**Benefits**:
- No template schemas to maintain or sync
- Faster deployment (no cloning, just SQL execution)
- Compositional (mix and match features)
- Git is source of truth for fixtures

### 6. Fixture System: Build + Deploy with Composition

**Two-Phase Architecture:**

**Phase 1: `fixtures:build` (Compilation)**
- Happens at development/CI time
- Reads fixture source files (`load.sql`, `describe/*.sql`, `data/*.sql`)
- Inlines `\ir` directives (PostgreSQL includes)
- Generates single optimized SQL file per fixture
- Output: `dist/fixtures/<name>.sql`
- Committed to git for reproducibility

**Phase 2: `fixtures:deploy` (Execution)**
- Happens at runtime (tests, registration, etc.)
- Resolves fixture dependencies from `template.json`
- Deploys fixtures in dependency order (system first)
- Executes compiled fixture with parameters
- Fast (~200-500ms per fixture)

**Composition:**
- `system` fixture is **always required** (foundation)
- Additional fixtures are **optional and additive**
- Dependencies declared in `template.json`
- Example: `crm` fixture requires `system` fixture
- Deployment order: System first, then fixtures in declaration order
- Each fixture wrapped in transaction (rollback on failure)

**Benefits:**
- No template database cloning needed
- À la carte features (compose what you need)
- Fast enough for tests
- Dependency resolution automatic
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

All existing tenants can be wiped/recreated during refactor. Infrastructure database will be regenerated.

### 9. Open Questions (TODO)

**Fixture Conflicts**: What happens if two fixtures define the same table or conflicting data?
- Current approach: Assume fixtures are well-behaved and don't conflict
- Future: Add validation, namespacing, or explicit conflict resolution
- For now: Document expected fixture behavior and test thoroughly

**Feature Flags**: Should feature availability be:
- Deployment-based only (check `tenant_fixtures` table)?
- Config-based (deployment + runtime flags)?
- Hybrid approach?
- Decision deferred until feature requirements are clearer

**Fixture Ordering**: When deploying `['crm', 'chat', 'projects']`:
- Order: System first (always), then fixtures in declaration order
- If `projects` depends on `crm`, user must declare `['crm', 'projects']` in correct order
- Future: Could add topological sort based on dependencies in `template.json`

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
// Tenants (in any tenant database)
const TENANT_PREFIX = 'ns_tenant_';
// Example: ns_tenant_a1b2c3d4

// Tests (in db_test)
const TEST_PREFIX = 'ns_test_';
// Example: ns_test_abc12345

// Sandboxes (in any database)
const SANDBOX_PREFIX = 'ns_sandbox_';
// Example: ns_sandbox_xyz78901

// Fixtures (source files, not schemas)
const FIXTURES_DIR = 'fixtures/';
// Examples: fixtures/system/, fixtures/crm/, fixtures/chat/
```

---

## Infrastructure Changes

### Tenant Fixtures Table (NEW)

**Track which fixtures are deployed to each tenant:**

```sql
-- New table to track fixture deployments
CREATE TABLE IF NOT EXISTS tenant_fixtures (
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    fixture_name VARCHAR(255) NOT NULL,
    deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (tenant_id, fixture_name)
);

CREATE INDEX idx_tenant_fixtures_tenant ON tenant_fixtures(tenant_id);
CREATE INDEX idx_tenant_fixtures_fixture ON tenant_fixtures(fixture_name);

COMMENT ON TABLE tenant_fixtures IS 'Tracks which fixtures are deployed to each tenant namespace';
COMMENT ON COLUMN tenant_fixtures.fixture_name IS 'Name of deployed fixture (system, crm, chat, etc.)';
```

**Example data:**
```sql
-- Minimal tenant (system only)
INSERT INTO tenant_fixtures (tenant_id, fixture_name) VALUES
    ('tenant-a-uuid', 'system');

-- CRM tenant (system + crm)
INSERT INTO tenant_fixtures (tenant_id, fixture_name) VALUES
    ('tenant-b-uuid', 'system'),
    ('tenant-b-uuid', 'crm');

-- Full-featured tenant (system + crm + chat + projects)
INSERT INTO tenant_fixtures (tenant_id, fixture_name) VALUES
    ('tenant-c-uuid', 'system'),
    ('tenant-c-uuid', 'crm'),
    ('tenant-c-uuid', 'chat'),
    ('tenant-c-uuid', 'projects');

-- Test tenant (system + testing)
INSERT INTO tenant_fixtures (tenant_id, fixture_name) VALUES
    ('test-tenant-uuid', 'system'),
    ('test-tenant-uuid', 'testing');
```

**Note**: The `templates` table is **removed** - fixtures are not stored as database schemas.

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

### 3. Namespace Management Utilities

**New File**: `src/lib/namespace-manager.ts`

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
interface TenantCreateOptions {
    name: string;
    fixtures?: string[];  // Optional fixtures (e.g., ['crm', 'chat'])
    dbName?: string;      // Target database (default: 'db_main')
}

static async createTenant(options: TenantCreateOptions): Promise<TenantInfo> {
    const { name, fixtures = [], dbName = 'db_main' } = options;
    const nsName = DatabaseNaming.generateTenantNsName(name);

    // Check if tenant already exists
    if (await this.tenantExists(name)) {
        throw new Error(`Tenant '${name}' already exists`);
    }

    // Check if namespace already exists in target database
    if (await NamespaceManager.namespaceExists(dbName, nsName)) {
        throw new Error(`Namespace '${nsName}' already exists in ${dbName}`);
    }

    try {
        // 1. Resolve fixture dependencies (system is always first)
        const resolvedFixtures = await this.resolveFixtureDependencies(fixtures);
        // Example: ['crm'] resolves to ['system', 'crm']

        // 2. Create namespace
        await NamespaceManager.createNamespace(dbName, nsName);

        // 3. Deploy fixtures in dependency order
        for (const fixtureName of resolvedFixtures) {
            console.log(`Deploying fixture: ${fixtureName}`);
            await FixtureDeployer.deploy(fixtureName, { dbName, nsName });
        }

        // 4. Create root user in tenant namespace
        await this.createRootUser(dbName, nsName, name);

        // 5. Insert tenant record
        const tenantId = await this.insertTenantRecord(name, dbName, nsName);

        // 6. Record deployed fixtures
        await this.recordFixtures(tenantId, resolvedFixtures);

        return { name, dbName, nsName, fixtures: resolvedFixtures };
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

/**
 * Resolve fixture dependencies by reading template.json files
 */
private static async resolveFixtureDependencies(
    requested: string[]
): Promise<string[]> {
    const resolved = new Set<string>(['system']);  // System always required
    const queue = [...requested];

    while (queue.length > 0) {
        const fixtureName = queue.shift()!;

        if (resolved.has(fixtureName)) continue;

        // Read template.json to get dependencies
        const metadata = await this.getFixtureMetadata(fixtureName);

        // Add dependencies to queue
        for (const dep of metadata.dependencies) {
            if (!resolved.has(dep)) {
                queue.push(dep);
            }
        }

        resolved.add(fixtureName);
    }

    // Return in dependency order (system first, then declaration order)
    return this.topologicalSort(Array.from(resolved));
}

/**
 * Sort fixtures in dependency order
 * System always first, then in declaration order from fixtures array
 */
private static topologicalSort(fixtures: string[]): string[] {
    // Simple implementation: system first, rest maintain order
    // Future: Full topological sort if complex dependencies needed
    const sorted = fixtures.filter(f => f === 'system');
    sorted.push(...fixtures.filter(f => f !== 'system'));
    return sorted;
}

/**
 * Read fixture metadata from template.json
 */
private static async getFixtureMetadata(fixtureName: string): Promise<{
    name: string;
    dependencies: string[];
    features: string[];
}> {
    const metadataPath = join(
        process.cwd(),
        'fixtures',
        fixtureName,
        'template.json'
    );

    const content = await readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
}

/**
 * Record deployed fixtures for this tenant
 */
private static async recordFixtures(
    tenantId: string,
    fixtures: string[]
): Promise<void> {
    const mainPool = DatabaseConnection.getMainPool();

    for (const fixtureName of fixtures) {
        await mainPool.query(
            `INSERT INTO tenant_fixtures (tenant_id, fixture_name)
             VALUES ($1, $2)`,
            [tenantId, fixtureName]
        );
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

**Compositional fixture architecture** where fixtures layer on top of each other:
- `system` fixture is **always required** (foundation)
- Additional fixtures are **optional and additive** (crm, chat, projects, testing)
- Dependencies declared in `template.json` files
- Two-phase build + deploy process

### Fixture Structure (Existing Pattern)

Each fixture follows this structure (already implemented in `fixtures/system/`):

```
fixtures/<name>/
├── load.sql              # Master loader with phases + \ir directives
├── template.json         # Metadata (name, version, dependencies, features)
├── README.md            # Documentation
├── version.txt          # Version tracking
├── describe/            # DDL (table definitions)
│   ├── models.sql
│   ├── fields.sql
│   └── ...
└── data/               # DML (data inserts)
    ├── models.sql
    ├── fields.sql
    └── ...
```

### Example: System Fixture (Required)

**`fixtures/system/template.json`:**
```json
{
  "name": "system",
  "description": "Core infrastructure models (models, fields, users, etc.)",
  "version": "1.0.0",
  "is_system": true,
  "dependencies": [],
  "features": [
    "core-infrastructure",
    "model-registry",
    "field-metadata",
    "user-management"
  ]
}
```

**Note**: `version` field is a placeholder for future versioning/migration support (not currently used).

### Example: CRM Fixture (Optional)

**`fixtures/crm/template.json`:**
```json
{
  "name": "crm",
  "description": "CRM feature with contacts, companies, and deals",
  "version": "1.0.0",
  "is_system": false,
  "dependencies": ["system"],
  "features": ["contacts", "companies", "deals"]
}
```

**`fixtures/crm/load.sql`:**
```sql
-- Requires: system fixture (models, fields tables must exist)
\echo 'Loading CRM Fixture'

-- Validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'models') THEN
        RAISE EXCEPTION 'System fixture not loaded';
    END IF;
END $$;

-- Table definitions
\ir describe/contacts.sql
\ir describe/companies.sql
\ir describe/deals.sql

-- Data (register CRM models in system.models table)
\ir data/models.sql
\ir data/fields.sql
```

### Example: Testing Fixture (Test Data)

**`fixtures/testing/template.json`:**
```json
{
  "name": "testing",
  "description": "Prebuilt test data for test suites",
  "version": "1.0.0",
  "dependencies": ["system"],
  "features": ["test-data", "test-users"]
}
```

**`fixtures/testing/data/users.sql`:**
```sql
-- Prebuilt test users with hardcoded IDs (safe for parallel tests)
-- Note: users table has id DEFAULT gen_random_uuid(), but we provide explicit IDs
-- for referential integrity in test data (can reference these known IDs)
INSERT INTO users (id, name, auth, access) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Test User 1', 'testuser1', 'full'),
    ('00000000-0000-0000-0000-000000000002', 'Test User 2', 'testuser2', 'read'),
    ('00000000-0000-0000-0000-000000000003', 'Test User 3', 'testuser3', 'edit')
ON CONFLICT (auth) DO NOTHING;
```

### Two-Phase Process

1. **Build Phase** (compilation): fixtures → optimized SQL
2. **Deploy Phase** (execution): compiled SQL → database + namespace

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

        // 3. Execute within transaction (automatic rollback on failure)
        const pool = DatabaseConnection.getPool(target.dbName);
        const client = await pool.connect();

        try {
            await client.query('BEGIN');
            await client.query(parameterized);
            await client.query('COMMIT');
            console.log(`✓ Deployed successfully`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`✗ Deployment failed, rolled back`);
            throw error;
        } finally {
            client.release();
        }
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
npm run fixtures:build crm
npm run fixtures:build chat
npm run fixtures:build testing
```

**Tenant creation (programmatic - multiple fixtures):**
```typescript
// Minimal tenant (system only)
await TenantService.createTenant({
    name: 'startup-minimal'
    // Deploys: ['system']
});

// CRM tenant (system + crm)
await TenantService.createTenant({
    name: 'sales-company',
    fixtures: ['crm']
    // Resolves dependencies: ['system', 'crm']
});

// Full-featured tenant (system + crm + chat + projects)
await TenantService.createTenant({
    name: 'enterprise-corp',
    fixtures: ['crm', 'chat', 'projects']
    // Resolves: ['system', 'crm', 'chat', 'projects']
});

// Test tenant with prebuilt data
await TenantService.createTenant({
    name: 'test-suite-1',
    fixtures: ['testing'],
    dbName: 'db_test'
    // Resolves: ['system', 'testing']
});
```

**Manual fixture deployment (for testing):**
```bash
# Deploy single fixture
npm run fixtures:deploy system -- --database db_test --schema ns_test_abc123

# Deploy multiple fixtures (manual)
npm run fixtures:deploy system -- --database db_main --schema ns_tenant_xyz789
npm run fixtures:deploy crm -- --database db_main --schema ns_tenant_xyz789
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

### Phase 1: Infrastructure Setup ✅ COMPLETE

- [x] ~~Create `dist/fixtures/` directory~~ (CHANGED: Fixtures compile to `fixtures/<name>/deploy.sql` instead)
- [x] ~~Update `.gitignore`~~ (Not needed - fixtures are in fixtures/ dir, already tracked)
- [x] Create default databases:
  ```bash
  createdb monk
  createdb db_main
  createdb db_test
  ```
- [x] Update `fixtures/infrastructure/init.sql`:
  - [x] Remove `templates` table (no longer needed)
  - [x] Add `tenant_fixtures` table (tracks which fixtures deployed to each tenant)
  - [x] Add `schema` column to `tenants` table
  - [x] Add `schema` column to `sandboxes` table
  - [x] Update constraints and indexes
  - [x] Remove database prefix checks
- [x] Run infrastructure init:
  ```bash
  psql -d monk -f fixtures/infrastructure/init.sql
  ```

### Phase 2: Core Library Changes ✅ COMPLETE

- [x] Update `src/lib/database-naming.ts`:
  - [x] Change hash length from 16 to 8 characters
  - [x] Add `generateTenantNsName()` method
  - [x] Add `generateTestNsName()` method
  - [x] Add `generateSandboxNsName()` method
  - [x] Add `isTenantNamespace()` method
  - [x] Add `validateNamespaceName()` method
  - [ ] Update tests (deferred to later)

- [x] Create `src/lib/namespace-manager.ts`:
  - [x] Implement `NamespaceManager` class
  - [x] Implement `createNamespace()`
  - [x] Implement `dropNamespace()`
  - [x] Implement `namespaceExists()`
  - [x] Implement `listNamespaces()`
  - [x] Implement `validateNamespaceName()`
  - [ ] Add tests (deferred to later)

- [x] Update `src/lib/database-connection.ts`:
  - [x] Add `setSearchPath()` method (uses `nsName` parameter)
  - [x] Add `setLocalSearchPath()` method (uses `nsName` parameter)
  - [x] Add `queryInNamespace()` method (uses `dbName` and `nsName`)
  - [x] Add `setDatabaseAndNamespaceForRequest()` method (new method, kept old for compatibility)
  - [x] Kept `getTenantPool()` for backward compatibility (will update in later phases)
  - [x] Update comments/documentation
  - [ ] Add tests (deferred to later)

- [x] Update `src/lib/database-types.ts`:
  - [x] No changes needed (types will be updated in service layer phases)

### Phase 3: Fixture System

- [ ] Create `src/lib/fixtures/builder.ts`:
  - [ ] Implement `FixtureBuilder` class
  - [ ] Implement `build()` method
  - [ ] Implement `inlineIncludes()` method (handles `\ir` directives)
  - [ ] Implement `addParameterization()` method
  - [ ] Add placeholder for `optimize()` method
  - [ ] Add tests

- [ ] Create `src/lib/fixtures/deployer.ts`:
  - [ ] Implement `FixtureDeployer` class
  - [ ] Implement `deploy()` method
  - [ ] Add parameter injection (`:database`, `:schema`)
  - [ ] Support multiple fixture deployment
  - [ ] Add tests

- [ ] Update existing fixture `template.json` files:
  - [ ] Add `dependencies` field to `fixtures/system/template.json`
  - [ ] Create `fixtures/crm/template.json` (example optional fixture)
  - [ ] Create `fixtures/testing/template.json` (test data fixture)

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
  npm run fixtures:build crm
  npm run fixtures:build chat
  npm run fixtures:build testing
  ```

- [ ] Test fixture deployment:
  ```bash
  # Single fixture
  npm run fixtures:deploy system -- --database db_test --schema ns_test_validate

  # Multiple fixtures (manual composition test)
  npm run fixtures:deploy system -- --database db_test --schema ns_test_compose
  npm run fixtures:deploy crm -- --database db_test --schema ns_test_compose
  ```

### Phase 4: Service Layer Updates

- [ ] Update `src/lib/services/tenant.ts`:
  - [ ] Update `JWTPayload` interface (add `db`, `ns` fields for JWT)
  - [ ] Update `generateToken()` method (use compact `db`/`ns` in JWT)
  - [ ] Update `login()` method (use `dbName`/`nsName` in code)
  - [ ] Update `createTenant()` method:
    - [ ] Change signature to accept `fixtures` array
    - [ ] Add `resolveFixtureDependencies()` method
    - [ ] Add `getFixtureMetadata()` method (reads `template.json`)
    - [ ] Add `recordFixtures()` method (inserts into `tenant_fixtures`)
    - [ ] Deploy multiple fixtures in dependency order
  - [ ] Add `addFixture()` method (deploy additional fixture to existing tenant)
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

**Deprecated/Legacy Methods to Remove:**

From `src/lib/database-naming.ts`:
- [ ] `generateDatabaseName()` - marked @deprecated, replaced by `generateTenantNsName()`
- [ ] `extractHash()` - validates 16-char hash, update to 8-char or remove
- [ ] `isTenantDatabase()` - checks tenant_/test_ prefixes, may not be needed

From `src/lib/database-connection.ts`:
- [ ] `MONK_DB_TENANT_PREFIX` constant - replaced by namespace prefixes (ns_tenant_)
- [ ] `MONK_DB_TEST_PREFIX` constant - replaced by namespace prefixes (ns_test_)
- [ ] `MONK_DB_TEST_TEMPLATE_PREFIX` constant - templates no longer used
- [ ] `getTenantPool()` - kept for compatibility, replace with namespace-aware approach
- [ ] `setDatabaseForRequest(c, tenantName)` - kept for compatibility, replace with `setDatabaseAndNamespaceForRequest()`
- [ ] `validateTenantDatabaseName()` - validates tenant_ prefix, may not be needed
- [ ] `createDatabase()` - tenant databases no longer created per-tenant
- [ ] `deleteDatabase()` - tenant databases no longer deleted (drop namespaces instead)

From service files (to be identified in later phases):
- [ ] Database cloning logic in `database-template.ts`
- [ ] Template database creation/management code
- [ ] Per-tenant database creation in `tenant.ts`

**Actions:**
- [ ] Remove deprecated methods and constants
- [ ] Update all call sites to use new namespace-based methods
- [ ] Remove database prefix validation for tenants
- [ ] Remove template database management code

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
        // Background: Create 10 ready namespaces with 8-char hashes
        for (let i = 0; i < 10; i++) {
            const nsName = `ns_test_pool_${randomBytes(4).toString('hex')}`;  // 4 bytes = 8 hex chars
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
ns_tenant_<hash-8>           # Tenants
ns_test_<hash-8>             # Tests
ns_sandbox_<hash-8>          # Sandboxes
```

### Fixture Names (Source Files)

```
fixtures/system/             # Required - core infrastructure
fixtures/crm/                # Optional - CRM feature
fixtures/chat/               # Optional - chat feature
fixtures/projects/           # Optional - project management
fixtures/testing/            # Optional - prebuilt test data
```

### Common Operations

**Create tenant with fixtures:**
```typescript
await TenantService.createTenant({
    name: 'my-company',
    fixtures: ['crm', 'chat']
    // Auto-deploys: system (required), then crm, then chat
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
4. ✅ Compositional fixtures: No template schemas, deploy from SQL files
5. ✅ System fixture: Always required, deployed first
6. ✅ Fixture compilation: Build + deploy separation
7. ✅ Compiled fixtures: Committed to git
8. ✅ Parameterization: `:database` and `:schema` syntax
9. ✅ Initial optimization: Minimal
10. ✅ Build trigger: Manual
11. ✅ Tenant onboarding time: 20s-minutes acceptable
12. ✅ No existing tenant migration needed
13. ✅ Namespace naming: `ns_tenant_`, `ns_test_`, `ns_sandbox_` prefixes
14. ✅ JWT fields: `db` and `ns` (compact), code uses `dbName` and `nsName`
15. ✅ Fixture ordering: System first, then declaration order
16. ✅ Version field: Placeholder for future use (not implemented yet)
17. ✅ Transaction wrapping: Each fixture deploys in transaction (rollback on failure)

### Open Questions (TODO)

1. **Fixture conflicts**: How to handle when fixtures define conflicting tables/data?
2. **Feature flags**: Deployment-based vs config-based vs hybrid approach?
3. **Complex dependencies**: Need full topological sort for fixture dependencies?
4. **Fixture versioning**: When/how to implement version tracking and migrations?
5. **Rollback strategy**: Should we track partial deployments for granular rollback?

---

## Success Criteria

Implementation is complete when:

- [ ] All tests pass with namespace-based infrastructure
- [ ] Tests run in parallel without connection errors
- [ ] Tenant creation uses compositional fixture deployment
- [ ] Multiple fixtures can be deployed to single namespace
- [ ] Fixture dependencies resolve correctly (system always first)
- [ ] JWT includes `db` and `ns` fields (compact)
- [ ] Code uses `dbName` and `nsName` variables (readable)
- [ ] All fixtures compiled to `dist/fixtures/*.sql`
- [ ] `tenant_fixtures` table tracks deployed fixtures per tenant
- [ ] Documentation updated
- [ ] Connection pool usage reduced by ~90%
- [ ] Can create 100+ test namespaces without errors
- [ ] Can deploy tenants to different databases (db_main, db_us_east, etc.)
- [ ] Can compose fixtures: system only, system+crm, system+crm+chat+projects, etc.

---

**End of Document**
