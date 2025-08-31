import pg from 'pg';
import { logger } from '@src/lib/logger.js';

const { Pool, Client } = pg;

/**
 * Centralized Database Connection Manager
 *
 * CRITICAL: This is the ONLY file in the entire codebase that should:
 * 1. Call new pg.Pool() or new pg.Client()
 * 2. Read process.env.DATABASE_URL
 * 3. Handle database connection configuration
 *
 * The DATABASE_URL should point to the "monk_main" database.
 *
 * All other files must use these methods for database connections.
 */
export class DatabaseConnection {
    // Pool to the "main_main" database
    private static mainPool: pg.Pool | null = null;

    // Pool to the "tenant_*" databases
    private static tenantPool = new Map<string, pg.Pool>();

    /**
     * Get DATABASE_URL from process.env with strict validation
     * NO fallbacks, NO defaults - fail fast if not configured
     */
    private static getDatabaseURL(): string {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl) {
            throw new Error('DATABASE_URL not configured.');
        }

        if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
            throw new Error(`Invalid DATABASE_URL format: ${databaseUrl}. ` + 'Must start with postgresql:// or postgres://');
        }

        return databaseUrl;
    }

    /**
     * Get the base database pool (for master/auth database)
     * Creates exactly ONE pool for the entire application
     */
    static getMainPool(): pg.Pool {
        if (!this.mainPool) {
            const databaseUrl = this.getDatabaseURL();

            this.mainPool = new Pool(this.getPoolConfig(databaseUrl, 10));

            logger.info('Main database pool created', {
                database: this.extractDatabaseName(databaseUrl),
            });
        }

        return this.mainPool;
    }

    /**
     * Get a tenant-specific database pool
     * Creates one pool per tenant database for efficiency
     */
    static getTenantPool(tenantName: string): pg.Pool {
        if (!this.tenantPool.has(tenantName)) {
            const baseDatabaseUrl = this.getDatabaseURL();
            const url = new URL(baseDatabaseUrl);
            url.pathname = `/${tenantName}`;
            const tenantDatabaseUrl = url.toString();

            const pool = new Pool(this.getPoolConfig(tenantDatabaseUrl, 5));

            this.tenantPool.set(tenantName, pool);

            logger.info('Tenant database pool created', {
                tenant: tenantName,
                database: this.extractDatabaseName(tenantDatabaseUrl),
            });
        }

        return this.tenantPool.get(tenantName)!;
    }

    /**
     * Create a one-time Client connection (for operations that need direct control)
     * Use sparingly - pools are preferred for performance
     */
    static createClient(databaseName?: string): pg.Client {
        const baseDatabaseUrl = this.getDatabaseURL();
        let connectionString: string;

        if (databaseName) {
            const url = new URL(baseDatabaseUrl);
            url.pathname = `/${databaseName}`;
            connectionString = url.toString();
        } else {
            connectionString = baseDatabaseUrl;
        }

        return new Client({
            connectionString,
            connectionTimeoutMillis: 5000,
            ssl: this.getSslConfig(baseDatabaseUrl),
        });
    }

    /**
     * Get SSL configuration based on database URL
     */
    private static getSslConfig(databaseUrl: string) {
        return databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    }

    /**
     * Get standard pool configuration
     */
    private static getPoolConfig(connectionString: string, maxConnections: number) {
        return {
            connectionString,
            max: maxConnections,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ssl: this.getSslConfig(connectionString),
        };
    }

    /**
     * Extract database name from connection URL for logging
     */
    private static extractDatabaseName(databaseUrl: string): string {
        try {
            const url = new URL(databaseUrl);
            return url.pathname.substring(1) || 'postgres';
        } catch {
            return 'unknown';
        }
    }

    /**
     * Close all connections (for graceful shutdown)
     */
    static async closeAllConnections(): Promise<void> {
        const closePromises: Promise<void>[] = [];

        if (this.mainPool) {
            closePromises.push(this.mainPool.end());
            this.mainPool = null;
        }

        for (const [tenantName, pool] of this.tenantPool.entries()) {
            closePromises.push(pool.end());
        }
        this.tenantPool.clear();

        await Promise.all(closePromises);
        logger.info('All database connections closed');
    }

    /**
     * Set database connection for Hono request context
     */
    static setDatabaseForRequest(c: any, tenantName: string): void {
        const db = this.getTenantPool(tenantName);
        c.set('database', db);
        c.set('databaseDomain', tenantName);
    }

    /**
     * Health check - verify base database connectivity
     */
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
}
