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
 * All other files must use these methods for database connections.
 */
export class DatabaseConnection {
    private static databasePool = new Map<string, pg.Pool>();

    static getMasterPool(): pg.Pool {
        return this.getPool('monk', 10);
    }

    static getPool(databaseName: string, maxConnections: number = 5): pg.Pool {
        if (!this.databasePool.has(databaseName)) {
            const databaseUrl = this.getDatabaseURL();

            // Keep the user/pass & host/port, replace the rest
            const url = new URL(databaseUrl);
            url.pathname = '/' + databaseName;

            // Pool config
            const connectionString = url.toString();
            const config = {
                connectionString,
                max: maxConnections,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
                ssl: this.getSslConfig(connectionString)
            };

            // Create the pool
            const databasePool = new Pool(config);

            // Cache the pool
            this.databasePool.set(databaseName, databasePool);
            
            // Done
            logger.info('Database pool created', { 
                tenant: databaseName,
                database: databaseName
            });
        }

        return this.databasePool.get(databaseName)!;
    }

    static getClient(databaseName: string): pg.Client {
        const baseDatabaseUrl = this.getDatabaseURL();
        let connectionString: string;
        
        if (databaseName) {
            const url = new URL(baseDatabaseUrl);
            url.pathname = `/${databaseName}`;
            connectionString = url.toString();
        } 
        
        else {
            connectionString = baseDatabaseUrl;
        }

        return new Client({
            connectionString,
            connectionTimeoutMillis: 5000,
            ssl: this.getSslConfig(baseDatabaseUrl)
        });
    }

    // Database management methods
    static async createDB(databaseName: string) {
        const db = this.getClient('postgres');

        // Note: Database names cannot be parameterized, but we've sanitized the name
        try {
            await db.connect();
            await db.query(`CREATE DATABASE "${databaseName}"`);
        }
        
        finally {
            await db.end();
        }
    }

    static async deleteDB(databaseName: string) {
        const db = this.getClient('postgres');

        // Note: Database names cannot be parameterized, but we've sanitized the name
        try {
            await db.connect();
            await db.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
        }
        
        finally {
            await db.end();
        }
    }

    // Private methods

    private static getDatabaseURL(): string {
        const databaseUrl = process.env.DATABASE_URL;
        
        if (!databaseUrl) {
            throw new Error('DATABASE_URL not configured');
        }

        if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
            throw new Error(
                `Invalid DATABASE_URL format: ${databaseUrl}. ` +
                'Must start with postgresql:// or postgres://'
            );
        }

        return databaseUrl;
    }

    /**
     * Get SSL configuration based on database URL
     */
    private static getSslConfig(databaseUrl: string) {
        return databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false;
    }

    /**
     * Close all connections (for graceful shutdown)
     */
    static async closeAllConnections(): Promise<void> {
        const closePromises: Promise<void>[] = [];

        for (const [tenantName, pool] of this.databasePool.entries()) {
            closePromises.push(pool.end());
        }

        this.databasePool.clear();

        await Promise.all(closePromises);
        logger.info('All database connections closed');
    }

    /**
     * Health check - verify base database connectivity
     */
    static async healthCheck(): Promise<{ success: boolean; error?: string }> {
        try {
            const db = this.getMasterPool();
            const client = await db.connect();
            await client.query('SELECT 1');
            client.release();
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown database error' 
            };
        }
    }
}

