import { DatabaseConnection } from './database-connection.js';
import { DatabaseNaming } from './database-naming.js';

/**
 * Namespace (Schema) Management Service
 *
 * Manages PostgreSQL schemas (namespaces) for tenant isolation within shared databases.
 *
 * Architecture: Hybrid Database + Schema Model
 * - Shared databases (db_main, db_test) contain multiple tenant namespaces
 * - Each namespace provides complete isolation via PostgreSQL schemas
 * - Enables connection pool sharing while maintaining security isolation
 *
 * Security:
 * - All namespace names are validated to prevent SQL injection
 * - Uses parameterized queries where possible
 * - Quoted identifiers for schema names
 */
export class NamespaceManager {
    /**
     * Create new namespace (schema) in target database
     *
     * @param dbName - Database name (db_main, db_test, etc.)
     * @param nsName - Namespace name (ns_tenant_*, ns_test_*, etc.)
     * @throws Error if namespace name is invalid or creation fails
     */
    static async createNamespace(dbName: string, nsName: string): Promise<void> {
        this.validateNamespaceName(nsName);

        const pool = DatabaseConnection.getPool(dbName);
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${nsName}"`);

        console.info('Namespace created', { dbName, nsName });
    }

    /**
     * Drop namespace (schema) and all objects within it
     *
     * WARNING: This is a destructive operation that cannot be undone.
     * All tables, functions, and data in the namespace will be permanently deleted.
     *
     * @param dbName - Database name (db_main, db_test, etc.)
     * @param nsName - Namespace name to drop
     * @throws Error if namespace name is invalid or drop fails
     */
    static async dropNamespace(dbName: string, nsName: string): Promise<void> {
        this.validateNamespaceName(nsName);

        const pool = DatabaseConnection.getPool(dbName);
        await pool.query(`DROP SCHEMA IF EXISTS "${nsName}" CASCADE`);

        console.info('Namespace dropped', { dbName, nsName });
    }

    /**
     * Check if namespace (schema) exists in database
     *
     * @param dbName - Database name (db_main, db_test, etc.)
     * @param nsName - Namespace name to check
     * @returns true if namespace exists, false otherwise
     */
    static async namespaceExists(dbName: string, nsName: string): Promise<boolean> {
        const pool = DatabaseConnection.getPool(dbName);
        const result = await pool.query(
            `SELECT EXISTS(
                SELECT 1 FROM information_schema.schemata
                WHERE schema_name = $1
            )`,
            [nsName],
        );
        return result.rows[0].exists;
    }

    /**
     * Get all namespaces (schemas) in database
     *
     * Excludes system schemas (pg_*, information_schema).
     *
     * @param dbName - Database name (db_main, db_test, etc.)
     * @returns Array of namespace names
     */
    static async listNamespaces(dbName: string): Promise<string[]> {
        const pool = DatabaseConnection.getPool(dbName);
        const result = await pool.query(`
            SELECT schema_name
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public')
                AND schema_name NOT LIKE 'pg_%'
            ORDER BY schema_name
        `);
        return result.rows.map((row) => row.schema_name);
    }

    /**
     * Validate namespace (schema) name (prevent SQL injection)
     *
     * Uses DatabaseNaming.validateNamespaceName for validation.
     *
     * @param nsName - Namespace name to validate
     * @throws Error if validation fails
     * @private
     */
    private static validateNamespaceName(nsName: string): void {
        DatabaseNaming.validateNamespaceName(nsName);
    }
}
