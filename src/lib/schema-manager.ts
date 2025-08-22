import { builtins, type TxContext } from '../db/index.js';
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
            on_delete?: string;
        };
    };
}

export interface JsonSchema {
    title: string;
    description?: string;
    type: 'object';
    required?: string[];
    properties: Record<string, JsonSchemaProperty>;
}

/**
 * Schema management utilities - centralized logic for meta operations
 */
export class SchemaManager {
    // Parse and validate YAML schema
    static parseYamlSchema(yamlContent: string): JsonSchema {
        const jsonSchema = yaml.load(yamlContent) as JsonSchema;
        
        if (!jsonSchema || typeof jsonSchema !== 'object') {
            throw new Error('Invalid schema definition format');
        }

        if (!jsonSchema.title || !jsonSchema.properties) {
            throw new Error('Schema must have title and properties');
        }

        return jsonSchema;
    }

    // Create new schema with table
    static async createSchema(tx: TxContext, yamlContent: string): Promise<any> {
        console.warn('Starting createSchema');

        const jsonSchema = this.parseYamlSchema(yamlContent);
        const schemaName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
        const tableName = `${schemaName}s`;

        // Generate YAML checksum for cache invalidation
        const yamlChecksum = crypto.createHash('sha256').update(yamlContent).digest('hex');

        // Create schema record
        console.warn('Inserting to DB', jsonSchema);

        const insertQuery = `
            INSERT INTO ${builtins.TABLE_NAMES.schemas} 
            (id, name, table_name, status, definition, field_count, yaml_checksum, created_at, updated_at, domain, access_read, access_edit, access_full, access_deny)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW(), NULL, '{}', '{}', '{}', '{}')
            RETURNING *
        `;
        
        const schemaResult = await tx.query(insertQuery, [
            schemaName,
            tableName, 
            'active',
            JSON.stringify(jsonSchema),
            Object.keys(jsonSchema.properties).length.toString(),
            yamlChecksum
        ]);

        // Generate and execute CREATE TABLE DDL
        const ddl = this.generateCreateTableDDL(tableName, jsonSchema);
        await tx.query(ddl);

        return schemaResult.rows[0];
    }

