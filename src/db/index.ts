import pg from 'pg';
import * as schema from '@src/db/schema.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

// Export lazy-loaded centralized pool - ONLY source of database connections
export const db = new Proxy({} as pg.Pool, {
  get(target, prop, receiver) {
    const pool = DatabaseConnection.getBasePool();
    return Reflect.get(pool, prop, receiver);
  }
});

// Export schema interfaces and constants
export const builtins = schema;

// Types for database operations
export type DbContext = pg.Pool;
export type TxContext = pg.PoolClient;

// Health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await DatabaseConnection.healthCheck();
  if (!result.success) {
    console.error('Database connection failed:', result.error);
  }
  return result.success;
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await DatabaseConnection.closeAllConnections();
}