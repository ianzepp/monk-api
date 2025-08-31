import crypto from 'crypto';
import pg from 'pg';

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
    'x-paas'?: {
        foreign_key?: {
            table: string;
            column: string;
        };
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
 * Metabase Class - Schema Definition Management
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
export class Metabase {
    constructor(private system: System) {}

    /**
     * Create new schema from JSON content
     */
    async createOne(schemaName: string, jsonContent: any): Promise<any> {
        return await this.run('create', schemaName, async (tx: pg.PoolClient) => {
            const jsonSchema = this.parseJsonSchema(jsonContent);
            const tableName = jsonSchema.table || schemaName;

            // Validate schema protection
            this.validateSchemaProtection(schemaName);

            logger.info('Creating schema', { schemaName, tableName });

            // Generate and execute DDL
            const ddl = this.generateCreateTableDDL(tableName, jsonSchema);
            await tx.query(ddl);

            // Insert schema metadata
            const jsonChecksum = this.generateJsonChecksum(JSON.stringify(jsonContent));
            await this.insertSchemaRecord(tx, schemaName, tableName, jsonSchema, jsonChecksum);

            logger.info('Schema created successfully', { schemaName, tableName });

            return { name: schemaName, table: tableName, created: true };
        });
    }

    /**
     * Get schema as JSON content
     */
    async selectOne(schemaName: string): Promise<string> {
        const db = this.system.db;

        // Get schema record from database (exclude soft-deleted schemas)
        const selectQuery = `SELECT * FROM schemas WHERE name = $1 AND trashed_at IS NULL LIMIT 1`;
        const schemaResult = await db.query(selectQuery, [schemaName]);

        if (schemaResult.rows.length === 0) {
            throw HttpErrors.notFound(`Schema '${schemaName}' not found`, 'SCHEMA_NOT_FOUND');
        }

        const schemaRecord = schemaResult.rows[0];
        const jsonDefinition = schemaRecord.definition;

        // Return JSON definition as compressed JSON string
        const jsonOutput = JSON.stringify(jsonDefinition);

        return jsonOutput;
    }

    /**
     * Update existing schema from JSON content
     */
    async updateOne(schemaName: string, jsonContent: any): Promise<any> {
        return await this.run('update', schemaName, async (tx: pg.PoolClient) => {
            this.validateSchemaProtection(schemaName);

            const newJsonSchema = this.parseJsonSchema(jsonContent);
            const jsonChecksum = this.generateJsonChecksum(JSON.stringify(jsonContent));
            const fieldCount = Object.keys(newJsonSchema.properties).length;

            // Update schema metadata record
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
        return await this.run('delete', schemaName, async (tx: pg.PoolClient) => {
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
        return await this.run('revert', schemaName, async (tx: pg.PoolClient) => {
            // TODO: Implementation - restore soft-deleted schema
            throw HttpErrors.internal('Metabase.revertOne() not yet implemented', 'NOT_IMPLEMENTED');
        });
    }

    /**
     * Transaction management pattern (consistent with Database class)
     */
    private async run(operation: string, schemaName: string, fn: (tx: pg.PoolClient) => Promise<any>): Promise<any> {
        const db = this.system.db;

        console.debug(`🔄 Starting metabase operation: ${operation} on schema ${schemaName}`);

        // Start transaction
        const client = await db.connect();

        if (!client) {
            throw HttpErrors.internal('Unable to get database client', 'DATABASE_CONNECTION_ERROR');
        }

        try {
            await client.query('BEGIN');

            const result = await fn(client);

            await client.query('COMMIT');
            console.debug(`✅ Metabase operation completed: ${operation} on ${schemaName}`);

            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`💥 Metabase operation failed: ${operation} on ${schemaName}`, error);
            throw error;
        } finally {
            client.release();
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
     * Generate JSON content checksum for cache invalidation
     */
    private generateJsonChecksum(jsonContent: string): string {
        return crypto.createHash('sha256').update(jsonContent).digest('hex');
    }

    /**
     * Insert schema metadata record
     */
    private async insertSchemaRecord(tx: pg.PoolClient, schemaName: string, tableName: string, jsonSchema: JsonSchema, jsonChecksum: string): Promise<void> {
        const fieldCount = Object.keys(jsonSchema.properties).length;

        const insertQuery = `
            INSERT INTO schemas
            (id, name, table_name, status, definition, field_count, json_checksum, created_at, updated_at, access_read, access_edit, access_full, access_deny)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW(), '{}', '{}', '{}', '{}')
            RETURNING *
        `;

        await tx.query(insertQuery, [schemaName, tableName, 'active', JSON.stringify(jsonSchema), fieldCount.toString(), jsonChecksum]);
    }
}
