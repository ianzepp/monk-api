import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as builtinSchema from './schema.js';

const { Pool } = pg;

// Database connection configuration
const connectionString = process.env.DATABASE_URL || 'postgresql://ianzepp@localhost:5432/monk_api_hono_dev';

// Create connection pool
const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Create Drizzle instance
export const db = drizzle(pool, { schema: builtinSchema });

// Export builtin schema tables
export const builtins = builtinSchema;

// Types
export type DbContext = typeof db;
export type TxContext = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}