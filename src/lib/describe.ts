import crypto from 'crypto';
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

    // /**
    //  * Parse JSON content to JSON Schema (public method for route handlers)
    //  */
    // parseSchema(jsonContent: any): JsonSchema {
    //     return this.parseJsonSchema(jsonContent);
    // }

    // /**
    //  * Parse JSON content to JSON Schema (internal implementation)
    //  */
    // private parseJsonSchema(jsonContent: any): JsonSchema {
    //     if (!jsonContent || typeof jsonContent !== 'object') {
    //         throw HttpErrors.badRequest('Invalid schema definition format', 'SCHEMA_INVALID_FORMAT');
    //     }

    //     if (!jsonContent.title || !jsonContent.properties) {
    //         throw HttpErrors.badRequest('Schema must have title and properties', 'SCHEMA_MISSING_FIELDS');
    //     }

    //     return jsonContent as JsonSchema;
    // }

    // /**
    //  * Generate CREATE TABLE DDL from JSON Schema
    //  */
    // private generateCreateTableDDL(tableName: string, jsonSchema: JsonSchema): string {
    //     const properties = jsonSchema.properties;
    //     const required = jsonSchema.required || [];

    //     let ddl = `CREATE TABLE "${tableName}" (\n`;

    //     // Standard PaaS fields
    //     ddl += `    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
    //     ddl += `    "access_read" UUID[] DEFAULT '{}',\n`;
    //     ddl += `    "access_edit" UUID[] DEFAULT '{}',\n`;
    //     ddl += `    "access_full" UUID[] DEFAULT '{}',\n`;
    //     ddl += `    "access_deny" UUID[] DEFAULT '{}',\n`;
    //     ddl += `    "created_at" TIMESTAMP DEFAULT now() NOT NULL,\n`;
    //     ddl += `    "updated_at" TIMESTAMP DEFAULT now() NOT NULL,\n`;
    //     ddl += `    "trashed_at" TIMESTAMP,\n`;
    //     ddl += `    "deleted_at" TIMESTAMP`;

    //     // Schema-specific fields
    //     for (const [fieldName, property] of Object.entries(properties)) {
    //         // Skip system fields that are already defined
    //         if (isSystemField(fieldName)) {
    //             console.warn(`Schema defines system field '${fieldName}' which is automatically managed by the platform. Ignoring user-defined version.`);
    //             continue;
    //         }

    //         const pgType = this.jsonSchemaTypeToPostgres(property);
    //         const isRequired = required.includes(fieldName);
    //         const nullable = isRequired ? ' NOT NULL' : '';

    //         let defaultValue = '';
    //         if (property.default !== undefined) {
    //             if (typeof property.default === 'string') {
    //                 const escapedDefault = property.default.replace(/'/g, "''");
    //                 defaultValue = ` DEFAULT '${escapedDefault}'`;
    //             } else if (typeof property.default === 'number') {
    //                 defaultValue = ` DEFAULT ${property.default}`;
    //             } else if (typeof property.default === 'boolean') {
    //                 defaultValue = ` DEFAULT ${property.default}`;
    //             }
    //         }

    //         ddl += `,\n    "${fieldName}" ${pgType}${nullable}${defaultValue}`;
    //     }

    //     ddl += `\n);`;
    //     return ddl;
    // }

    // /**
    //  * Convert JSON Schema property to PostgreSQL type
    //  */
    // private jsonSchemaTypeToPostgres(property: JsonSchemaProperty): string {
    //     switch (property.type) {
    //         case 'string':
    //             if (property.format === 'uuid') {
    //                 return 'UUID';
    //             } else if (property.format === 'date-time') {
    //                 return 'TIMESTAMP';
    //             } else if (property.enum) {
    //                 return 'TEXT';
    //             } else if (property.maxLength && property.maxLength <= 255) {
    //                 return `VARCHAR(${property.maxLength})`;
    //             } else {
    //                 return 'TEXT';
    //             }
    //         case 'integer':
    //             return 'INTEGER';
    //         case 'number':
    //             return 'DECIMAL';
    //         case 'boolean':
    //             return 'BOOLEAN';
    //         case 'array':
    //             return 'JSONB';
    //         case 'object':
    //             return 'JSONB';
    //         default:
    //             return 'TEXT';
    //     }
    // }

    /**
     * Validate that schema is not protected (system schema)
     */
    private validateSchemaProtection(schemaName: string): void {
        const protectedSchemas = ['schemas', 'columns', 'users', 'definitions'];

        if (protectedSchemas.includes(schemaName)) {
            throw HttpErrors.forbidden(`Schema '${schemaName}' is protected and cannot be modified`, 'SCHEMA_PROTECTED');
        }
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

    // /**
    //  * Generate JSON content checksum for cache invalidation
    //  */
    // private generateJsonChecksum(jsonContent: string): string {
    //     return crypto.createHash('sha256').update(jsonContent).digest('hex');
    // }

    // /**
    //  * Insert schema describe record
    //  */
    // private async insertSchemaRecord(tx: TxContext | DbContext, schemaName: string, tableName: string, jsonSchema: JsonSchema, jsonChecksum: string): Promise<void> {
    //     const fieldCount = Object.keys(jsonSchema.properties).length;

    //     const insertQuery = `
    //         INSERT INTO schemas
    //         (id, schema_name, status, created_at, updated_at, access_read, access_edit, access_full, access_deny)
    //         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW(), '{}', '{}', '{}', '{}')
    //         RETURNING *
    //     `;

    //     await tx.query(insertQuery, [schemaName, tableName, 'active', fieldCount.toString(), jsonChecksum]);
    // }

    // /**
    //  * Insert column describe records for schema properties
    //  */
    // private async insertColumnRecords(tx: TxContext | DbContext, schemaName: string, jsonSchema: JsonSchema): Promise<void> {
    //     if (!jsonSchema.properties || Object.keys(jsonSchema.properties).length === 0) {
    //         return; // No properties to process
    //     }

    //     const requiredFields = jsonSchema.required || [];

    //     for (const [columnName, columnDefinition] of Object.entries(jsonSchema.properties)) {
    //         // Validate column name
    //         this.validateColumnName(columnName);

    //         // Map JSON Schema type to PostgreSQL type
    //         const pgType = this.jsonSchemaTypeToPostgres(columnDefinition);
    //         const isRequired = requiredFields.includes(columnName) ? 'true' : 'false';
    //         const defaultValue = columnDefinition.default !== undefined ? String(columnDefinition.default) : null;

    //         // Extract constraint and relationship metadata
    //         const constraintData = this.extractConstraintData(columnDefinition);
    //         const relationshipData = this.extractRelationshipData(columnDefinition);

    //         const insertQuery = `
    //             INSERT INTO columns
    //             (id, schema_name, column_name, type, required, default_value, relationship_type, related_schema, related_column, relationship_name, cascade_delete, required_relationship, minimum, maximum, pattern, enum_values, is_array, description, created_at, updated_at, access_read, access_edit, access_full, access_deny)
    //             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW(), '{}', '{}', '{}', '{}')
    //         `;

    //         await tx.query(insertQuery, [
    //             schemaName,
    //             columnName,
    //             pgType,
    //             isRequired,
    //             defaultValue,
    //             relationshipData.relationshipType,
    //             relationshipData.relatedSchema,
    //             relationshipData.relatedColumn,
    //             relationshipData.relationshipName,
    //             relationshipData.cascadeDelete,
    //             relationshipData.requiredRelationship,
    //             constraintData.minimum,
    //             constraintData.maximum,
    //             constraintData.patternRegex,
    //             constraintData.enumValues,
    //             constraintData.isArray,
    //             columnDefinition.description || null
    //         ]);
    //     }

    //     console.info('Column records inserted', {
    //         schemaName,
    //         columnCount: Object.keys(jsonSchema.properties).length
    //     });
    // }

    // /**
    //  * Extract constraint data from JSON Schema property definition
    //  */
    // private extractConstraintData(columnDefinition: any): any {
    //     return {
    //         minimum: columnDefinition.minLength ?? columnDefinition.minimum ?? null,
    //         maximum: columnDefinition.maxLength ?? columnDefinition.maximum ?? null,
    //         patternRegex: columnDefinition.pattern ?? null,
    //         enumValues: columnDefinition.enum ? columnDefinition.enum : null,
    //         isArray: columnDefinition.type === 'array'
    //     };
    // }

    // /**
    //  * Extract relationship metadata from JSON Schema property definition
    //  */
    // private extractRelationshipData(columnDefinition: any): any {
    //     // Check for x-monk-relationship extension
    //     const xMonkRelationship = columnDefinition['x-monk-relationship'];

    //     if (xMonkRelationship) {
    //         return {
    //             relationshipType: xMonkRelationship.type,
    //             relatedSchema: xMonkRelationship.schema,
    //             relatedColumn: xMonkRelationship.column ?? 'id',
    //             relationshipName: xMonkRelationship.name,
    //             cascadeDelete: xMonkRelationship.cascadeDelete ?? (xMonkRelationship.type === 'owned'),
    //             requiredRelationship: xMonkRelationship.required ?? (xMonkRelationship.type === 'owned')
    //         };
    //     }

    //     return {
    //         relationshipType: null,
    //         relatedSchema: null,
    //         relatedColumn: null,
    //         relationshipName: null,
    //         cascadeDelete: false,
    //         requiredRelationship: false
    //     };
    // }

    /**
     * Generate CREATE TABLE DDL from columns array (Monk-native format)
     */
    private generateCreateTableDDLFromColumns(tableName: string, columns: any[]): string {
        let ddl = `CREATE TABLE "${tableName}" (\n`;

        // Standard PaaS fields
        ddl += `    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
        ddl += `    "access_read" UUID[] DEFAULT '{}',\n`;
        ddl += `    "access_edit" UUID[] DEFAULT '{}',\n`;
        ddl += `    "access_full" UUID[] DEFAULT '{}',\n`;
        ddl += `    "access_deny" UUID[] DEFAULT '{}',\n`;
        ddl += `    "created_at" TIMESTAMP DEFAULT now() NOT NULL,\n`;
        ddl += `    "updated_at" TIMESTAMP DEFAULT now() NOT NULL,\n`;
        ddl += `    "trashed_at" TIMESTAMP,\n`;
        ddl += `    "deleted_at" TIMESTAMP`;

        // Schema-specific fields from columns array
        for (const column of columns) {
            // Skip system fields that are already defined
            if (isSystemField(column.column_name)) {
                console.warn(`Schema defines system field '${column.column_name}' which is automatically managed. Ignoring.`);
                continue;
            }

            this.validateColumnName(column.column_name);

            // Map user-facing type to PostgreSQL type
            const userType = column.type || 'text';
            const pgType = mapUserTypeToPgType(userType);

            const isRequired = Boolean(column.required);
            const nullable = isRequired ? ' NOT NULL' : '';

            let defaultValue = '';
            if (column.default_value !== undefined && column.default_value !== null) {
                if (typeof column.default_value === 'string') {
                    const escapedDefault = column.default_value.replace(/'/g, "''");
                    defaultValue = ` DEFAULT '${escapedDefault}'`;
                } else if (typeof column.default_value === 'number') {
                    defaultValue = ` DEFAULT ${column.default_value}`;
                } else if (typeof column.default_value === 'boolean') {
                    defaultValue = ` DEFAULT ${column.default_value}`;
                }
            }

            ddl += `,\n    "${column.column_name}" ${pgType}${nullable}${defaultValue}`;
        }

        ddl += `\n);`;
        return ddl;
    }

    /**
     * Insert a single column record into columns table (Monk-native format)
     */
    private async insertColumnRecord(tx: TxContext | DbContext, schemaName: string, column: any): Promise<void> {
        // Validate and map user-facing type to PostgreSQL type
        const userType = column.type || 'text';
        const pgType = mapUserTypeToPgType(userType);

        const insertQuery = `
            INSERT INTO columns (
                schema_name, column_name, type, required, default_value,
                minimum, maximum, pattern, enum_values, is_array, description,
                relationship_type, related_schema, related_column, relationship_name,
                cascade_delete, required_relationship,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3::column_type, $4, $5,
                $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15,
                $16, $17,
                NOW(), NOW()
            )
        `;

        await tx.query(insertQuery, [
            schemaName,
            column.column_name,
            pgType,
            Boolean(column.required ?? false),
            column.default_value || null,
            column.minimum || null,
            column.maximum || null,
            column.pattern || null,
            column.enum_values || null,
            Boolean(column.is_array ?? false),
            column.description || null,
            column.relationship_type || null,
            column.related_schema || null,
            column.related_column || null,
            column.relationship_name || null,
            Boolean(column.cascade_delete ?? false),
            Boolean(column.required_relationship ?? false),
        ]);
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
     * Executes DDL, inserts into schemas table, and populates columns table.
     * Trigger will auto-generate JSON Schema in definitions table.
     */
    async createSchema(schemaName: string, schemaDef: any): Promise<any> {
        const result = await this.run('create', schemaName, async tx => {
            // Validate required fields
            if (!schemaName) {
                throw HttpErrors.badRequest('schema_name is required', 'MISSING_REQUIRED_FIELDS');
            }

            const columns = schemaDef.columns || [];
            const status = schemaDef.status || 'pending';

            // Validate schema protection
            this.validateSchemaProtection(schemaName);

            console.info('Creating schema (Monk-native)', { schemaName, columnCount: columns.length });

            // Generate and execute DDL from columns array
            // Use schema_name as table name
            const ddl = this.generateCreateTableDDLFromColumns(schemaName, columns);
            await tx.query(ddl);

            // Insert schema record
            const insertSchemaQuery = `
                INSERT INTO schemas
                (schema_name, status, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                RETURNING *
            `;
            await tx.query(insertSchemaQuery, [
                schemaName,
                status,
            ]);

            // Insert column records
            for (const column of columns) {
                await this.insertColumnRecord(tx, schemaName, column);
            }

            console.info('Schema created successfully (Monk-native)', { schemaName });

            return { name: schemaName, table: schemaName, created: true };
        });

        // Invalidate cache after successful creation
        await this.invalidateSchemaCache(schemaName);

        return result;
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
            this.validateSchemaProtection(schemaName);

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
     * Delete schema (soft delete)
     *
     * Marks schema as trashed in schemas table
     */
    async deleteSchema(schemaName: string): Promise<any> {
        const result = await this.run('delete', schemaName, async tx => {
            this.validateSchemaProtection(schemaName);

            // Soft delete schema record
            const deleteQuery = `
                UPDATE schemas
                SET trashed_at = NOW(), updated_at = NOW()
                WHERE schema_name = $1 AND trashed_at IS NULL
                RETURNING *
            `;

            const queryResult = await tx.query(deleteQuery, [schemaName]);

            if (queryResult.rows.length === 0) {
                throw HttpErrors.notFound(`Schema '${schemaName}' not found or already deleted`, 'SCHEMA_NOT_FOUND');
            }

            return { name: schemaName, deleted: true };
        });

        // Invalidate cache after successful deletion
        await this.invalidateSchemaCache(schemaName);

        return result;
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
        const result = await this.run('createColumn', schemaName, async tx => {
            // Validate schema exists
            const schemaCheck = await tx.query(
                `SELECT 1 FROM schemas WHERE schema_name = $1 AND trashed_at IS NULL`,
                [schemaName]
            );

            if (schemaCheck.rows.length === 0) {
                throw HttpErrors.notFound(`Schema '${schemaName}' not found`, 'SCHEMA_NOT_FOUND');
            }

            // Validate schema is not protected
            this.validateSchemaProtection(schemaName);

            // Validate column name
            this.validateColumnName(columnName);

            // Check if column already exists
            const columnCheck = await tx.query(
                `SELECT 1 FROM columns WHERE schema_name = $1 AND column_name = $2`,
                [schemaName, columnName]
            );

            if (columnCheck.rows.length > 0) {
                throw HttpErrors.conflict(
                    `Column '${columnName}' already exists in schema '${schemaName}'`,
                    'COLUMN_ALREADY_EXISTS'
                );
            }

            // Map user type to PostgreSQL type
            const userType = columnDef.type || 'text';
            const pgType = mapUserTypeToPgType(userType);

            // Generate ALTER TABLE ADD COLUMN DDL
            const isRequired = Boolean(columnDef.required);
            const nullable = isRequired ? ' NOT NULL' : '';

            let defaultValue = '';
            if (columnDef.default_value !== undefined && columnDef.default_value !== null) {
                if (typeof columnDef.default_value === 'string') {
                    const escapedDefault = columnDef.default_value.replace(/'/g, "''");
                    defaultValue = ` DEFAULT '${escapedDefault}'`;
                } else if (typeof columnDef.default_value === 'number') {
                    defaultValue = ` DEFAULT ${columnDef.default_value}`;
                } else if (typeof columnDef.default_value === 'boolean') {
                    defaultValue = ` DEFAULT ${columnDef.default_value}`;
                }
            }

            const ddl = `ALTER TABLE "${schemaName}" ADD COLUMN "${columnName}" ${pgType}${nullable}${defaultValue}`;

            // Execute DDL
            await tx.query(ddl);

            // Insert column record with provided columnName (not from body)
            const columnRecord = {
                ...columnDef,
                column_name: columnName,
                type: userType, // Store user-facing type, will be mapped in insertColumnRecord
            };

            await this.insertColumnRecord(tx, schemaName, columnRecord);

            console.info('Column created successfully', { schemaName, columnName });

            return {
                schema_name: schemaName,
                column_name: columnName,
                type: userType,
                created: true
            };
        });

        // Invalidate cache after successful creation
        await this.invalidateSchemaCache(schemaName);

        return result;
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
        const result = await this.run('updateColumn', schemaName, async tx => {
            // Validate schema is not protected
            this.validateSchemaProtection(schemaName);

            // Get existing column
            const existingResult = await tx.query(
                `SELECT * FROM columns WHERE schema_name = $1 AND column_name = $2`,
                [schemaName, columnName]
            );

            if (existingResult.rows.length === 0) {
                throw HttpErrors.notFound(
                    `Column '${columnName}' not found in schema '${schemaName}'`,
                    'COLUMN_NOT_FOUND'
                );
            }

            const existingColumn = existingResult.rows[0];
            const ddlCommands: string[] = [];

            // Handle type change
            if (updates.type && updates.type !== mapPgTypeToUserType(existingColumn.type)) {
                const newPgType = mapUserTypeToPgType(updates.type);
                ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" TYPE ${newPgType}`);
            }

            // Handle required (NOT NULL) change
            if (updates.required !== undefined) {
                const newRequired = Boolean(updates.required);
                const currentRequired = Boolean(existingColumn.required);

                if (newRequired !== currentRequired) {
                    if (newRequired) {
                        ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" SET NOT NULL`);
                    } else {
                        ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" DROP NOT NULL`);
                    }
                }
            }

            // Handle default value change
            if (updates.default_value !== undefined) {
                if (updates.default_value === null) {
                    // Remove default
                    ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" DROP DEFAULT`);
                } else {
                    // Set new default
                    let defaultValue: string;
                    if (typeof updates.default_value === 'string') {
                        const escapedDefault = updates.default_value.replace(/'/g, "''");
                        defaultValue = `'${escapedDefault}'`;
                    } else {
                        defaultValue = String(updates.default_value);
                    }
                    ddlCommands.push(`ALTER TABLE "${schemaName}" ALTER COLUMN "${columnName}" SET DEFAULT ${defaultValue}`);
                }
            }

            // Execute all DDL commands
            for (const ddl of ddlCommands) {
                await tx.query(ddl);
            }

            // Build UPDATE query for columns table
            const allowedFields = [
                'type', 'required', 'default_value', 'description',
                'minimum', 'maximum', 'pattern', 'enum_values', 'is_array',
                'relationship_type', 'related_schema', 'related_column',
                'relationship_name', 'cascade_delete', 'required_relationship'
            ];

            const setClause: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            for (const field of allowedFields) {
                if (updates[field] !== undefined) {
                    // Special handling for type field - map to PG type
                    if (field === 'type') {
                        setClause.push(`"${field}" = $${paramIndex}::column_type`);
                        values.push(mapUserTypeToPgType(updates[field]));
                    }
                    // Special handling for boolean fields
                    else if (field === 'required' || field === 'is_array' || field === 'cascade_delete' || field === 'required_relationship') {
                        setClause.push(`"${field}" = $${paramIndex}`);
                        values.push(Boolean(updates[field]));
                    }
                    else {
                        setClause.push(`"${field}" = $${paramIndex}`);
                        values.push(updates[field]);
                    }
                    paramIndex++;
                }
            }

            if (setClause.length === 0) {
                throw HttpErrors.badRequest('No valid fields to update', 'NO_UPDATES');
            }

            // Always update updated_at
            setClause.push(`"updated_at" = NOW()`);

            const updateQuery = `
                UPDATE columns
                SET ${setClause.join(', ')}
                WHERE schema_name = $${paramIndex} AND column_name = $${paramIndex + 1}
                RETURNING *
            `;
            values.push(schemaName, columnName);

            const updateResult = await tx.query(updateQuery, values);

            console.info('Column updated successfully', { schemaName, columnName, updates });

            // Map PG type back to user type in response
            const updatedColumn = updateResult.rows[0];
            return {
                ...updatedColumn,
                type: mapPgTypeToUserType(updatedColumn.type),
            };
        });

        // Invalidate cache after successful update
        await this.invalidateSchemaCache(schemaName);

        return result;
    }

    /**
     * Delete column
     *
     * Performs hard delete: soft-deletes from columns table AND drops column from PostgreSQL table
     * Trigger will auto-regenerate JSON Schema in definitions table
     */
    async deleteColumn(schemaName: string, columnName: string): Promise<any> {
        const result = await this.run('deleteColumn', schemaName, async tx => {
            // Validate schema is not protected
            this.validateSchemaProtection(schemaName);

            // Check if column exists
            const columnCheck = await tx.query(
                `SELECT * FROM columns WHERE schema_name = $1 AND column_name = $2 AND trashed_at IS NULL`,
                [schemaName, columnName]
            );

            if (columnCheck.rows.length === 0) {
                throw HttpErrors.notFound(
                    `Column '${columnName}' not found in schema '${schemaName}'`,
                    'COLUMN_NOT_FOUND'
                );
            }

            // Soft delete from columns table (sets trashed_at)
            await tx.query(
                `UPDATE columns SET trashed_at = NOW(), updated_at = NOW()
                 WHERE schema_name = $1 AND column_name = $2`,
                [schemaName, columnName]
            );

            // Hard delete from PostgreSQL table (DROP COLUMN)
            const ddl = `ALTER TABLE "${schemaName}" DROP COLUMN "${columnName}"`;
            await tx.query(ddl);

            console.info('Column deleted successfully', { schemaName, columnName });

            return {
                schema_name: schemaName,
                column_name: columnName,
                deleted: true
            };
        });

        // Invalidate cache after successful deletion
        await this.invalidateSchemaCache(schemaName);

        return result;
    }
}
