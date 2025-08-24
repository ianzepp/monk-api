import { builtins, type TxContext, type DbContext } from '@src/db/index.js';
import type { System } from '@lib/system.js';
import type { Context } from 'hono';
import * as yaml from 'js-yaml';
import crypto from 'crypto';

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
 * Metabase Class - Schema Definition Management
 * 
 * Handles schema YAML operations following the same patterns as Database class.
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
     * Create new schema from YAML content
     */
    async createOne(schemaName: string, yamlContent: string): Promise<any> {
        return await this.run('create', schemaName, async (tx: TxContext) => {
            const jsonSchema = this.parseYamlSchema(yamlContent);
            const tableName = jsonSchema.table || schemaName;
            
            // Validate schema protection
            this.validateSchemaProtection(schemaName);
            
            this.system.info('Creating schema', { schemaName, tableName });
            
            // Generate and execute DDL
            const ddl = this.generateCreateTableDDL(tableName, jsonSchema);
            await tx.query(ddl);
            
            // Insert schema metadata
            const yamlChecksum = this.generateYamlChecksum(yamlContent);
            await this.insertSchemaRecord(tx, schemaName, tableName, jsonSchema, yamlChecksum);
            
            this.system.info('Schema created successfully', { schemaName, tableName });
            
            return { name: schemaName, table: tableName, created: true };
        });
    }
    
    /**
     * Get schema as YAML content
     */
    async selectOne(schemaName: string): Promise<string> {
        const db = this.system.db;
        
        // Get schema record from database (exclude soft-deleted schemas)
        const selectQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1 AND trashed_at IS NULL LIMIT 1`;
        const schemaResult = await db.query(selectQuery, [schemaName]);

        if (schemaResult.rows.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        const schemaRecord = schemaResult.rows[0];
        const jsonDefinition = schemaRecord.definition;

        // Convert JSON definition back to YAML
        const yamlOutput = yaml.dump(jsonDefinition, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false
        });

        return yamlOutput;
    }
    
    /**
     * Update existing schema from YAML content
     */
    async updateOne(schemaName: string, yamlContent: string): Promise<any> {
        return await this.run('update', schemaName, async (tx: TxContext) => {
            this.validateSchemaProtection(schemaName);
            
            const newJsonSchema = this.parseYamlSchema(yamlContent);
            const yamlChecksum = this.generateYamlChecksum(yamlContent);
            const fieldCount = Object.keys(newJsonSchema.properties).length;
            
            // Update schema metadata record
            const updateQuery = `
                UPDATE ${builtins.TABLE_NAMES.schema} 
                SET definition = $1, field_count = $2, yaml_checksum = $3, updated_at = NOW()
                WHERE name = $4
                RETURNING *
            `;
            
            const result = await tx.query(updateQuery, [
                JSON.stringify(newJsonSchema),
                fieldCount.toString(),
                yamlChecksum,
                schemaName
            ]);
            
            if (result.rows.length === 0) {
                throw new Error(`Schema '${schemaName}' not found`);
            }
            
            return { name: schemaName, updated: true };
        });
    }
    
    /**
     * Delete schema (soft delete)
     */
    async deleteOne(schemaName: string): Promise<any> {
        return await this.run('delete', schemaName, async (tx: TxContext) => {
            this.validateSchemaProtection(schemaName);
            
            // Soft delete schema record
            const deleteQuery = `
                UPDATE ${builtins.TABLE_NAMES.schema} 
                SET trashed_at = NOW(), updated_at = NOW()
                WHERE name = $1 AND trashed_at IS NULL
                RETURNING *
            `;
            
            const result = await tx.query(deleteQuery, [schemaName]);
            
            if (result.rows.length === 0) {
                throw new Error(`Schema '${schemaName}' not found or already deleted`);
            }
            
            return { name: schemaName, deleted: true };
        });
    }
    
    /**
     * Restore soft-deleted schema
     */
    async revertOne(schemaName: string): Promise<any> {
        return await this.run('revert', schemaName, async (tx: TxContext) => {
            // TODO: Implementation - restore soft-deleted schema
            throw new Error('Metabase.revertOne() not yet implemented');
        });
    }
    
    /**
     * Transaction management pattern (consistent with Database class)
     */
    private async run(
        operation: string,
        schemaName: string,
        fn: (tx: TxContext) => Promise<any>
    ): Promise<any> {
        const db = this.system.db;
        
        console.debug(`🔄 Starting metabase operation: ${operation} on schema ${schemaName}`);
        
        // Start transaction  
        const client = await db.connect();
        
        if (!client) {
            throw new Error('Unable to get database client');
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
     * Parse YAML content to JSON Schema (public method for route handlers)
     */
    parseYaml(yamlContent: string): JsonSchema {
        return this.parseYamlSchema(yamlContent);
    }
    
    /**
     * Parse YAML content to JSON Schema (internal implementation)
     */
    private parseYamlSchema(yamlContent: string): JsonSchema {
        const jsonSchema = yaml.load(yamlContent) as JsonSchema;
        
        if (!jsonSchema || typeof jsonSchema !== 'object') {
            throw new Error('Invalid schema definition format');
        }

        if (!jsonSchema.title || !jsonSchema.properties) {
            throw new Error('Schema must have title and properties');
        }

        return jsonSchema;
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
        ddl += `    "tenant" TEXT,\n`;
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
        const protectedSchemas = ['schema', 'users', 'columns'];
        if (protectedSchemas.includes(schemaName)) {
            throw new Error(`Schema '${schemaName}' is protected and cannot be modified`);
        }
    }
    
    /**
     * Generate YAML content checksum for cache invalidation
     */
    private generateYamlChecksum(yamlContent: string): string {
        return crypto.createHash('sha256').update(yamlContent).digest('hex');
    }
    
    /**
     * Insert schema metadata record
     */
    private async insertSchemaRecord(
        tx: TxContext,
        schemaName: string,
        tableName: string,
        jsonSchema: JsonSchema,
        yamlChecksum: string
    ): Promise<void> {
        const fieldCount = Object.keys(jsonSchema.properties).length;
        
        const insertQuery = `
            INSERT INTO ${builtins.TABLE_NAMES.schema} 
            (id, name, table_name, status, definition, field_count, yaml_checksum, created_at, updated_at, tenant, access_read, access_edit, access_full, access_deny)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW(), NULL, '{}', '{}', '{}', '{}')
            RETURNING *
        `;
        
        await tx.query(insertQuery, [
            schemaName,
            tableName, 
            'active',
            JSON.stringify(jsonSchema),
            fieldCount.toString(),
            yamlChecksum
        ]);
    }
}