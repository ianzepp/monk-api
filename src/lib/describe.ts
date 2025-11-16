import type { DbContext, TxContext } from '@src/db/index.js';

import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';
import type {
    SchemaRecord,
    ColumnRecord,
    DbRecord,
    DbCreateInput,
    SystemFields,
} from '@src/lib/database-types.js';

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
     * Select all schemas
     *
     * Returns array of schema records
     */
    async selectSchemas(): Promise<SchemaRecord[]> {
        return this.system.database.selectAny<SchemaRecord>('schemas', {
            order: { schema_name: 'asc' }
        });
    }

    /**
     * Select single schema by name
     *
     * Returns schema record, throws 404 if not found
     */
    async selectSchema(schemaName: string): Promise<SchemaRecord> {
        return this.system.database.select404<SchemaRecord>(
            'schemas',
            { where: { schema_name: schemaName } },
            `Schema '${schemaName}' not found`
        );
    }

    /**
     * Select all columns for a schema
     *
     * Returns column records from columns table with user-facing type names
     */
    async selectColumns(schemaName: string): Promise<ColumnRecord[]> {
        return this.system.database.selectAny<ColumnRecord>(
            'columns',
            {
                where: { schema_name: schemaName },
                order: { column_name: 'asc' }
            }
        );
    }

    /**
     * Select single column by schema and column name
     *
     * Returns column record, throws 404 if not found
     */
    async selectColumn(schemaName: string, columnName: string): Promise<ColumnRecord> {
        return this.system.database.select404<ColumnRecord>(
            'columns',
            { where: { schema_name: schemaName, column_name: columnName } },
            `Column '${columnName}' not found in schema '${schemaName}'`
        );
    }

    /**
     * Create new schema
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
    async createSchema(schemaName: string, schemaDef: { status?: string; columns?: any[] } = {}): Promise<SchemaRecord> {
        // Validate required fields
        if (!schemaName) {
            throw HttpErrors.badRequest('schema_name is required', 'MISSING_REQUIRED_FIELDS');
        }

        // Validate schema protection (checks if schema already exists and requires sudo)
        await this.validateSchemaProtection(schemaName);

        const columns = schemaDef.columns || [];
        const status = schemaDef.status || 'pending';

        logger.info('Creating schema via observer pipeline', { schemaName, columnCount: columns.length });

        // Step 1: Create schema record (ring 5 inserts, ring 6 creates table with system fields)
        const schema = await this.system.database.createOne<Omit<SchemaRecord, keyof SystemFields>>('schemas', {
            schema_name: schemaName,
            status: status
        }) as SchemaRecord;

        // Step 2: Create column records (ring 5 inserts, ring 6 alters table for each column)
        // Type mapping is handled by Ring 1 observer (user→PG)
        if (columns.length > 0) {
            await this.system.database.createAll<Omit<ColumnRecord, keyof SystemFields>>('columns',
                columns.map(col => ({
                    ...col,
                    schema_name: schemaName,
                    type: col.type || 'text'
                }))
            );
        }

        logger.info('Schema created successfully via observer pipeline', { schemaName });

        return schema;
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
    async updateSchema(schemaName: string, updates: { status?: string }): Promise<SchemaRecord> {
        // Validate schema protection
        await this.validateSchemaProtection(schemaName);

        // Validate at least one field provided
        if (Object.keys(updates).length === 0) {
            throw HttpErrors.badRequest('No valid fields to update', 'NO_UPDATES');
        }

        logger.info('Updating schema metadata', { schemaName, updates });

        // Update via database (goes through observer pipeline)
        const schema = await this.system.database.update404<SchemaRecord>(
            'schemas',
            { where: { schema_name: schemaName } },
            updates,
            `Schema '${schemaName}' not found`
        );

        return schema;
    }

    /**
     * Delete schema
     *
     * Uses observer pipeline: ring 5 soft-deletes record, ring 6 drops table.
     */
    async deleteSchema(schemaName: string): Promise<SchemaRecord> {
        // Validate schema protection
        await this.validateSchemaProtection(schemaName);

        logger.info('Deleting schema via observer pipeline', { schemaName });

        // Delete schema (ring 5 soft deletes, ring 6 drops table)
        const schema = await this.system.database.delete404<SchemaRecord>(
            'schemas',
            { where: { schema_name: schemaName } },
            `Schema '${schemaName}' not found`
        );

        logger.info('Schema deleted successfully via observer pipeline', { schemaName });

        return schema;
    }

    // ===========================
    // Column-Level Operations (Monk-native format)
    // ===========================

    /**
     * Create new column
     *
     * Executes DDL and inserts into columns table via observer pipeline.
     * Trigger will auto-generate JSON Schema in definitions table.
     */
    async createColumn(schemaName: string, columnName: string, columnDef: Partial<ColumnRecord> = {}): Promise<ColumnRecord> {
        // Validate schema is not protected
        await this.validateSchemaProtection(schemaName);

        // Validate column name
        this.validateColumnName(columnName);

        logger.info('Creating column via observer pipeline', { schemaName, columnName });

        // Create column (ring 5 inserts, ring 6 alters table)
        // Type mapping is handled by Ring 1 observer (user→PG) and Ring 7 observer (PG→user)
        return await this.system.database.createOne<Omit<ColumnRecord, keyof SystemFields>>('columns', {
            ...columnDef,
            schema_name: schemaName,
            column_name: columnName,
            type: columnDef.type || 'text'
        }) as ColumnRecord;
    }

    /**
     * Update column
     *
     * Executes DDL and updates columns table via observer pipeline.
     * Trigger will auto-regenerate JSON Schema in definitions table.
     *
     * Supports both metadata updates and structural changes:
     * - Metadata: description, pattern, minimum, maximum, enum_values, relationship fields
     * - Structural: type (ALTER TYPE), required (SET/DROP NOT NULL), default_value (SET/DROP DEFAULT)
     */
    async updateColumn(schemaName: string, columnName: string, updates: Partial<ColumnRecord>): Promise<ColumnRecord> {
        // Validate schema is not protected
        await this.validateSchemaProtection(schemaName);

        logger.info('Updating column via observer pipeline', { schemaName, columnName });

        // Update column (ring 5 updates, ring 6 alters table if needed)
        // Type mapping is handled by Ring 1 observer (user→PG) and Ring 7 observer (PG→user)
        return await this.system.database.update404<ColumnRecord>(
            'columns',
            { where: { schema_name: schemaName, column_name: columnName } },
            updates,
            `Column '${columnName}' not found in schema '${schemaName}'`
        );
    }

    /**
     * Delete column
     *
     * Performs hard delete: soft-deletes from columns table AND drops column from PostgreSQL table.
     * Trigger will auto-regenerate JSON Schema in definitions table.
     */
    async deleteColumn(schemaName: string, columnName: string): Promise<ColumnRecord> {
        // Validate schema is not protected
        await this.validateSchemaProtection(schemaName);

        logger.info('Deleting column via observer pipeline', { schemaName, columnName });

        // Delete column (ring 5 soft deletes, ring 6 drops column)
        // Type mapping is handled by Ring 7 observer (PG→user)
        return await this.system.database.delete404<ColumnRecord>(
            'columns',
            { where: { schema_name: schemaName, column_name: columnName } },
            `Column '${columnName}' not found in schema '${schemaName}'`
        );
    }
}
