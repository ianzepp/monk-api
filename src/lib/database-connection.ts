import pg from 'pg';
import { logger } from '@src/lib/logger.js';

const { Pool, Client } = pg;

export const MONK_DB_MAIN_NAME = 'monk';
export const MONK_DB_TENANT_PREFIX = 'tenant_';
export const MONK_DB_TEST_PREFIX = 'test_';
export const MONK_DB_TEST_TEMPLATE_PREFIX = 'test_template_';

// Export lazy-loaded centralized pool - ONLY source of database connections
export const db = new Proxy({} as pg.Pool, {
    get(target, prop, receiver) {
        const pool = DatabaseConnection.getMainPool();
        return Reflect.get(pool, prop, receiver);
    },
});

// TODO these should be just DatabaseConnection static methods
export async function checkDatabaseConnection(): Promise<boolean> {
    const result = await DatabaseConnection.healthCheck();

    if (!result.success) {
        logger.fail('Database connection failed:', result.error);
        throw result.error;
    } else {
        logger.info('Database connected:', process.env.DATABASE_URL);
    }

    return result.success;
}

// TODO these should be just DatabaseConnection static methods
export async function closeDatabaseConnection(): Promise<void> {
    await DatabaseConnection.closeConnections();
}

/**
 * Centralized Database Connection Manager
 *
 * CRITICAL: This is the ONLY file in the entire codebase that should:
 * 1. Call new pg.Pool() or new pg.Client()
 * 2. Read process.env.DATABASE_URL
 * 3. Handle database connection configuration
 *
 * The DATABASE_URL should point to the "monk" database:
 * 1. For example: postgresql://<user>:<pass>@<host>:<port>/monk
 * 2. This class will use the original DATABASE_URL for getMainPool()
 * 3. This class will replace "monk" with "tenant_#" for getTenantPool(database)
 *
 * All other files must use these methods for database connections.
 */
export class DatabaseConnection {
    // General pooling map
    private static pools = new Map<string, pg.Pool>();

    //
    // Public methods
    //

    static getMainPool() {
        return this.getPool(MONK_DB_MAIN_NAME, 10);
    }

    static getTenantPool(databaseName: string) {
        // Tenant database names always start with a prefix, EXCEPT for the "system" database
        if (!databaseName.startsWith(MONK_DB_TENANT_PREFIX) && databaseName !== 'system') {
            throw new Error(`Invalid tenant database name "${databaseName}". Must start with "${MONK_DB_TENANT_PREFIX}"`);
        }

        return this.getPool(databaseName);
    }

    static getPostgresClient() {
        return this.getClient('postgres');
    }

    static getPool(databaseName: string, max: number = 5) {
        if (typeof databaseName !== 'string') {
            throw new Error(`Database name must be a string type`);
        }

        if (!databaseName) {
            throw new Error(`Database name cannot be empty`);
        }

        if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
            throw new Error(`Database name "${databaseName}" contains invalid characters`);
        }

        if (!this.pools.has(databaseName)) {
            const connectionString = this.toConnectionString(databaseName);
            const config = this.toConfig(connectionString, max);

            // Create the pool
            const pool = new pg.Pool(config);

            // Save to the map
            this.pools.set(databaseName, pool);

            logger.info('Database pool created', {
                database: databaseName,
            });
        }

        // Due to the IF above, this can be cast
        return this.pools.get(databaseName) as pg.Pool;
    }

    static getClient(databaseName: string) {
        const connectionString = this.toConnectionString(databaseName);
        const configSsl = this.toConfigSsl(connectionString);

        return new Client({
            connectionString,
            connectionTimeoutMillis: 5000,
            ssl: configSsl,
        });
    }

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

    static async closeConnections(): Promise<void> {
        const closePromises: Promise<void>[] = [];

        for (const [databaseName, pool] of this.pools.entries()) {
            closePromises.push(pool.end());
        }
        this.pools.clear();

        await Promise.all(closePromises);
        logger.info('All database connections closed');
    }

    //
    // Internal helpers
    //
    private static toConnectionString(databaseName: string) {
        const databaseUrl = process.env.DATABASE_URL || undefined;

        if (!databaseUrl) {
            throw new Error('DATABASE_URL not configured.');
        }

        if (!databaseUrl.startsWith('postgresql://')) {
            throw new Error(`Invalid DATABASE_URL format: ${databaseUrl}. Must start with postgresql://`);
        }

        const url = new URL(databaseUrl);
        url.pathname = `/${databaseName}`;
        return url.toString();
    }

    private static toConfig(connectionString: string, max: number) {
        return {
            connectionString,
            max: max,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ssl: this.toConfigSsl(connectionString),
        };
    }

    private static toConfigSsl(connectionString: string) {
        if (connectionString.includes('sslmode=require')) {
            return { rejectUnauthorized: false };
        }

        return false;
    }

    /**
     * Set database connection for Hono request context
     */
    static setDatabaseForRequest(c: any, tenantName: string): void {
        const db = this.getPool(tenantName);
        c.set('database', db);
        c.set('databaseDomain', tenantName);
    }
}
