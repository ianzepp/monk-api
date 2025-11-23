import pg from 'pg';
import * as model from '@src/db/model.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';

// Export lazy-loaded centralized pool - ONLY source of database connections
export const db = new Proxy({} as pg.Pool, {
    get(target, prop, receiver) {
        const pool = DatabaseConnection.getMainPool();
        return Reflect.get(pool, prop, receiver);
    },
});

// Export model interfaces and constants
export const builtins = model;

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
    await DatabaseConnection.closeConnections();
}

// Pool management for tests
export async function closeTestDatabasePools(): Promise<void> {
    // Close both test_ and tenant_ prefixed pools (tenant_ pools created by test registration)
    await DatabaseConnection.closePoolsByPrefix('test_');
    await DatabaseConnection.closePoolsByPrefix('tenant_');
}

export async function closeDatabasePool(databaseName: string): Promise<void> {
    await DatabaseConnection.closePool(databaseName);
}

export function getDatabasePoolStats() {
    return DatabaseConnection.getPoolStats();
}
