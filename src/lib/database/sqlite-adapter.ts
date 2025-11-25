/**
 * SQLite Database Adapter
 *
 * Uses better-sqlite3 for synchronous, high-performance SQLite access.
 *
 * Path convention: /data/{db}/{ns}.db
 * - db: Directory name
 * - ns: Filename (without .db extension)
 */

import { join } from 'path';
import type Database from 'better-sqlite3';
import type { DatabaseAdapter, QueryResult, DatabaseType } from './adapter.js';

// Default data directory for SQLite databases
const SQLITE_DATA_DIR = process.env.SQLITE_DATA_DIR || '/data';

/**
 * SQLite implementation of DatabaseAdapter
 *
 * Note: better-sqlite3 is synchronous, but we use async interface
 * for consistency with PostgreSQL adapter and future compatibility.
 *
 * Differences from PostgreSQL:
 * - Parameter placeholders: ? instead of $1, $2 (converted internally)
 * - No native RETURNING: Use INSERT + last_insert_rowid()
 * - Arrays: Stored as JSON text, queried with json_each()
 * - ACLs: Disabled for SQLite (root mode)
 */
export class SqliteAdapter implements DatabaseAdapter {
    private readonly dbPath: string;
    private db: Database.Database | null = null;
    private inTransaction: boolean = false;

    /**
     * Create a SQLite adapter
     *
     * @param db - Directory name under SQLITE_DATA_DIR
     * @param ns - Filename (without .db extension)
     */
    constructor(db: string, ns: string) {
        this.dbPath = join(SQLITE_DATA_DIR, db, `${ns}.db`);
    }

    /**
     * Open SQLite database file
     */
    async connect(): Promise<void> {
        if (this.db) {
            return; // Already connected
        }

        // Dynamic import to avoid loading better-sqlite3 when not needed
        // This allows the codebase to work even if only PostgreSQL is used
        let DatabaseConstructor: typeof Database;
        try {
            const module = await import('better-sqlite3');
            DatabaseConstructor = module.default;
        } catch (error) {
            throw new Error(
                'SQLite support requires better-sqlite3. Install with: npm install better-sqlite3'
            );
        }

        // Open database file (creates if doesn't exist)
        this.db = new DatabaseConstructor(this.dbPath);

        // Enable WAL mode for better concurrent read performance
        this.db.pragma('journal_mode = WAL');

        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');

        // Register custom regexp function for $regex operator support
        this.db.function('regexp', (pattern: string, value: string) => {
            try {
                return new RegExp(pattern).test(value) ? 1 : 0;
            } catch {
                return 0; // Invalid regex returns no match
            }
        });
    }

    /**
     * Close SQLite database file
     */
    async disconnect(): Promise<void> {
        if (!this.db) {
            return; // Not connected
        }

        // Rollback any uncommitted transaction
        if (this.inTransaction) {
            try {
                this.db.exec('ROLLBACK');
            } catch {
                // Ignore rollback errors during disconnect
            }
            this.inTransaction = false;
        }

        this.db.close();
        this.db = null;
    }

    /**
     * Check if adapter has an open database
     */
    isConnected(): boolean {
        return this.db !== null;
    }

    /**
     * Execute SQL query
     *
     * Converts PostgreSQL-style $1, $2 placeholders to SQLite ? placeholders.
     * Returns result in same format as PostgreSQL for compatibility.
     */
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        if (!this.db) {
            throw new Error('SqliteAdapter: Not connected. Call connect() first.');
        }

        // Convert PostgreSQL $1, $2 placeholders to SQLite ? placeholders
        const convertedSql = this.convertPlaceholders(sql);

        // Determine if this is a SELECT or data modification query
        const isSelect = /^\s*SELECT/i.test(convertedSql);

        if (isSelect) {
            // SELECT queries return rows
            const stmt = this.db.prepare(convertedSql);
            const rows = params && params.length > 0
                ? stmt.all(...params)
                : stmt.all();

            return {
                rows: rows as T[],
                rowCount: rows.length,
            };
        } else {
            // INSERT/UPDATE/DELETE queries return changes info
            const stmt = this.db.prepare(convertedSql);
            const info = params && params.length > 0
                ? stmt.run(...params)
                : stmt.run();

            return {
                rows: [] as T[],
                rowCount: info.changes,
            };
        }
    }

    /**
     * Begin a database transaction
     */
    async beginTransaction(): Promise<void> {
        if (!this.db) {
            throw new Error('SqliteAdapter: Not connected. Call connect() first.');
        }

        if (this.inTransaction) {
            throw new Error('SqliteAdapter: Transaction already in progress');
        }

        this.db.exec('BEGIN');
        this.inTransaction = true;
    }

    /**
     * Commit the current transaction
     */
    async commit(): Promise<void> {
        if (!this.db) {
            throw new Error('SqliteAdapter: Not connected. Call connect() first.');
        }

        if (!this.inTransaction) {
            throw new Error('SqliteAdapter: No transaction in progress');
        }

        this.db.exec('COMMIT');
        this.inTransaction = false;
    }

    /**
     * Rollback the current transaction
     */
    async rollback(): Promise<void> {
        if (!this.db) {
            throw new Error('SqliteAdapter: Not connected. Call connect() first.');
        }

        if (!this.inTransaction) {
            // Silently ignore rollback when no transaction
            return;
        }

        this.db.exec('ROLLBACK');
        this.inTransaction = false;
    }

    /**
     * Get database type
     */
    getType(): DatabaseType {
        return 'sqlite';
    }

    /**
     * Get underlying better-sqlite3.Database for advanced operations
     */
    getRawConnection(): Database.Database | null {
        return this.db;
    }

    /**
     * Check if currently in a transaction
     */
    isInTransaction(): boolean {
        return this.inTransaction;
    }

    /**
     * Get the database file path
     */
    getPath(): string {
        return this.dbPath;
    }

    /**
     * Convert PostgreSQL-style $1, $2, $3 placeholders to SQLite ? placeholders
     *
     * PostgreSQL: SELECT * FROM users WHERE id = $1 AND name = $2
     * SQLite:     SELECT * FROM users WHERE id = ? AND name = ?
     *
     * Note: This assumes parameters are passed in the correct order.
     */
    private convertPlaceholders(sql: string): string {
        // Replace $1, $2, etc. with ?
        // Handle cases like $10, $11 correctly by sorting descending
        const placeholders = sql.match(/\$\d+/g);
        if (!placeholders) {
            return sql;
        }

        // Sort by number descending to replace $10 before $1
        const sortedPlaceholders = [...new Set(placeholders)]
            .sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));

        let result = sql;
        for (const placeholder of sortedPlaceholders) {
            result = result.split(placeholder).join('?');
        }

        return result;
    }
}
