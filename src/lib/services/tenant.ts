/**
 * TenantService - Consolidated tenant and authentication operations
 *
 * Handles all operations related to tenant management and authentication
 * against the monk database (tenant registry database).
 *
 * WARNING: This service makes direct database calls and should NEVER be used
 * by the API server. It's intended for CLI operations and testing only.
 *
 * Consolidates functionality from:
 * - JWT operations handled by middleware and route handlers
 * - TenantManager (tenant CRUD operations)
 */

import { readFileSync, readFile } from 'fs';
import { promises as fsPromises } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { DatabaseNaming } from '@src/lib/database-naming.js';
import { NamespaceManager } from '@src/lib/namespace-manager.js';
import { FixtureDeployer } from '@src/lib/fixtures/deployer.js';
import { JWTGenerator } from '@src/lib/jwt-generator.js';
import { Describe } from '@src/lib/describe.js';
import pg from 'pg';

export interface TenantInfo {
    id?: string;
    name: string;
    host: string;
    database: string;
    schema?: string;
    fixtures?: string[];
    created_at?: string;
    updated_at?: string;
    trashed_at?: string;
    deleted_at?: string;
}

export interface TenantCreateOptions {
    name: string;
    host?: string;
    fixtures?: string[];
    dbName?: string;
    force?: boolean;
}

export interface JWTPayload {
    sub: string; // Subject/system identifier
    user_id: string | null; // User ID for database records (null for root/system)
    tenant: string; // Tenant name
    db: string; // Database name (compact JWT field: db_main, db_test, etc.)
    ns: string; // Namespace name (compact JWT field: ns_tenant_<hash-8>)
    access: string; // Access level (deny/read/edit/full/root)
    access_read: string[]; // ACL read access
    access_edit: string[]; // ACL edit access
    access_full: string[]; // ACL full access
    iat: number; // Issued at
    exp: number; // Expires at
    [key: string]: any; // Index signature for Hono compatibility
}

export interface LoginResult {
    token: string;
    user: {
        id: string;
        username: string;
        tenant: string;
        dbName: string;
        nsName: string;
        access: string;
    };
}

export class TenantService {
    private static tokenExpiry = 24 * 60 * 60; // 24 hours in seconds

    private static getJwtSecret(): string {
        return process.env['JWT_SECRET']!;
    }

    // ==========================================
    // TENANT MANAGEMENT OPERATIONS
    // ==========================================

    /**
     * Get auth database pool (monk database)
     */
    private static getAuthPool(): pg.Pool {
        return DatabaseConnection.getMainPool();
    }

    /**
     * Create one-time client for auth database operations
     */
    private static createAuthClient(): pg.Client {
        const mainDbName = DatabaseConnection.getMainDatabaseName();
        return DatabaseConnection.getClient(mainDbName);
    }

    /**
     * Create one-time client for tenant database operations
     */
    private static createTenantClient(tenantName: string): pg.Client {
        return DatabaseConnection.getClient(tenantName);
    }

    /**
     * Create one-time client for postgres system database
     */
    private static createPostgresClient(): pg.Client {
        return DatabaseConnection.getClient('postgres');
    }

    /**
     * Convert tenant name to hashed database identifier
     *
     * Uses SHA256 hash to create safe PostgreSQL database names from any Unicode input.
     * This enables full international character support while guaranteeing valid DB identifiers.
     *
     * Examples:
     *   "My Cool App" → "tenant_a1b2c3d4e5f6789a" (16-char hash with prefix)
     *   "测试应用" → "tenant_f9e8d7c6b5a49382" (16-char hash with prefix)
     *   "🚀 Rocket" → "tenant_d4c9b8a7f6e51203" (16-char hash with prefix)
     *
     * @deprecated Use DatabaseNaming.generateDatabaseName() instead
     */
    static tenantNameToDatabase(tenantName: string): string {
        return DatabaseNaming.generateDatabaseName(tenantName);
    }

    /**
     * Check if tenant already exists
     */
    static async tenantExists(tenantName: string): Promise<boolean> {
        const client = this.createAuthClient();

        try {
            await client.connect();

            const result = await client.query('SELECT COUNT(*) as count FROM tenants WHERE name = $1 AND trashed_at IS NULL AND deleted_at IS NULL', [tenantName]);

            return parseInt(result.rows[0].count) > 0;
        } finally {
            await client.end();
        }
    }

    /**
     * Check if database exists
     */
    static async databaseExists(databaseName: string): Promise<boolean> {
        const client = this.createPostgresClient();

        try {
            await client.connect();

            const result = await client.query('SELECT COUNT(*) as count FROM pg_database WHERE datname = $1', [databaseName]);

            return parseInt(result.rows[0].count) > 0;
        } finally {
            await client.end();
        }
    }

