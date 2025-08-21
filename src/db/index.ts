import pg from 'pg';
import * as schema from './schema.js';

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

// Export the pool directly for raw SQL queries
export const db = pool;

// Export schema interfaces and constants
export const builtins = schema;

// Types for database operations
export type DbContext = pg.Pool;
export type TxContext = pg.PoolClient;

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