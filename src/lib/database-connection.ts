import pg from 'pg';

const { Pool, Client } = pg;

export const MONK_DB_TENANT_PREFIX = 'tenant_';
export const MONK_DB_TEST_PREFIX = 'test_';
export const MONK_DB_TEST_TEMPLATE_PREFIX = 'test_template_';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CRITICAL PRODUCTION SCALABILITY CONCERN: PostgreSQL Connection Pool Exhaustion
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * PROBLEM:
 * Each tenant database gets its own connection pool. With default PostgreSQL
 * max_connections=100, you will hit connection limits quickly:
 *
 *   Main database:     10 connections
 *   Per tenant:         5 connections
 *   Per test tenant:    2 connections
 *
 *   Math: 10 + (20 active tenants × 5) = 110 connections → EXCEEDS LIMIT
 *
 * SYMPTOMS:
 * - "sorry, too many clients already" errors
 * - Failed tenant registrations during burst signups
 * - Cascading failures as pools can't be created
 *
 * SOLUTIONS (in order of recommendation):
 *
 * 1. PgBouncer (RECOMMENDED for production):
 *    - Connection pooler sits between app and PostgreSQL
 *    - 1000 app connections → 25 PostgreSQL connections
 *    - Pool mode: 'transaction' (required for multi-database)
 *    - No code changes needed
 *    - Industry standard solution
 *
 * 2. Reduce pool sizes (INTERIM solution):
 *    - Change getTenantPool() from 5 → 2 connections
 *    - Allows ~45 concurrent tenants with default max_connections
 *    - May impact performance under heavy load per tenant
 *
 * 3. Pool eviction (CODE change required):
 *    - Close pools for tenants inactive >5 minutes
 *    - Requires background job and idle tracking
 *    - See database-template.ts for semaphore pattern
 *
 * 4. Increase PostgreSQL max_connections:
 *    - ALTER SYSTEM SET max_connections = 500;
 *    - Trade-off: ~400KB memory per connection
 *    - Still eventually hits limits without pooler
 *
 * CURRENT MITIGATIONS:
 * - Idle timeout: 30 seconds (helps but insufficient)
 * - Tenant creation semaphore: limits concurrent database creation
 *
 * MONITORING RECOMMENDATIONS:
 * - Track active pool count via getPoolStats()
 * - Alert when total connections > 80% of max_connections
 * - Monitor tenant creation queue depth
 *
 * SEE ALSO:
 * - database-template.ts: TenantCreationSemaphore for signup throttling
 * - Docker: Add pgbouncer service to docker-compose.yml
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

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

    /**
     * Get the main database name from DATABASE_URL
     * Extracts database name from connection string for environment isolation:
     * - Production: monk
     * - Development: monk_development
     * - Test: monk_test
     */
    static getMainDatabaseName(): string {
        const databaseUrl = this.getDatabaseURL();
        const url = new URL(databaseUrl);
        const dbName = url.pathname.slice(1); // Remove leading '/'

        if (!dbName) {
            throw new Error('DATABASE_URL must include a database name in the path');
        }

        return dbName;
    }

    /** Get connection pool for the primary monk database */
    static getMainPool(): pg.Pool {
        const mainDbName = this.getMainDatabaseName();
        return this.getPool(mainDbName, 10);
    }

    /** Get tenant-specific database pool */
    static getTenantPool(databaseName: string): pg.Pool {
        this.validateTenantDatabaseName(databaseName);

        // Use smaller pool size for test databases to conserve PostgreSQL connections
        const maxConnections = databaseName.startsWith(MONK_DB_TEST_PREFIX) ? 2 : 5;

        return this.getPool(databaseName, maxConnections);
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
                    .then(() => console.info('Database pool closed', { database: databaseName }))
                    .catch(error => {
                        console.warn('Failed to close database pool', {
                            database: databaseName,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    })
            );
        }

        this.pools.clear();
        await Promise.all(closePromises);
        console.info('All database connections closed');
    }

    /** Close a specific database pool */
    static async closePool(databaseName: string): Promise<void> {
        const pool = this.pools.get(databaseName);
        if (!pool) {
            return;
        }

        try {
            await pool.end();
            this.pools.delete(databaseName);
            console.info('Database pool closed', { database: databaseName });
        } catch (error) {
            console.warn('Failed to close database pool', {
                database: databaseName,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /** Close all pools matching a prefix pattern */
    static async closePoolsByPrefix(prefix: string): Promise<void> {
        const closePromises: Promise<void>[] = [];
        const databasesToClose: string[] = [];

        for (const databaseName of this.pools.keys()) {
            if (databaseName.startsWith(prefix)) {
                databasesToClose.push(databaseName);
            }
        }

        for (const databaseName of databasesToClose) {
            closePromises.push(this.closePool(databaseName));
        }

        await Promise.all(closePromises);

        if (databasesToClose.length > 0) {
            console.info('Closed database pools by prefix', {
                prefix,
                count: databasesToClose.length,
            });
        }
    }

    /** Get pool statistics for debugging */
    static getPoolStats(): {
        totalPools: number;
        testPools: number;
        tenantPools: number;
        databases: string[];
    } {
        const databases = Array.from(this.pools.keys());
        const testPools = databases.filter(db => db.startsWith(MONK_DB_TEST_PREFIX)).length;
        const tenantPools = databases.filter(db => db.startsWith(MONK_DB_TENANT_PREFIX)).length;

        return {
            totalPools: databases.length,
            testPools,
            tenantPools,
            databases,
        };
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
            console.info('Database pool created', { database: databaseName });
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