    /**
     * Create new tenant with namespace and fixtures
     */
    static async createTenant(options: TenantCreateOptions | string, hostLegacy?: string, forceLegacy?: boolean): Promise<TenantInfo> {
        // Support legacy signature: createTenant(tenantName, host, force)
        const opts: TenantCreateOptions =
            typeof options === 'string'
                ? { name: options, host: hostLegacy || 'localhost', force: forceLegacy || false }
                : { host: 'localhost', fixtures: [], dbName: 'db_main', force: false, ...options };

        const { name, host = 'localhost', fixtures = [], dbName = 'db_main', force = false } = opts;

        // Generate namespace name
        const nsName = DatabaseNaming.generateTenantNsName(name);

        // Check if tenant already exists
        if (!force && (await this.tenantExists(name))) {
            throw new Error(`Tenant '${name}' already exists (use force=true to override)`);
        }

        // Check if namespace already exists in target database
        if (!force && (await NamespaceManager.namespaceExists(dbName, nsName))) {
            throw new Error(`Namespace '${nsName}' already exists in ${dbName}`);
        }

        // If forcing and tenant exists, delete it first
        if (force) {
            try {
                await this.deleteTenant(name, true);
            } catch (error) {
                // Ignore errors during cleanup
                console.warn(`Warning during cleanup: ${error}`);
            }
        }

        try {
            // 1. Resolve fixture dependencies (system is always first)
            const resolvedFixtures = await this.resolveFixtureDependencies(fixtures);
            console.info('Deploying fixtures:', resolvedFixtures);

            // 2. Create namespace
            await NamespaceManager.createNamespace(dbName, nsName);

            // 3. Deploy fixtures in dependency order
            await FixtureDeployer.deployMultiple(resolvedFixtures, { dbName, nsName });

            // 4. Create root user in tenant namespace
            await this.createRootUser(dbName, nsName, name);

            // 5. Insert tenant record
            const tenantId = await this.insertTenantRecord(name, host, dbName, nsName);

            // 6. Record deployed fixtures
            await this.recordFixtures(tenantId, resolvedFixtures);

            return {
                name,
                host,
                database: dbName,
                schema: nsName,
                fixtures: resolvedFixtures,
            };
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
     * Soft delete tenant (sets trashed_at timestamp)
     * This hides the tenant from normal operations but preserves data for recovery
     *
     * @param tenantName - The tenant name to soft delete
     */
    static async trashTenant(tenantName: string): Promise<void> {
        if (!(await this.tenantExists(tenantName))) {
            throw new Error(`Tenant '${tenantName}' does not exist`);
        }

        const authClient = this.createAuthClient();
        try {
            await authClient.connect();
            await authClient.query('UPDATE tenants SET trashed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE name = $1 AND trashed_at IS NULL', [tenantName]);
        } finally {
            await authClient.end();
        }
    }

    /**
     * Restore soft deleted tenant (clears trashed_at timestamp)
     *
     * @param tenantName - The tenant name to restore
     */
    static async restoreTenant(tenantName: string): Promise<void> {
        const authClient = this.createAuthClient();
        try {
            await authClient.connect();
            const result = await authClient.query('UPDATE tenants SET trashed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE name = $1 AND trashed_at IS NOT NULL', [tenantName]);

            if (result.rowCount === 0) {
                throw new Error(`Tenant '${tenantName}' is not in trash or does not exist`);
            }
        } finally {
            await authClient.end();
        }
    }

    /**
     * List tenants with soft delete awareness
     *
     * @param includeTrashed - Whether to include soft deleted tenants
     * @param includeDeleted - Whether to include hard deleted tenants
     */
    static async listTenantsWithStatus(includeTrashed: boolean = false, includeDeleted: boolean = false): Promise<(TenantInfo & { trashed_at?: string; deleted_at?: string })[]> {
        const authClient = this.createAuthClient();

        try {
            await authClient.connect();

            let whereClause = 'WHERE 1=1';
            if (!includeTrashed) {
                whereClause += ' AND trashed_at IS NULL';
            }
            if (!includeDeleted) {
                whereClause += ' AND deleted_at IS NULL';
            }

            const result = await authClient.query(`
        SELECT name, database, host, created_at, updated_at, trashed_at, deleted_at
        FROM tenants
        ${whereClause}
        ORDER BY created_at DESC
      `);

            return result.rows.map(row => ({
                name: row.name,
                database: row.database,
                host: row.host,
                created_at: row.created_at,
                updated_at: row.updated_at,
                trashed_at: row.trashed_at,
                deleted_at: row.deleted_at,
            }));
        } finally {
            await authClient.end();
        }
    }

    /**
     * Hard delete tenant and its database (destructive operation)
     * This is a destructive operation and will delete the tenant and all its data
     *
     * @param tenantName - The tenant name to delete
     * @param force - Whether to force deletion even if tenant doesn't exist
     */
    static async deleteTenant(tenantName: string, force: boolean = false): Promise<void> {
        const databaseName = this.tenantNameToDatabase(tenantName);

        if (!force && !(await this.tenantExists(tenantName))) {
            throw new Error(`Tenant '${tenantName}' does not exist`);
        }

        // Remove tenant record from auth database
        const authClient = this.createAuthClient();
        try {
            await authClient.connect();
            await authClient.query('DELETE FROM tenants WHERE name = $1', [tenantName]);
        } catch (error) {
            if (!force) throw error;
            console.warn(`Warning removing tenant record: ${error}`);
        } finally {
            await authClient.end();
        }

        // Drop the database
        try {
            await this.dropDatabase(databaseName);
        } catch (error) {
            if (!force) throw error;
            console.warn(`Warning dropping database: ${error}`);
        }
    }

    /**
     * List all tenants
     */
    static async listTenants(): Promise<TenantInfo[]> {
        const client = this.createAuthClient();

        try {
            await client.connect();

            const result = await client.query(
                'SELECT id, name, host, database, schema, created_at, updated_at, trashed_at, deleted_at FROM tenants WHERE trashed_at IS NULL AND deleted_at IS NULL ORDER BY name'
            );

            return result.rows.map(row => ({
                name: row.name,
                host: row.host,
                database: row.database,
                schema: row.schema,
                created_at: row.created_at,
                updated_at: row.updated_at,
                trashed_at: row.trashed_at,
                deleted_at: row.deleted_at,
            }));
        } finally {
            await client.end();
        }
    }

    /**
     * Get tenant information
     */
    static async getTenant(tenantName: string): Promise<TenantInfo | null> {
        const client = this.createAuthClient();

        try {
            await client.connect();

            const result = await client.query('SELECT id, name, host, database, schema FROM tenants WHERE name = $1 AND trashed_at IS NULL AND deleted_at IS NULL', [tenantName]);

            if (result.rows.length === 0) {
                return null;
            }

            return {
                name: result.rows[0].name,
                host: result.rows[0].host,
                database: result.rows[0].database,
                schema: result.rows[0].schema,
            };
        } finally {
            await client.end();
        }
    }

    // ==========================================
    // AUTHENTICATION OPERATIONS
    // ==========================================

    /**
     * Generate JWT token for user
     *
     * @deprecated Use JWTGenerator.generateToken() directly
     */
    static async generateToken(user: any): Promise<string> {
        return JWTGenerator.generateToken({
            id: user.id,
            user_id: user.user_id || null,
            tenant: user.tenant,
            dbName: user.dbName,
            nsName: user.nsName,
            access: user.access || 'root',
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
        });
    }

    /**
     * Verify and decode JWT token
     *
     * @deprecated Use JWTGenerator.verifyToken() directly
     */
    static async verifyToken(token: string): Promise<JWTPayload> {
        return JWTGenerator.verifyToken(token);
    }

    /**
     * Login with tenant and username authentication
     */
    static async login(tenant: string, username: string): Promise<LoginResult | null> {
        if (!tenant || !username) {
            return null; // Both tenant and username required
        }

        // Look up tenant record to get database and schema
        const authDb = this.getAuthPool();
        const tenantResult = await authDb.query('SELECT name, database, schema FROM tenants WHERE name = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL', [tenant]);

        if (!tenantResult.rows || tenantResult.rows.length === 0) {
            return null; // Tenant not found or inactive
        }

        const { name, database, schema } = tenantResult.rows[0];

        // Look up user in the tenant's namespace
        const userResult = await DatabaseConnection.queryInNamespace(
            database,
            schema,
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );

        if (!userResult.rows || userResult.rows.length === 0) {
            return null; // User not found or inactive
        }

        const user = userResult.rows[0];

        // Create user object for JWT (using dbName/nsName in code)
        const authUser = {
            id: user.id,
            user_id: user.id,
            tenant: name,
            dbName: database, // Use dbName in code (maps to 'db' in JWT)
            nsName: schema, // Use nsName in code (maps to 'ns' in JWT)
            username: user.auth,
            access: user.access,
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
            access_deny: user.access_deny || [],
            is_active: true,
        };

        // Generate token
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

    /**
     * Validate JWT token and return payload
     *
     * @deprecated Use JWTGenerator.validateToken() directly
     */
    static async validateToken(token: string): Promise<JWTPayload | null> {
        return JWTGenerator.validateToken(token);
    }

    // ==========================================
    // PRIVATE HELPER METHODS
    // ==========================================

    /**
     * Create PostgreSQL database
     */
    private static async createDatabase(databaseName: string): Promise<void> {
        const client = this.createPostgresClient();

        try {
            await client.connect();
            // Note: Database names cannot be parameterized, but we've sanitized the name
            await client.query(`CREATE DATABASE "${databaseName}"`);
        } finally {
            await client.end();
        }
    }

    /**
     * Drop PostgreSQL database
     */
    private static async dropDatabase(databaseName: string): Promise<void> {
        const client = this.createPostgresClient();

        try {
            await client.connect();
            // Note: Database names cannot be parameterized, but we've sanitized the name
            await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        } finally {
            await client.end();
        }
    }

    /**
     * Initialize tenant database model using sql/init-tenant.sql
     */
    private static async initializeTenantModel(databaseName: string): Promise<void> {
        const client = this.createTenantClient(databaseName);

        try {
            await client.connect();

            // Load and execute init-tenant.sql
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const sqlPath = join(__dirname, '../../../sql/init-tenant.sql');
            const initSql = readFileSync(sqlPath, 'utf8');

            await client.query(initSql);
        } finally {
            await client.end();
        }
    }

    /**
     * Create user model via describe for API-managed user table
     */
    private static async createUserModel(databaseName: string): Promise<void> {
        // Create a system context for describe operations
        const mockContext = {
            env: { JWT_SECRET: process.env['JWT_SECRET']! },
            get: () => undefined,
            set: () => undefined,
        };

        // Set up database context for the tenant
        DatabaseConnection.setDatabaseForRequest(mockContext as any, databaseName);

        const describe = new Describe(mockContext as any);

        try {
            // Note: This method is disabled because user model is now SQL-managed via init-tenant.sql
            // Test fixture models are located in spec/fixtures/model/ (not src/describedata)
            // const userModelYaml = '...';

            // Create user model via describe (proper DDL generation + model registration)
            // await describe.createOne('models', userModelYaml);

            console.info('User model created via describe', { databaseName });
        } catch (error) {
            console.warn('Failed to create user model via describe', { databaseName, error });
            throw new Error(`Failed to create user model: ${error}`);
        }
    }

    /**
     * Create root user in tenant namespace
     */
    private static async createRootUser(dbName: string, nsName: string, tenantName: string): Promise<void> {
        await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            'INSERT INTO users (name, auth, access) VALUES ($1, $2, $3)',
            ['Root User', 'root', 'root']
        );
    }

    /**
     * Insert tenant record in auth database
     */
    private static async insertTenantRecord(tenantName: string, host: string, dbName: string, nsName: string): Promise<string> {
        const client = this.createAuthClient();

        try {
            await client.connect();

            const result = await client.query(
                'INSERT INTO tenants (name, host, database, schema) VALUES ($1, $2, $3, $4) RETURNING id',
                [tenantName, host, dbName, nsName]
            );

            if (!result.rows[0]?.id) {
                throw new Error('Failed to insert tenant record');
            }

            return result.rows[0].id;
        } finally {
            await client.end();
        }
    }

    /**
     * Resolve fixture dependencies by reading template.json files
     * System fixture is always included first
     */
    private static async resolveFixtureDependencies(requested: string[]): Promise<string[]> {
        const resolved = new Set<string>(['system']); // System always required
        const queue = [...requested];

        while (queue.length > 0) {
            const fixtureName = queue.shift()!;

            if (resolved.has(fixtureName)) continue;

            // Read template.json to get dependencies
            const metadata = await this.getFixtureMetadata(fixtureName);

            // Add dependencies to queue
            for (const dep of metadata.dependencies || []) {
                if (!resolved.has(dep)) {
                    queue.push(dep);
                }
            }

            resolved.add(fixtureName);
        }

        // Return in dependency order (system first, then others)
        return this.topologicalSort(Array.from(resolved));
    }

    /**
     * Sort fixtures in dependency order
     * System always first, rest maintain order
     */
    private static topologicalSort(fixtures: string[]): string[] {
        // Simple implementation: system first, rest maintain order
        // Future: Full topological sort if complex dependencies needed
        const sorted: string[] = fixtures.filter(f => f === 'system');
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
        const metadataPath = join(process.cwd(), 'fixtures', fixtureName, 'template.json');

        const content = await fsPromises.readFile(metadataPath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * Record deployed fixtures for this tenant
     */
    private static async recordFixtures(tenantId: string, fixtures: string[]): Promise<void> {
        const mainPool = DatabaseConnection.getMainPool();

        for (const fixtureName of fixtures) {
            await mainPool.query('INSERT INTO tenant_fixtures (tenant_id, fixture_name) VALUES ($1, $2)', [tenantId, fixtureName]);
        }
    }
}
