import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Context } from 'hono';
import * as builtinSchema from '../db/schema.js';

const { Pool } = pg;

/**
 * Database Manager - handles dynamic database connections based on JWT domain
 */
export class DatabaseManager {
    private static connectionPools = new Map<string, pg.Pool>();
    private static drizzleInstances = new Map<string, any>();

    // Get or create database connection for domain
    static async getDatabaseForDomain(domain: string) {
        // Use default database for 'default' domain
        if (domain === 'default' || domain === 'monk_api_hono_dev') {
            const { db } = await import('../db/index.js');
            return db;
        }

        // Create dynamic connection for test domains
        if (this.drizzleInstances.has(domain)) {
            return this.drizzleInstances.get(domain);
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

        // Create Drizzle instance
        const db = drizzle(pool, { schema: builtinSchema });
        
        // Cache for reuse
        this.connectionPools.set(domain, pool);
        this.drizzleInstances.set(domain, db);
        
        console.log(`✅ Connected to database: ${domain}`);
        return db;
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
        const baseUrl = process.env.DATABASE_URL || 'postgresql://ianzepp@localhost:5432/';
        
        // If domain looks like a full database name, use it directly
        if (domain.includes('monk_api') || domain.includes('test_')) {
            return baseUrl.replace(/\/[^\/]*$/, `/${domain}`);
        }
        
        // Otherwise, prefix with standard naming
        return baseUrl.replace(/\/[^\/]*$/, `/monk_api_${domain}`);
    }

    // Cleanup connections (for graceful shutdown)
    static async closeAllConnections() {
        console.log('🛑 Closing all database connections...');
        
        for (const [domain, pool] of this.connectionPools) {
            try {
                await pool.end();
                console.log(`  ✅ Closed connection to: ${domain}`);
            } catch (error) {
                console.error(`  ❌ Failed to close connection to ${domain}:`, error);
            }
        }
        
        this.connectionPools.clear();
        this.drizzleInstances.clear();
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