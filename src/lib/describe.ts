import type { DbContext, TxContext } from '@src/db/index.js';

import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

export interface JsonSchemaProperty {
    type: string;
    format?: string;
    pattern?: string;
    enum?: string[];
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    default?: any;
    description?: string;
    'x-monk-relationship'?: {
        type: 'owned' | 'referenced';
        schema: string;
        name: string;
        column?: string;
        cascadeDelete?: boolean;
        required?: boolean;
    };
}

export interface JsonSchema {
    name: string;
    title: string;
    table?: string;
    description?: string;
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
}

/**
 * System fields that are automatically added to all tables by the PaaS platform.
 * These fields should not be included in user-defined schemas as they are managed by the system.
 */
export const SYSTEM_FIELDS = [
    'id', // UUID primary key
    'access_read', // Read access control list
    'access_edit', // Edit access control list
    'access_full', // Full access control list
    'access_deny', // Deny access control list
    'created_at', // Record creation timestamp
    'updated_at', // Last update timestamp
    'trashed_at', // Soft delete timestamp
    'deleted_at', // Hard delete timestamp
] as const;

export type SystemField = (typeof SYSTEM_FIELDS)[number];

/**
 * Helper function to check if a field name is a system field
 */
export function isSystemField(fieldName: string): boolean {
    return SYSTEM_FIELDS.includes(fieldName as SystemField);
}

/**
 * User-facing type names (API input) mapped to PostgreSQL column_type enum values
 *
 * User types are more generic and user-friendly (e.g., "decimal")
 * PostgreSQL types are the actual enum values in the database (e.g., "numeric")
 */
const TYPE_MAPPING: Record<string, string> = {
    // Scalar types
    'text': 'text',
    'integer': 'integer',
    'decimal': 'numeric',      // User-facing "decimal" maps to PostgreSQL "numeric"
    'boolean': 'boolean',
    'timestamp': 'timestamp',
    'date': 'date',
    'uuid': 'uuid',
    'jsonb': 'jsonb',

    // Array types
    'text[]': 'text[]',
    'integer[]': 'integer[]',
    'decimal[]': 'numeric[]',  // User-facing "decimal[]" maps to PostgreSQL "numeric[]"
    'uuid[]': 'uuid[]',
} as const;

/**
 * Valid user-facing type names
 */
const VALID_USER_TYPES = Object.keys(TYPE_MAPPING);

/**
 * Map user-facing type name to PostgreSQL column_type enum value
 */
function mapUserTypeToPgType(userType: string): string {
    const pgType = TYPE_MAPPING[userType];

    if (!pgType) {
        throw HttpErrors.badRequest(
            `Invalid type '${userType}'. Valid types: ${VALID_USER_TYPES.join(', ')}`,
            'INVALID_COLUMN_TYPE'
        );
    }

    return pgType;
}

/**
 * Map PostgreSQL column_type enum value back to user-facing type name
 */
function mapPgTypeToUserType(pgType: string): string {
    // Reverse lookup
    for (const [userType, mappedPgType] of Object.entries(TYPE_MAPPING)) {
        if (mappedPgType === pgType) {
            return userType;
        }
    }

    // If no mapping found, return as-is (should not happen with valid data)
    return pgType;
}

/**
 * Describe Class - Schema Definition Management
 *
 * Handles schema JSON operations following the same patterns as Database class.
 * Focused purely on schema definition management (no list operations - use Data API).
 *
 * Architecture:
 * - Consistent with system.database.* pattern
 * - Clean transaction management with run() pattern
 * - Schema-specific utilities and DDL generation
 * - Observer access for future deployment scenarios
 */
export class Describe {
    constructor(private system: System) {}

    /**
     * Invalidate schema cache after modifications
     * All schema writes go through this class, so we control cache invalidation
     */
    private async invalidateSchemaCache(schemaName: string): Promise<void> {
        const { SchemaCache } = await import('@src/lib/schema-cache.js');
        SchemaCache.getInstance().invalidateSchema(this.system, schemaName);
    }

