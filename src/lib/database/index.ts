/**
 * Database Adapter Factory
 *
 * Creates the appropriate database adapter based on tenant configuration.
 * This is the single entry point for creating database adapters.
 *
 * Runtime detection:
 * - Bun: Uses bun:sqlite for SQLite (no native dependencies)
 * - Node: Uses better-sqlite3 for SQLite
 */

export type { DatabaseAdapter, QueryResult, DatabaseType, AdapterConfig } from './adapter.js';
export { PostgresAdapter } from './postgres-adapter.js';
export { SqliteAdapter } from './sqlite-adapter.js';

import type { DatabaseAdapter, DatabaseType, AdapterConfig } from './adapter.js';
import { PostgresAdapter } from './postgres-adapter.js';

// Runtime detection for SQLite adapter selection
const isBun = typeof Bun !== 'undefined';

/**
 * Create a database adapter based on configuration
 *
 * Factory function that selects the appropriate adapter implementation
 * based on the db_type field from tenant configuration (JWT).
 *
 * @param config - Adapter configuration (dbType, db, ns)
 * @returns Database adapter instance (not yet connected)
 *
 * @example
 * // From JWT claims:
 * const adapter = createAdapter({
 *   dbType: jwt.db_type,  // 'postgresql' or 'sqlite'
 *   db: jwt.db,           // Database name or directory
 *   ns: jwt.ns            // Schema name or filename
 * });
 * await adapter.connect();
 */
// Lazy-loaded SQLite adapter (runtime-specific)
let SqliteAdapterClass: new (db: string, ns: string) => DatabaseAdapter;

async function getSqliteAdapter(): Promise<new (db: string, ns: string) => DatabaseAdapter> {
    if (SqliteAdapterClass) {
        return SqliteAdapterClass;
    }

    if (isBun) {
        const { BunSqliteAdapter } = await import('./bun-sqlite-adapter.js');
        SqliteAdapterClass = BunSqliteAdapter;
    } else {
        const { SqliteAdapter } = await import('./sqlite-adapter.js');
        SqliteAdapterClass = SqliteAdapter;
    }

    return SqliteAdapterClass;
}

export function createAdapter(config: AdapterConfig): DatabaseAdapter {
    const { dbType, db, ns } = config;

    switch (dbType) {
        case 'sqlite':
            // Use synchronously cached adapter class, or fall back to Node adapter
            // Note: getSqliteAdapter() should be called at startup to pre-load
            if (!SqliteAdapterClass) {
                // Synchronous fallback - import Node adapter directly
                // This works because better-sqlite3 is already a dependency
                const { SqliteAdapter } = require('./sqlite-adapter.js');
                SqliteAdapterClass = SqliteAdapter;
            }
            return new SqliteAdapterClass(db, ns);

        case 'postgresql':
        default:
            return new PostgresAdapter(db, ns);
    }
}

/**
 * Pre-load the SQLite adapter for the current runtime
 * Call this at startup to ensure the correct adapter is loaded
 */
export async function preloadSqliteAdapter(): Promise<void> {
    await getSqliteAdapter();
    console.info('SQLite adapter loaded', { runtime: isBun ? 'bun' : 'node' });
}

/**
 * Create adapter from individual parameters (convenience function)
 *
 * @param dbType - Database type ('postgresql' or 'sqlite')
 * @param db - Database name (PostgreSQL) or directory (SQLite)
 * @param ns - Schema name (PostgreSQL) or filename (SQLite)
 * @returns Database adapter instance (not yet connected)
 */
export function createAdapterFrom(
    dbType: DatabaseType,
    db: string,
    ns: string
): DatabaseAdapter {
    return createAdapter({ dbType, db, ns });
}

/**
 * Check if a database type is supported
 *
 * @param dbType - Database type to check
 * @returns true if supported
 */
export function isSupportedDatabaseType(dbType: string): dbType is DatabaseType {
    return dbType === 'postgresql' || dbType === 'sqlite';
}

/**
 * Get the default database type
 *
 * Used when db_type is not specified during tenant registration.
 */
export function getDefaultDatabaseType(): DatabaseType {
    return 'postgresql';
}
