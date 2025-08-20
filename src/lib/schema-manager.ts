import { builtins, type TxContext } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
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
        try {
            const jsonSchema = yaml.load(yamlContent) as JsonSchema;
            
            if (!jsonSchema || typeof jsonSchema !== 'object') {
                throw new Error('Invalid schema definition format');
            }

            if (!jsonSchema.title || !jsonSchema.properties) {
                throw new Error('Schema must have title and properties');
            }

            return jsonSchema;
        } catch (yamlError) {
            throw new Error(`YAML parsing error: ${yamlError instanceof Error ? yamlError.message : 'Invalid YAML format'}`);
        }
    }

    // Create new schema with table
    static async createSchema(tx: TxContext, yamlContent: string): Promise<any> {
        const jsonSchema = this.parseYamlSchema(yamlContent);
        const schemaName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
        const tableName = `${schemaName}s`;

        // Generate YAML checksum for cache invalidation
        const yamlChecksum = crypto.createHash('sha256').update(yamlContent).digest('hex');

        // Create schema record
        const schemaRecord = await tx.insert(builtins.schemas).values({
            name: schemaName,
            table_name: tableName,
            status: 'active',
            definition: jsonSchema,
            field_count: Object.keys(jsonSchema.properties).length.toString(),
            yaml_checksum: yamlChecksum
        }).returning();

        // Generate and execute CREATE TABLE DDL
        const ddl = this.generateCreateTableDDL(tableName, jsonSchema);
        await tx.execute(sql.raw(ddl));

        return schemaRecord[0];
    }

    // Update existing schema with non-destructive evolution
    static async updateSchema(tx: TxContext, schemaName: string, yamlContent: string): Promise<any> {
        const newJsonSchema = this.parseYamlSchema(yamlContent);
        
        // Get existing schema
        const existingSchema = await tx
            .select()
            .from(builtins.schemas)
            .where(eq(builtins.schemas.name, schemaName))
            .limit(1);

        if (existingSchema.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        const tableName = existingSchema[0].table_name;
        const oldDefinition = existingSchema[0].definition as JsonSchema;

        // Generate ALTER TABLE statements
        const alterStatements = this.generateSchemaAlterDDL(tableName, oldDefinition, newJsonSchema);

        // Apply database changes
        for (const ddl of alterStatements) {
            if (ddl.trim()) {
                console.log('Executing DDL:', ddl);
                await tx.execute(sql.raw(ddl));
            }
        }

        // Generate YAML checksum for cache invalidation
        const yamlChecksum = crypto.createHash('sha256').update(yamlContent).digest('hex');

        // Update schema registry
        await tx
            .update(builtins.schemas)
            .set({
                definition: newJsonSchema,
                field_count: Object.keys(newJsonSchema.properties).length.toString(),
                yaml_checksum: yamlChecksum
            })
            .where(eq(builtins.schemas.name, schemaName));

        // Update column registry
        await tx.delete(builtins.columns).where(eq(builtins.columns.schema_name, schemaName));

        for (const [fieldName, property] of Object.entries(newJsonSchema.properties)) {
            await tx.insert(builtins.columns).values({
                schema_name: schemaName,
                column_name: fieldName,
                pg_type: this.jsonSchemaTypeToPostgres(property),
                is_required: (newJsonSchema.required || []).includes(fieldName) ? 'true' : 'false',
                default_value: property.default?.toString() || null,
                constraints: JSON.stringify({
                    minLength: property.minLength,
                    maxLength: property.maxLength,
                    minimum: property.minimum,
                    maximum: property.maximum,
                    enum: property.enum,
                    format: property.format,
                    pattern: property.pattern,
                }),
                foreign_key: property['x-paas']?.foreign_key ? JSON.stringify(property['x-paas'].foreign_key) : null,
                description: property.description || null,
            });
        }

        return (await tx.select().from(builtins.schemas).where(eq(builtins.schemas.name, schemaName)).limit(1))[0];
    }

    // Delete schema with dependency checking
    static async deleteSchema(tx: TxContext, schemaName: string): Promise<any> {
        // Get schema info
        const schemaRecord = await tx
            .select()
            .from(builtins.schemas)
            .where(eq(builtins.schemas.name, schemaName))
            .limit(1);

        if (schemaRecord.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        const tableName = schemaRecord[0].table_name;

        // Check for dependencies
        const dependentSchemas = await tx
            .select({
                schemaName: builtins.schemas.name,
                tableName: builtins.schemas.table_name
            })
            .from(builtins.schemas)
            .where(sql`definition::text LIKE ${`%"table": "${tableName}"%`}`);

        if (dependentSchemas.length > 0) {
            const dependentNames = dependentSchemas.map(s => s.schemaName).join(', ');
            throw new Error(`Cannot delete schema '${schemaName}' - referenced by: ${dependentNames}. Delete dependent schemas first.`);
        }

        // Drop table and clean up
        await tx.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)}`);
        await tx.delete(builtins.columns).where(eq(builtins.columns.schema_name, schemaName));
        await tx.delete(builtins.schemas).where(eq(builtins.schemas.name, schemaName));

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
        ddl += `    "updated_at" TIMESTAMP DEFAULT now() NOT NULL`;

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