    /**
     * Transaction management pattern (consistent with Database class)
     */
    private async run(
        operation: string,
        schemaName: string,
        fn: (tx: TxContext | DbContext) => Promise<any>
    ): Promise<any> {
        const executor: TxContext | DbContext = this.system.tx ?? this.system.db;
        const inTransaction = Boolean(this.system.tx);

        console.debug(
            `🔄 Describe operation starting`,
            { operation, schemaName, inTransaction }
        );

        try {
            const result = await fn(executor);

            console.debug(`✅ Describe operation completed`, { operation, schemaName, inTransaction });
            return result;
        } catch (error) {
            console.error(`💥 Describe operation failed`, {
                operation,
                schemaName,
                inTransaction,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Validate that schema is not protected (requires sudo access)
     *
     * Checks the schemas.sudo column to determine if schema modifications require
     * elevated permissions. This is a data-driven approach that allows marking any
     * schema as requiring sudo access without code changes.
     */
    private async validateSchemaProtection(schemaName: string): Promise<void> {
        const dtx = this.system.tx || this.system.db;

        // Check if schema requires sudo access
        const schemaQuery = await dtx.query(
            `SELECT sudo FROM schemas WHERE schema_name = $1 AND trashed_at IS NULL LIMIT 1`,
            [schemaName]
        );

        // If schema doesn't exist yet, allow creation (will be validated by other checks)
        if (schemaQuery.rows.length === 0) {
            return;
        }

        const requiresSudo = schemaQuery.rows[0].sudo;

        if (!requiresSudo) {
            // Schema doesn't require sudo - allow modification
            return;
        }

        // Schema requires sudo - verify user has sudo token
        const jwtPayload = this.system.context.get('jwtPayload');

        if (!jwtPayload?.is_sudo) {
            throw HttpErrors.forbidden(
                `Schema '${schemaName}' requires sudo access. Use POST /api/auth/sudo to get short-lived sudo token.`,
                'SCHEMA_REQUIRES_SUDO'
            );
        }

        logger.info('Sudo access validated for protected schema modification', {
            schemaName,
            userId: this.system.getUser?.()?.id,
            elevation_reason: jwtPayload.elevation_reason
        });
    }

    /**
     * Validate column name follows PostgreSQL naming rules
     */
    private validateColumnName(columnName: string): void {
        // PostgreSQL identifier rules:
        // - Must start with letter or underscore
        // - Can contain letters, digits, underscores
        // - Max length 63 characters
        // - Case insensitive (but we'll be strict)

        if (!columnName || typeof columnName !== 'string') {
            throw HttpErrors.badRequest(`Column name must be a non-empty string`, 'INVALID_COLUMN_NAME');
        }

        if (columnName.length > 63) {
            throw HttpErrors.badRequest(`Column name '${columnName}' exceeds 63 character limit`, 'COLUMN_NAME_TOO_LONG');
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
            throw HttpErrors.badRequest(`Column name '${columnName}' must start with letter or underscore and contain only letters, digits, and underscores`, 'INVALID_COLUMN_NAME');
        }

        // Check against PostgreSQL reserved words (basic list)
        const reservedWords = [
            'select', 'insert', 'update', 'delete', 'from', 'where', 'join', 'inner', 'outer',
            'left', 'right', 'on', 'group', 'order', 'by', 'having', 'union', 'table', 'index',
            'primary', 'key', 'foreign', 'constraint', 'create', 'drop', 'alter', 'database',
            'schema', 'view', 'trigger', 'function', 'procedure', 'user', 'grant', 'revoke'
        ];

        if (reservedWords.includes(columnName.toLowerCase())) {
            throw HttpErrors.badRequest(`Column name '${columnName}' is a PostgreSQL reserved word`, 'RESERVED_COLUMN_NAME');
        }
    }

    // ===========================
    // Schema-Level Operations (Monk-native format)
    // ===========================

    /**
     * List all schemas
     *
     * Returns array of schema records
     */
    async listSchemas(): Promise<any[]> {
        const dtx = this.system.tx || this.system.db;

        const result = await dtx.query(`
            SELECT *
            FROM schemas
            WHERE trashed_at IS NULL
            ORDER BY schema_name
        `);

        return result.rows;
    }

    /**
     * Get schema definition in Monk-native format
     *
     * Returns schema record with columns array from columns table
     */
    async getSchema(schemaName: string): Promise<any> {
        const db = this.system.db;

        // Get schema record from database (exclude soft-deleted schemas)
        const schemaQuery = `
            SELECT *
            FROM schemas
            WHERE schema_name = $1 AND trashed_at IS NULL
            LIMIT 1
        `;
        const schemaResult = await db.query(schemaQuery, [schemaName]);

        if (schemaResult.rows.length === 0) {
            throw HttpErrors.notFound(`Schema '${schemaName}' not found`, 'SCHEMA_NOT_FOUND');
        }

        const schema = schemaResult.rows[0];

        // Get columns for this schema
        const columnsQuery = `
            SELECT *
            FROM columns
            WHERE schema_name = $1 AND trashed_at IS NULL
            ORDER BY column_name
        `;
        const columnsResult = await db.query(columnsQuery, [schemaName]);

        // Map PostgreSQL types back to user-facing types in column records
        const columns = columnsResult.rows.map((col: any) => ({
            ...col,
            type: mapPgTypeToUserType(col.type),
        }));

        // Return schema with columns array (definitions table is internal, not exposed)
        return {
            ...schema,
            columns,
        };
    }

    /**
     * Create new schema in Monk-native format
     *
     * Input format:
     * {
     *   status?: string,           // Optional (default: 'pending')
     *   columns?: Column[]         // Optional array
     * }
     *
     * The schemaName parameter is used as both the schema name and table name.
     * Uses observer pipeline: ring 5 inserts metadata, ring 6 executes DDL.
     * Trigger will auto-generate JSON Schema in definitions table.
     */
    async createSchema(schemaName: string, schemaDef: any): Promise<any> {
        // Validate required fields
        if (!schemaName) {
            throw HttpErrors.badRequest('schema_name is required', 'MISSING_REQUIRED_FIELDS');
        }

        const columns = schemaDef.columns || [];
        const status = schemaDef.status || 'pending';

        // Validate schema protection
        await this.validateSchemaProtection(schemaName);

        console.info('Creating schema via observer pipeline', { schemaName, columnCount: columns.length });

        // Step 1: Create schema record (ring 5 inserts, ring 6 creates table with system fields)
        await this.system.database.createOne('schemas', {
            schema_name: schemaName,
            status: status
        });

        // Step 2: Create column records (ring 5 inserts, ring 6 alters table for each column)
        if (columns.length > 0) {
            const columnData = columns.map(col => ({
                ...col,
                schema_name: schemaName
            }));
            await this.system.database.createAll('columns', columnData);
        }

        console.info('Schema created successfully via observer pipeline', { schemaName });

        // Invalidate cache after successful creation
        await this.invalidateSchemaCache(schemaName);

        return { name: schemaName, table: schemaName, created: true };
    }

    /**
     * Update schema metadata (schemas table only)
     *
     * Updates schemas table fields like status.
     * Does NOT update columns - use column endpoints for that.
     *
     * Allowed updates:
     * - status
     */
    async updateSchema(schemaName: string, updates: any): Promise<any> {
        const result = await this.run('update', schemaName, async tx => {
            await this.validateSchemaProtection(schemaName);

            // Build UPDATE query for allowed fields
            const allowedFields = ['status'];
            const setClause: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            for (const field of allowedFields) {
                if (updates[field] !== undefined) {
                    setClause.push(`"${field}" = $${paramIndex}`);
                    values.push(updates[field]);
                    paramIndex++;
                }
            }

            if (setClause.length === 0) {
                throw HttpErrors.badRequest('No valid fields to update', 'NO_UPDATES');
            }

            // Always update updated_at
            setClause.push(`"updated_at" = NOW()`);

            const updateQuery = `
                UPDATE schemas
                SET ${setClause.join(', ')}
                WHERE schema_name = $${paramIndex} AND trashed_at IS NULL
                RETURNING *
            `;
            values.push(schemaName);

            const queryResult = await tx.query(updateQuery, values);

            if (queryResult.rows.length === 0) {
                throw HttpErrors.notFound(`Schema '${schemaName}' not found`, 'SCHEMA_NOT_FOUND');
            }

            console.info('Schema metadata updated', { schemaName, updates });

            return queryResult.rows[0];
        });

        // Invalidate cache after successful update
        await this.invalidateSchemaCache(schemaName);

        return result;
    }

    /**
     * Delete schema
     *
     * Uses observer pipeline: ring 5 soft-deletes record, ring 6 drops table.
     */
    async deleteSchema(schemaName: string): Promise<any> {
        await this.validateSchemaProtection(schemaName);

        console.info('Deleting schema via observer pipeline', { schemaName });

        // Delete schema (ring 5 soft deletes, ring 6 drops table)
        await this.system.database.deleteAll('schemas', [{ schema_name: schemaName }]);

        console.info('Schema deleted successfully via observer pipeline', { schemaName });

        // Invalidate cache after successful deletion
        await this.invalidateSchemaCache(schemaName);

        return { name: schemaName, deleted: true };
    }

    // ===========================
    // Column-Level Operations (Monk-native format)
    // ===========================

    /**
     * Get column definition in Monk-native format
     *
     * Returns column record from columns table
     */
    async getColumn(schemaName: string, columnName: string): Promise<any> {
        const dtx = this.system.tx || this.system.db;

        const result = await dtx.query(
            `SELECT * FROM columns WHERE schema_name = $1 AND column_name = $2`,
            [schemaName, columnName]
        );

        if (result.rows.length === 0) {
            throw HttpErrors.notFound(
                `Column '${columnName}' not found in schema '${schemaName}'`,
                'COLUMN_NOT_FOUND'
            );
        }

        // Map PostgreSQL type back to user-facing type
        const column = result.rows[0];
        return {
            ...column,
            type: mapPgTypeToUserType(column.type),
        };
    }

    /**
     * Create new column in Monk-native format
     *
     * Executes DDL and inserts into columns table
     * Trigger will auto-generate JSON Schema in definitions table
     */
    async createColumn(schemaName: string, columnName: string, columnDef: any): Promise<any> {
        // Validate schema is not protected
        await this.validateSchemaProtection(schemaName);

        // Validate column name
        this.validateColumnName(columnName);

        console.info('Creating column via observer pipeline', { schemaName, columnName });

        // Create column (ring 5 inserts, ring 6 alters table)
        const result = await this.system.database.createOne('columns', {
            ...columnDef,
            schema_name: schemaName,
            column_name: columnName
        });

        console.info('Column created successfully via observer pipeline', { schemaName, columnName });

        // Invalidate cache after successful creation
        await this.invalidateSchemaCache(schemaName);

        return {
            schema_name: schemaName,
            column_name: columnName,
            type: columnDef.type || 'text',
            created: true
        };
    }

    /**
     * Update column in Monk-native format
     *
     * Executes DDL and updates columns table
     * Trigger will auto-regenerate JSON Schema in definitions table
     *
     * Supports both metadata updates and structural changes:
     * - Metadata: description, pattern, minimum, maximum, enum_values, relationship fields
     * - Structural: type (ALTER TYPE), required (SET/DROP NOT NULL), default_value (SET/DROP DEFAULT)
     */
    async updateColumn(schemaName: string, columnName: string, updates: any): Promise<any> {
        // Validate schema is not protected
        await this.validateSchemaProtection(schemaName);

        console.info('Updating column via observer pipeline', { schemaName, columnName });

        // Update column (ring 5 updates, ring 6 alters table if needed)
        const result = await this.system.database.updateAll('columns', [{
            schema_name: schemaName,
            column_name: columnName,
            ...updates
        }]);

        console.info('Column updated successfully via observer pipeline', { schemaName, columnName });

        // Invalidate cache after successful update
        await this.invalidateSchemaCache(schemaName);

        return result[0];
    }

    /**
     * Delete column
     *
     * Performs hard delete: soft-deletes from columns table AND drops column from PostgreSQL table
     * Trigger will auto-regenerate JSON Schema in definitions table
     */
    async deleteColumn(schemaName: string, columnName: string): Promise<any> {
        // Validate schema is not protected
        await this.validateSchemaProtection(schemaName);

        console.info('Deleting column via observer pipeline', { schemaName, columnName });

        // Delete column (ring 5 soft deletes, ring 6 drops column)
        await this.system.database.deleteAll('columns', [{
            schema_name: schemaName,
            column_name: columnName
        }]);

        console.info('Column deleted successfully via observer pipeline', { schemaName, columnName });

        // Invalidate cache after successful deletion
        await this.invalidateSchemaCache(schemaName);

        return {
            schema_name: schemaName,
            column_name: columnName,
            deleted: true
        };
    }
}
