/**
 * @monk/formatter-sqlite - SQLite Formatter
 *
 * SQLite database format for structured data import/export.
 *
 * Supported operations:
 * - encode: Convert array of objects to SQLite database
 * - decode: Parse SQLite database to array of objects
 *
 * Use cases:
 * - Bulk data export with type preservation
 * - Data interchange with SQLite-compatible tools
 * - Offline data snapshots
 */

import { Database } from 'bun:sqlite';
import { type Formatter } from '@monk/common';

/**
 * Infer SQLite column type from a JavaScript value
 */
function inferSqliteType(value: any): string {
    if (value === null || value === undefined) {
        return 'TEXT'; // Default for null, will be determined by other rows
    }
    if (typeof value === 'boolean') {
        return 'INTEGER'; // SQLite uses 0/1 for booleans
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? 'INTEGER' : 'REAL';
    }
    if (typeof value === 'string') {
        return 'TEXT';
    }
    if (typeof value === 'object') {
        return 'TEXT'; // JSON stringify objects/arrays
    }
    return 'TEXT';
}

/**
 * Convert JavaScript value to SQLite-compatible value
 */
function toSqliteValue(value: any): any {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return value;
}

/**
 * Convert SQLite value back to JavaScript value
 */
function fromSqliteValue(value: any, inferType: boolean = true): any {
    if (value === null) {
        return null;
    }
    // Try to parse JSON strings (for objects/arrays)
    if (typeof value === 'string' && inferType) {
        const trimmed = value.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }
    }
    return value;
}

/**
 * Validate that data is suitable for SQLite export
 */
function validateData(data: any): void {
    if (!Array.isArray(data)) {
        throw new Error('SQLite format requires an array of objects. Received: ' + typeof data);
    }

    if (data.length === 0) {
        return;
    }

    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null || Array.isArray(firstItem)) {
        throw new Error('SQLite format requires array of plain objects. First element is: ' + typeof firstItem);
    }
}

/**
 * Infer schema from array of objects
 * Scans multiple rows to get best type inference (handles null in first row)
 */
function inferSchema(data: any[]): Map<string, string> {
    const schema = new Map<string, string>();

    if (data.length === 0) {
        return schema;
    }

    // Get all keys from first object
    const keys = Object.keys(data[0]);

    // Initialize all as TEXT (default)
    for (const key of keys) {
        schema.set(key, 'TEXT');
    }

    // Scan rows to infer types (check first non-null value for each column)
    for (const key of keys) {
        for (const row of data) {
            const value = row[key];
            if (value !== null && value !== undefined) {
                schema.set(key, inferSqliteType(value));
                break;
            }
        }
    }

    return schema;
}

/**
 * Escape column name for SQLite (handle reserved words and special chars)
 */
function escapeColumnName(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export const SqliteFormatter: Formatter = {
    encode(data: any): Uint8Array {
        validateData(data);

        if (data.length === 0) {
            // Return empty database with just the data table (no columns)
            const db = new Database(':memory:');
            db.exec('CREATE TABLE data (id INTEGER PRIMARY KEY)');
            const buffer = db.serialize();
            db.close();
            return buffer;
        }

        // Infer schema from data
        const schema = inferSchema(data);
        const columns = Array.from(schema.entries());

        // Create in-memory database
        const db = new Database(':memory:');

        try {
            // Build CREATE TABLE statement
            const columnDefs = columns.map(([name, type]) =>
                `${escapeColumnName(name)} ${type}`
            ).join(', ');

            db.exec(`CREATE TABLE data (${columnDefs})`);

            // Build INSERT statement
            const columnNames = columns.map(([name]) => escapeColumnName(name)).join(', ');
            const placeholders = columns.map(() => '?').join(', ');
            const insertStmt = db.prepare(`INSERT INTO data (${columnNames}) VALUES (${placeholders})`);

            // Insert all rows
            const insertMany = db.transaction((rows: any[]) => {
                for (const row of rows) {
                    const values = columns.map(([name]) => toSqliteValue(row[name]));
                    insertStmt.run(...values);
                }
            });

            insertMany(data);

            // Serialize to buffer
            return db.serialize();

        } finally {
            db.close();
        }
    },

    decode(data: Uint8Array): any[] {
        // Open SQLite database from buffer
        // Type assertion needed because Bun types don't properly expose Uint8Array overload
        const db = new Database(data as unknown as string);

        try {
            // Check if data table exists
            const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='data'").all();
            if (tables.length === 0) {
                throw new Error('SQLite database does not contain a "data" table');
            }

            // Read all rows from data table
            const rows = db.query('SELECT * FROM data').all() as Record<string, any>[];

            // Convert SQLite values back to JavaScript values
            return rows.map(row => {
                const converted: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                    converted[key] = fromSqliteValue(value);
                }
                return converted;
            });

        } finally {
            db.close();
        }
    },

    contentType: 'application/x-sqlite3'
};
