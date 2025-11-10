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
     * Create new schema from JSON content
     */
    async createOne(schemaName: string, jsonContent: any): Promise<any> {
        return await this.run('create', schemaName, async tx => {
            const jsonSchema = this.parseJsonSchema(jsonContent);
            const tableName = jsonSchema.table || schemaName;

            // Validate schema protection
            this.validateSchemaProtection(schemaName);

            logger.info('Creating schema', { schemaName, tableName });

            // Generate and execute DDL
            const ddl = this.generateCreateTableDDL(tableName, jsonSchema);
            await tx.query(ddl);

            // Insert schema describe
            const jsonChecksum = this.generateJsonChecksum(JSON.stringify(jsonContent));
            await this.insertSchemaRecord(tx, schemaName, tableName, jsonSchema, jsonChecksum);

            // Insert column describe
            await this.insertColumnRecords(tx, schemaName, jsonSchema);

            logger.info('Schema created successfully', { schemaName, tableName });

            return { name: schemaName, table: tableName, created: true };
        });
    }

    /**
     * Get schema as JSON content
     */
    async selectOne(schemaName: string): Promise<any> {
        const db = this.system.db;

        // Get schema record from database (exclude soft-deleted schemas)
        const selectQuery = `SELECT * FROM schemas WHERE name = $1 AND trashed_at IS NULL LIMIT 1`;
        const schemaResult = await db.query(selectQuery, [schemaName]);

        if (schemaResult.rows.length === 0) {
            throw HttpErrors.notFound(`Schema '${schemaName}' not found`, 'SCHEMA_NOT_FOUND');
        }

        const schemaRecord = schemaResult.rows[0];
        const jsonDefinition = schemaRecord.definition;

        // Return JSON definition directly as an object
        return jsonDefinition;
    }

    /**
     * Update existing schema from JSON content
     */
    async updateOne(schemaName: string, jsonContent: any): Promise<any> {
        return await this.run('update', schemaName, async tx => {
            this.validateSchemaProtection(schemaName);

            const newJsonSchema = this.parseJsonSchema(jsonContent);
            const jsonChecksum = this.generateJsonChecksum(JSON.stringify(jsonContent));
            const fieldCount = Object.keys(newJsonSchema.properties).length;

            // Update schema describe record
            const updateQuery = `
                UPDATE schemas
                SET definition = $1, field_count = $2, json_checksum = $3, updated_at = NOW()
                WHERE name = $4
                RETURNING *
            `;

            const result = await tx.query(updateQuery, [JSON.stringify(newJsonSchema), fieldCount.toString(), jsonChecksum, schemaName]);

            if (result.rows.length === 0) {
                throw HttpErrors.notFound(`Schema '${schemaName}' not found`, 'SCHEMA_NOT_FOUND');
            }

            return { name: schemaName, updated: true };
        });
    }

    /**
     * Delete schema (soft delete)
     */
    async deleteOne(schemaName: string): Promise<any> {
        return await this.run('delete', schemaName, async tx => {
            this.validateSchemaProtection(schemaName);

            // Soft delete schema record
            const deleteQuery = `
                UPDATE schemas
                SET trashed_at = NOW(), updated_at = NOW()
                WHERE name = $1 AND trashed_at IS NULL
                RETURNING *
            `;

            const result = await tx.query(deleteQuery, [schemaName]);

            if (result.rows.length === 0) {
                throw HttpErrors.notFound(`Schema '${schemaName}' not found or already deleted`, 'SCHEMA_NOT_FOUND');
            }

            return { name: schemaName, deleted: true };
        });
    }

    /**
     * Restore soft-deleted schema
     */
    async revertOne(schemaName: string): Promise<any> {
        return await this.run('revert', schemaName, async tx => {
            // TODO: Implementation - restore soft-deleted schema
            throw HttpErrors.internal('Describe.revertOne() not yet implemented', 'NOT_IMPLEMENTED');
        });
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
     * Parse JSON content to JSON Schema (public method for route handlers)
     */
    parseSchema(jsonContent: any): JsonSchema {
        return this.parseJsonSchema(jsonContent);
    }

    /**
     * Parse JSON content to JSON Schema (internal implementation)
     */
    private parseJsonSchema(jsonContent: any): JsonSchema {
        if (!jsonContent || typeof jsonContent !== 'object') {
            throw HttpErrors.badRequest('Invalid schema definition format', 'SCHEMA_INVALID_FORMAT');
        }

        if (!jsonContent.title || !jsonContent.properties) {
            throw HttpErrors.badRequest('Schema must have title and properties', 'SCHEMA_MISSING_FIELDS');
        }

        return jsonContent as JsonSchema;
    }

    /**
     * Generate CREATE TABLE DDL from JSON Schema
     */
    private generateCreateTableDDL(tableName: string, jsonSchema: JsonSchema): string {
        const properties = jsonSchema.properties;
        const required = jsonSchema.required || [];

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

        // Schema-specific fields
        for (const [fieldName, property] of Object.entries(properties)) {
            // Skip system fields that are already defined
            if (isSystemField(fieldName)) {
                logger.warn(`Schema defines system field '${fieldName}' which is automatically managed by the platform. Ignoring user-defined version.`);
                continue;
            }

            const pgType = this.jsonSchemaTypeToPostgres(property);
            const isRequired = required.includes(fieldName);
            const nullable = isRequired ? ' NOT NULL' : '';

            let defaultValue = '';
            if (property.default !== undefined) {
                if (typeof property.default === 'string') {
                    const escapedDefault = property.default.replace(/'/g, "''");
                    defaultValue = ` DEFAULT '${escapedDefault}'`;
                } else if (typeof property.default === 'number') {
                    defaultValue = ` DEFAULT ${property.default}`;
                } else if (typeof property.default === 'boolean') {
                    defaultValue = ` DEFAULT ${property.default}`;
                }
            }

            ddl += `,\n    "${fieldName}" ${pgType}${nullable}${defaultValue}`;
        }

        ddl += `\n);`;
        return ddl;
    }

    /**
     * Convert JSON Schema property to PostgreSQL type
     */
    private jsonSchemaTypeToPostgres(property: JsonSchemaProperty): string {
        switch (property.type) {
            case 'string':
                if (property.format === 'uuid') {
                    return 'UUID';
                } else if (property.format === 'date-time') {
                    return 'TIMESTAMP';
                } else if (property.enum) {
                    return 'TEXT';
                } else if (property.maxLength && property.maxLength <= 255) {
                    return `VARCHAR(${property.maxLength})`;
                } else {
                    return 'TEXT';
                }
            case 'integer':
                return 'INTEGER';
            case 'number':
                return 'DECIMAL';
            case 'boolean':
                return 'BOOLEAN';
            case 'array':
                return 'JSONB';
            case 'object':
                return 'JSONB';
            default:
                return 'TEXT';
        }
    }

    /**
     * Validate that schema is not protected (system schema)
     */
    private validateSchemaProtection(schemaName: string): void {
        const protectedSchemas = ['schemas', 'users', 'columns'];
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

    /**
     * Generate JSON content checksum for cache invalidation
     */
    private generateJsonChecksum(jsonContent: string): string {
        return crypto.createHash('sha256').update(jsonContent).digest('hex');
    }

    /**
     * Insert schema describe record
     */
    private async insertSchemaRecord(tx: TxContext | DbContext, schemaName: string, tableName: string, jsonSchema: JsonSchema, jsonChecksum: string): Promise<void> {
        const fieldCount = Object.keys(jsonSchema.properties).length;

        const insertQuery = `
            INSERT INTO schemas
            (id, name, table_name, status, definition, field_count, json_checksum, created_at, updated_at, access_read, access_edit, access_full, access_deny)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW(), '{}', '{}', '{}', '{}')
            RETURNING *
        `;

        await tx.query(insertQuery, [schemaName, tableName, 'active', JSON.stringify(jsonSchema), fieldCount.toString(), jsonChecksum]);
    }

    /**
     * Insert column describe records for schema properties
     */
    private async insertColumnRecords(tx: TxContext | DbContext, schemaName: string, jsonSchema: JsonSchema): Promise<void> {
        if (!jsonSchema.properties || Object.keys(jsonSchema.properties).length === 0) {
            return; // No properties to process
        }

        const requiredFields = jsonSchema.required || [];

        for (const [columnName, columnDefinition] of Object.entries(jsonSchema.properties)) {
            // Validate column name
            this.validateColumnName(columnName);

            // Map JSON Schema type to PostgreSQL type
            const pgType = this.jsonSchemaTypeToPostgres(columnDefinition);
            const isRequired = requiredFields.includes(columnName) ? 'true' : 'false';
            const defaultValue = columnDefinition.default !== undefined ? String(columnDefinition.default) : null;

            // Extract constraint and relationship metadata
            const constraintData = this.extractConstraintData(columnDefinition);
            const relationshipData = this.extractRelationshipData(columnDefinition);

            const insertQuery = `
                INSERT INTO columns
                (id, schema_name, column_name, pg_type, is_required, default_value, relationship_type, related_schema, related_column, relationship_name, cascade_delete, required_relationship, minimum, maximum, pattern_regex, enum_values, is_array, description, created_at, updated_at, access_read, access_edit, access_full, access_deny)
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW(), '{}', '{}', '{}', '{}')
            `;

            await tx.query(insertQuery, [
                schemaName,
                columnName,
                pgType,
                isRequired,
                defaultValue,
                relationshipData.relationshipType,
                relationshipData.relatedSchema,
                relationshipData.relatedColumn,
                relationshipData.relationshipName,
                relationshipData.cascadeDelete,
                relationshipData.requiredRelationship,
                constraintData.minimum,
                constraintData.maximum,
                constraintData.patternRegex,
                constraintData.enumValues,
                constraintData.isArray,
                columnDefinition.description || null
            ]);
        }

        logger.info('Column records inserted', {
            schemaName,
            columnCount: Object.keys(jsonSchema.properties).length
        });
    }

    /**
     * Extract constraint data from JSON Schema property definition
     */
    private extractConstraintData(columnDefinition: any): any {
        return {
            minimum: columnDefinition.minLength ?? columnDefinition.minimum ?? null,
            maximum: columnDefinition.maxLength ?? columnDefinition.maximum ?? null,
            patternRegex: columnDefinition.pattern ?? null,
            enumValues: columnDefinition.enum ? columnDefinition.enum : null,
            isArray: columnDefinition.type === 'array'
        };
    }

    /**
     * Extract relationship metadata from JSON Schema property definition
     */
    private extractRelationshipData(columnDefinition: any): any {
        // Check for x-monk-relationship extension
        const xMonkRelationship = columnDefinition['x-monk-relationship'];

        if (xMonkRelationship) {
            return {
                relationshipType: xMonkRelationship.type,
                relatedSchema: xMonkRelationship.schema,
                relatedColumn: xMonkRelationship.column ?? 'id',
                relationshipName: xMonkRelationship.name,
                cascadeDelete: xMonkRelationship.cascadeDelete ?? (xMonkRelationship.type === 'owned'),
                requiredRelationship: xMonkRelationship.required ?? (xMonkRelationship.type === 'owned')
            };
        }

        return {
            relationshipType: null,
            relatedSchema: null,
            relatedColumn: null,
            relationshipName: null,
            cascadeDelete: false,
            requiredRelationship: false
        };
    }
}
