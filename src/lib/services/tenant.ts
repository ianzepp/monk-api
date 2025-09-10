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

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { sign, verify } from 'hono/jwt';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { Describe } from '@src/lib/describe.js';
import pg from 'pg';

export interface TenantInfo {
    id?: string;
    name: string;
    host: string;
    database: string;
    created_at?: string;
    updated_at?: string;
    trashed_at?: string;
    deleted_at?: string;
}

export interface JWTPayload {
    sub: string; // Subject/system identifier
    user_id: string | null; // User ID for database records (null for root/system)
    tenant: string; // Tenant name
    database: string; // Database name (converted)
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
        database: string;
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
        return DatabaseConnection.getClient('monk');
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
     */
    static tenantNameToDatabase(tenantName: string): string {
        // Normalize Unicode for consistent hashing
        const normalizedName = tenantName.trim().normalize('NFC');

        // Generate SHA256 hash and take first 16 characters
        const hash = createHash('sha256').update(normalizedName, 'utf8').digest('hex').substring(0, 16);

        // Add prefix to distinguish from test databases (which use test_*)
        return `tenant_${hash}`;
    }

    /**
     * Check if tenant already exists
     */
    static async tenantExists(tenantName: string): Promise<boolean> {
        const client = this.createAuthClient();

        try {
            await client.connect();

            const result = await client.query('SELECT COUNT(*) as count FROM tenant WHERE name = $1 AND trashed_at IS NULL AND deleted_at IS NULL', [tenantName]);

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
     * Create new tenant with database and auth record
     */
    static async createTenant(tenantName: string, host: string = 'localhost', force: boolean = false): Promise<TenantInfo> {
        const databaseName = this.tenantNameToDatabase(tenantName);

        // Check if tenant already exists
        if (!force && (await this.tenantExists(tenantName))) {
            throw new Error(`Tenant '${tenantName}' already exists (use force=true to override)`);
        }

        // Check if database already exists
        if (!force && (await this.databaseExists(databaseName))) {
            throw new Error(`Database '${databaseName}' already exists (use force=true to override)`);
        }

        // If forcing and tenant exists, delete it first
        if (force) {
            try {
                await this.deleteTenant(tenantName, true);
            } catch (error) {
                // Ignore errors during cleanup - database might not exist
                logger.warn(`Warning during cleanup: ${error}`);
            }
        }

        // Create the PostgreSQL database
        await this.createDatabase(databaseName);

        try {
            // Initialize tenant database schema
            await this.initializeTenantSchema(databaseName);

            // Create user schema via metabase (API-managed user table)
            // DISABLED: User table is already created by init-tenant.sql during initializeTenantSchema()
            // This was redundant schema creation that caused mockContext architectural issues
            // await this.createUserSchema(databaseName);

            // Create root user via API (goes through observer pipeline)
            await this.createRootUser(databaseName, tenantName);

            // Insert tenant record in auth database
            await this.insertTenantRecord(tenantName, host, databaseName);

            return {
                name: tenantName,
                host: host,
                database: databaseName,
            };
        } catch (error) {
            // Clean up database if initialization failed
            try {
                await this.dropDatabase(databaseName);
            } catch (cleanupError) {
                logger.warn(`Failed to cleanup database after error: ${cleanupError}`);
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
            await authClient.query('UPDATE tenant SET trashed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE name = $1 AND trashed_at IS NULL', [tenantName]);
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
            const result = await authClient.query('UPDATE tenant SET trashed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE name = $1 AND trashed_at IS NOT NULL', [tenantName]);

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
        FROM tenant
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
            await authClient.query('DELETE FROM tenant WHERE name = $1', [tenantName]);
        } catch (error) {
            if (!force) throw error;
            logger.warn(`Warning removing tenant record: ${error}`);
        } finally {
            await authClient.end();
        }

        // Drop the database
        try {
            await this.dropDatabase(databaseName);
        } catch (error) {
            if (!force) throw error;
            logger.warn(`Warning dropping database: ${error}`);
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
                'SELECT id, name, host, database, created_at, updated_at, trashed_at, deleted_at FROM tenant WHERE trashed_at IS NULL AND deleted_at IS NULL ORDER BY name'
            );

            return result.rows.map(row => ({
                name: row.name,
                host: row.host,
                database: row.database,
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

            const result = await client.query('SELECT id, name, host, database FROM tenant WHERE name = $1 AND trashed_at IS NULL AND deleted_at IS NULL', [tenantName]);

            if (result.rows.length === 0) {
                return null;
            }

            return {
                name: result.rows[0].name,
                host: result.rows[0].host,
                database: result.rows[0].database,
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
     */
    static async generateToken(user: any): Promise<string> {
        const payload: JWTPayload = {
            sub: user.id,
            user_id: user.user_id || null, // User ID for database records (null for root/system)
            tenant: user.tenant,
            database: user.database,
            access: user.access || 'root', // Access level for API operations
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + this.tokenExpiry,
        };

        return await sign(payload, this.getJwtSecret());
    }

    /**
     * Verify and decode JWT token
     */
    static async verifyToken(token: string): Promise<JWTPayload> {
        return (await verify(token, this.getJwtSecret())) as JWTPayload;
    }

    /**
     * Login with tenant and username authentication
     */
    static async login(tenant: string, username: string): Promise<LoginResult | null> {
        if (!tenant || !username) {
            return null; // Both tenant and username required
        }

        // Look up tenant record to get database name
        const authDb = this.getAuthPool();
        const tenantResult = await authDb.query('SELECT name, database FROM tenant WHERE name = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL', [tenant]);

        if (!tenantResult.rows || tenantResult.rows.length === 0) {
            return null; // Tenant not found or inactive
        }

        const { name, database } = tenantResult.rows[0];

        // Look up user in the tenant's database (using new auth field)
        const tenantDb = DatabaseConnection.getTenantPool(database);
        const userResult = await tenantDb.query(
            'SELECT id, name, auth, access, access_read, access_edit, access_full, access_deny FROM users WHERE auth = $1 AND trashed_at IS NULL AND deleted_at IS NULL',
            [username]
        );

        if (!userResult.rows || userResult.rows.length === 0) {
            return null; // User not found or inactive
        }

        const user = userResult.rows[0];

        // Create user object for JWT
        const authUser = {
            id: user.id,
            user_id: user.id,
            tenant: name,
            database: database,
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
                database: authUser.database,
                access: authUser.access,
            },
        };
    }

    /**
     * Validate JWT token and return payload
     */
    static async validateToken(token: string): Promise<JWTPayload | null> {
        try {
            return await this.verifyToken(token);
        } catch (error) {
            return null; // Invalid token
        }
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
     * Initialize tenant database schema using sql/init-tenant.sql
     */
    private static async initializeTenantSchema(databaseName: string): Promise<void> {
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
     * Create user schema via metabase for API-managed user table
     */
    private static async createUserSchema(databaseName: string): Promise<void> {
        // Create a system context for metabase operations
        const mockContext = {
            env: { JWT_SECRET: process.env['JWT_SECRET']! },
            get: () => undefined,
            set: () => undefined,
        };

        // Set up database context for the tenant
        DatabaseConnection.setDatabaseForRequest(mockContext as any, databaseName);

        const describe = new Describe(mockContext as any);

        try {
            // Note: This method is disabled because user schema is now SQL-managed via init-tenant.sql
            // Test fixture schemas are located in spec/fixtures/schema/ (not src/metadata)
            // const userSchemaYaml = '...';

            // Create user schema via metabase (proper DDL generation + schema registration)
            // await metabase.createOne('schemas', userSchemaYaml);

            logger.info('User schema created via metabase', { databaseName });
        } catch (error) {
            logger.warn('Failed to create user schema via metabase', { databaseName, error });
            throw new Error(`Failed to create user schema: ${error}`);
        }
    }

    /**
     * Create root user in tenant database
     */
    private static async createRootUser(databaseName: string, tenantName: string): Promise<void> {
        const client = this.createTenantClient(databaseName);

        try {
            await client.connect();

            // Create root user using new user table format (no tenant_name column)
            await client.query('INSERT INTO users (name, auth, access) VALUES ($1, $2, $3)', ['Root User', 'root', 'root']);
        } finally {
            await client.end();
        }
    }

    /**
     * Insert tenant record in auth database
     */
    private static async insertTenantRecord(tenantName: string, host: string, databaseName: string): Promise<void> {
        const client = this.createAuthClient();

        try {
            await client.connect();

            await client.query('INSERT INTO tenant (name, host, database) VALUES ($1, $2, $3)', [tenantName, host, databaseName]);
        } finally {
            await client.end();
        }
    }
}
