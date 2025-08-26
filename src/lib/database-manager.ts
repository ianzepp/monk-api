import pg from 'pg';
import type { Context } from 'hono';
import { logger } from '@src/lib/logger.js';
import { MonkEnv } from '@src/lib/monk-env.js';

const { Pool } = pg;

/**
 * Database Manager - handles dynamic database connections based on JWT domain
 */
export class DatabaseManager {
    private static connectionPools = new Map<string, pg.Pool>();

    // Get or create database connection for domain
    static async getDatabaseForDomain(domain: string): Promise<pg.Pool> {
        // Use default database for 'default' domain
        if (domain === 'default' || domain === 'monk_api_hono_dev') {
            const { db } = await import('../db/index.js');
            return db;
        }

        // Create dynamic connection for test domains
        if (this.connectionPools.has(domain)) {
            return this.connectionPools.get(domain)!;
        }

        // Create new connection pool for this domain/database
        const connectionString = this.buildConnectionString(domain);
        
        const pool = new Pool({
            connectionString,
            max: 5,  // Smaller pool for test databases
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test connection
        try {
            const client = await pool.connect();
            await client.query('SELECT 1');
            client.release();
        } catch (error) {
            console.error(`Failed to connect to database '${domain}':`, error);
            throw new Error(`Database '${domain}' not accessible`);
        }

        // Cache for reuse
        this.connectionPools.set(domain, pool);
        
        logger.info('Database connection established', { database: domain });
        return pool;
    }

    // Set database context for current request
    static async setDatabaseForRequest(c: Context, domain: string) {
        const db = await this.getDatabaseForDomain(domain);
        
        // Override the database instance for this request context
        c.set('database', db);
        c.set('databaseDomain', domain);
    }

    // Build connection string for domain/database
    private static buildConnectionString(domain: string): string {
        // Ensure monk configuration is loaded
        MonkEnv.load();
        
        const baseUrl = process.env.DATABASE_URL;
        if (!baseUrl) {
            throw new Error('DATABASE_URL not configured. Ensure ~/.config/monk/env.json contains DATABASE_URL.');
        }
        
        // Use domain name directly as database name
        return baseUrl.replace(/\/[^\/]*$/, `/${domain}`);
    }

    // Cleanup connections (for graceful shutdown)
    static async closeAllConnections() {
        logger.info('Closing all database connections');
        
        for (const [domain, pool] of this.connectionPools) {
            try {
                await pool.end();
                logger.info('Database connection closed', { database: domain });
            } catch (error) {
                console.error(`  ❌ Failed to close connection to ${domain}:`, error);
            }
        }
        
        this.connectionPools.clear();
    }

    // Get current database from request context
    static getDatabaseFromContext(c: Context) {
        const db = c.get('database');
        if (!db) {
            throw new Error('Database context not set - ensure JWT middleware is applied');
        }
        return db;
    }

    // List active connections (for debugging)
    static getActiveConnections(): string[] {
        return Array.from(this.connectionPools.keys());
    }
}