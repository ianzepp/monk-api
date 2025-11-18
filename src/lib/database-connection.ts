import pg from 'pg';
import { logger } from '@src/lib/logger.js';

const { Pool, Client } = pg;

export const MONK_DB_MAIN_NAME = 'monk';
export const MONK_DB_TENANT_PREFIX = 'tenant_';
export const MONK_DB_TEST_PREFIX = 'test_';
export const MONK_DB_TEST_TEMPLATE_PREFIX = 'test_template_';

/**
 * Centralized Database Connection Manager
 *
 * CRITICAL: This is the ONLY file in the entire codebase that should:
 * 1. Call new pg.Pool() or new pg.Client()
 * 2. Read process.env.DATABASE_URL
 * 3. Handle database connection configuration
 */
export class DatabaseConnection {
    private static pools = new Map<string, pg.Pool>();

    /** Get connection pool for the primary monk database */
    static getMainPool(): pg.Pool {
        return this.getPool(MONK_DB_MAIN_NAME, 10);
    }

    /** Get tenant-specific database pool */
    static getTenantPool(databaseName: string): pg.Pool {
        this.validateTenantDatabaseName(databaseName);
        return this.getPool(databaseName);
    }

    /** Convenience helper for postgres sudo client */
    static getPostgresClient(): pg.Client {
        return this.getClient('postgres');
    }

    /** Get new client instance for arbitrary database */
    static getClient(databaseName: string): pg.Client {
        const connectionString = this.buildConnectionString(databaseName);

        return new Client({
            connectionString,
            connectionTimeoutMillis: 5000,
            ssl: this.getSslConfig(connectionString),
        });
    }

    /** Create database with validated name */
    static async createDatabase(databaseName: string): Promise<void> {
        this.validateDatabaseName(databaseName);

        const client = this.getPostgresClient();

        try {
            await client.connect();
            await client.query(`CREATE DATABASE "${databaseName}"`);
        } finally {
            await client.end();
        }
    }

    /** Drop database if it exists */
    static async deleteDatabase(databaseName: string): Promise<void> {
        this.validateDatabaseName(databaseName);

        const client = this.getPostgresClient();

        try {
            await client.connect();
            await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        } finally {
            await client.end();
        }
    }

    /** Health check for base monk database */
    static async healthCheck(): Promise<{ success: boolean; error?: string }> {
        try {
            const pool = this.getMainPool();
            const client = await pool.connect();
            await client.query('SELECT 1');
            client.release();
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown database error',
            };
        }
    }

    /** Close all pooled connections - used during shutdown */
    static async closeConnections(): Promise<void> {
        const closePromises: Promise<void>[] = [];

        for (const [databaseName, pool] of this.pools.entries()) {
            closePromises.push(
                pool
                    .end()
                    .then(() => logger.info('Database pool closed', { database: databaseName }))
                    .catch(error => {
                        logger.warn('Failed to close database pool', {
                            database: databaseName,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    })
            );
        }

        this.pools.clear();
        await Promise.all(closePromises);
        logger.info('All database connections closed');
    }

    /** Attach tenant database pool to Hono context */
    static setDatabaseForRequest(c: any, tenantName: string): void {
        const tenantPool = this.getTenantPool(tenantName);
        c.set('database', tenantPool);
        c.set('databaseDomain', tenantName);
    }

    /** Retrieve or create pool for specific database */
    static getPool(databaseName: string, maxConnections: number = 5): pg.Pool {
        this.validateDatabaseName(databaseName);

        if (!this.pools.has(databaseName)) {
            const connectionString = this.buildConnectionString(databaseName);
            const config = this.getPoolConfig(connectionString, maxConnections);
            const pool = new Pool(config);

            this.pools.set(databaseName, pool);
            logger.info('Database pool created', { database: databaseName });
        }

        return this.pools.get(databaseName)!;
    }

    /** Ensure database names are safe */
    private static validateDatabaseName(databaseName: string): void {
        if (typeof databaseName !== 'string') {
            throw new Error('Database name must be a string');
        }

        const trimmed = databaseName.trim();

        if (!trimmed) {
            throw new Error('Database name cannot be empty');
        }

        if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
            throw new Error(`Database name "${databaseName}" contains invalid characters`);
        }
    }

    /** Tenant databases must match expected prefix unless system */
    private static validateTenantDatabaseName(databaseName: string): void {
        if (databaseName === 'system') {
            return;
        }

        // Check for reserved PostgreSQL database names
        const reservedNames = ['postgres', 'template0', 'template1', 'monk'];
        if (reservedNames.includes(databaseName)) {
            throw new Error(`Reserved database name "${databaseName}"`);
        }

        // Check for proper prefix (tenant_, test_, or test_template_)
        if (
            !databaseName.startsWith(MONK_DB_TENANT_PREFIX) &&
            !databaseName.startsWith(MONK_DB_TEST_PREFIX) &&
            !databaseName.startsWith(MONK_DB_TEST_TEMPLATE_PREFIX)
        ) {
            throw new Error(
                `Invalid tenant database name "${databaseName}". Must start with "${MONK_DB_TENANT_PREFIX}"`
            );
        }
    }

    /** Build connection string for requested database */
    private static buildConnectionString(databaseName: string): string {
        const databaseUrl = this.getDatabaseURL();
        const url = new URL(databaseUrl);
        url.pathname = `/${databaseName}`;
        return url.toString();
    }

    /** Resolve base DATABASE_URL and ensure supported protocol */
    static getDatabaseURL(): string {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            throw new Error('DATABASE_URL not configured');
        }

        if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
            throw new Error(
                `Invalid DATABASE_URL format: ${databaseUrl}. Must start with postgresql:// or postgres://`
            );
        }

        return databaseUrl;
    }

    /** Extract connection parameters from DATABASE_URL */
    static getConnectionParams(): { host?: string; port?: string; user?: string } {
        const databaseUrl = this.getDatabaseURL();
        const url = new URL(databaseUrl);
        
        return {
            host: url.hostname || undefined,
            port: url.port || undefined,
            user: url.username || undefined,
        };
    }

    /** Translate connection string into pg.Pool configuration */
    private static getPoolConfig(connectionString: string, maxConnections: number) {
        return {
            connectionString,
            max: maxConnections,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ssl: this.getSslConfig(connectionString),
        };
    }

    /** Determine SSL configuration based on connection string */
    private static getSslConfig(connectionString: string) {
        return connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    }
}