    // Update existing schema with non-destructive evolution
    static async updateSchema(tx: TxContext, schemaName: string, yamlContent: string): Promise<any> {
        const newJsonSchema = this.parseYamlSchema(yamlContent);
        
        // Get existing schema
        const existingQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schemas} WHERE name = $1 LIMIT 1`;
        const existingResult = await tx.query(existingQuery, [schemaName]);

        if (existingResult.rows.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        const existingSchema = existingResult.rows;

        const tableName = existingSchema[0].table_name;
        const oldDefinition = existingSchema[0].definition as JsonSchema;

        // Generate ALTER TABLE statements
        const alterStatements = this.generateSchemaAlterDDL(tableName, oldDefinition, newJsonSchema);

        // Apply database changes
        for (const ddl of alterStatements) {
            if (ddl.trim()) {
                console.log('Executing DDL:', ddl);
                await tx.query(ddl);
            }
        }

        // Generate YAML checksum for cache invalidation
        const yamlChecksum = crypto.createHash('sha256').update(yamlContent).digest('hex');

        // Update schema registry
        const updateQuery = `
            UPDATE ${builtins.TABLE_NAMES.schemas} 
            SET definition = $1, field_count = $2, yaml_checksum = $3, updated_at = NOW() 
            WHERE name = $4
        `;
        
        await tx.query(updateQuery, [
            JSON.stringify(newJsonSchema),
            Object.keys(newJsonSchema.properties).length.toString(),
            yamlChecksum,
            schemaName
        ]);

        // Update column registry
        const deleteColumnsQuery = `DELETE FROM ${builtins.TABLE_NAMES.columns} WHERE schema_name = $1`;
        await tx.query(deleteColumnsQuery, [schemaName]);

        // Insert new column records
        const insertColumnQuery = `
            INSERT INTO ${builtins.TABLE_NAMES.columns} 
            (id, schema_name, column_name, pg_type, is_required, default_value, constraints, foreign_key, description, created_at, updated_at, domain, access_read, access_edit, access_full, access_deny)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NULL, '{}', '{}', '{}', '{}')
        `;

        for (const [fieldName, property] of Object.entries(newJsonSchema.properties)) {
            await tx.query(insertColumnQuery, [
                schemaName,
                fieldName,
                this.jsonSchemaTypeToPostgres(property),
                (newJsonSchema.required || []).includes(fieldName) ? 'true' : 'false',
                property.default?.toString() || null,
                JSON.stringify({
                    minLength: property.minLength,
                    maxLength: property.maxLength,
                    minimum: property.minimum,
                    maximum: property.maximum,
                    enum: property.enum,
                    format: property.format,
                    pattern: property.pattern,
                }),
                property['x-paas']?.foreign_key ? JSON.stringify(property['x-paas'].foreign_key) : null,
                property.description || null,
            ]);
        }

        const updatedSchemaQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schemas} WHERE name = $1 LIMIT 1`;
        const updatedResult = await tx.query(updatedSchemaQuery, [schemaName]);
        return updatedResult.rows[0];
    }

    // Delete schema with dependency checking
    static async deleteSchema(tx: TxContext, schemaName: string): Promise<any> {
        // Get schema info
        const schemaQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schemas} WHERE name = $1 LIMIT 1`;
        const schemaResult = await tx.query(schemaQuery, [schemaName]);

        if (schemaResult.rows.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        const tableName = schemaResult.rows[0].table_name;

        // Check for dependencies
        const dependencyQuery = `
            SELECT name as schemaName, table_name as tableName 
            FROM ${builtins.TABLE_NAMES.schemas} 
            WHERE definition::text LIKE $1
        `;
        const dependentResult = await tx.query(dependencyQuery, [`%"table": "${tableName}"%`]);

        if (dependentResult.rows.length > 0) {
            const dependentNames = dependentResult.rows.map(s => s.schemaname).join(', ');
            throw new Error(`Cannot delete schema '${schemaName}' - referenced by: ${dependentNames}. Delete dependent schemas first.`);
        }

        // Drop table and clean up
        await tx.query(`DROP TABLE IF EXISTS "${tableName}"`);
        await tx.query(`DELETE FROM ${builtins.TABLE_NAMES.columns} WHERE schema_name = $1`, [schemaName]);
        await tx.query(`DELETE FROM ${builtins.TABLE_NAMES.schemas} WHERE name = $1`, [schemaName]);

        return {
            deleted_schema: schemaName,
            dropped_table: tableName,
            deleted_at: new Date().toISOString(),
        };
    }

    // Helper: Generate CREATE TABLE DDL
    private static generateCreateTableDDL(tableName: string, jsonSchema: JsonSchema): string {
        const properties = jsonSchema.properties;
        const required = jsonSchema.required || [];

        let ddl = `CREATE TABLE "${tableName}" (\n`;
        
        // Standard PaaS fields
        ddl += `    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
        ddl += `    "domain" TEXT,\n`;
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
        
        // Add foreign key constraints
        for (const [fieldName, property] of Object.entries(properties)) {
            if (property['x-paas']?.foreign_key) {
                const fk = property['x-paas'].foreign_key;
                const onDelete = fk.on_delete ? ` ON DELETE ${fk.on_delete.toUpperCase()}` : '';
                ddl += `\n\nALTER TABLE "${tableName}" ADD CONSTRAINT "fk_${tableName}_${fieldName}" `;
                ddl += `FOREIGN KEY ("${fieldName}") REFERENCES "${fk.table}" ("${fk.column}")${onDelete};`;
            }
        }

        return ddl;
    }

    // Helper: Generate ALTER TABLE DDL for schema evolution
    private static generateSchemaAlterDDL(tableName: string, oldSchema: JsonSchema, newSchema: JsonSchema): string[] {
        const statements: string[] = [];
        const oldProps = oldSchema.properties;
        const newProps = newSchema.properties;
        const newRequired = newSchema.required || [];

        // Add new columns
        for (const [fieldName, property] of Object.entries(newProps)) {
            if (!oldProps[fieldName]) {
                const pgType = this.jsonSchemaTypeToPostgres(property);
                const isRequired = newRequired.includes(fieldName);
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

                statements.push(`ALTER TABLE "${tableName}" ADD COLUMN "${fieldName}" ${pgType}${nullable}${defaultValue};`);
            }
        }

        // Drop removed columns
        for (const fieldName of Object.keys(oldProps)) {
            if (!newProps[fieldName]) {
                statements.push(`ALTER TABLE "${tableName}" DROP COLUMN IF EXISTS "${fieldName}";`);
            }
        }

        return statements;
    }

    // Helper: Convert JSON Schema types to PostgreSQL types
    private static jsonSchemaTypeToPostgres(property: JsonSchemaProperty): string {
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
}