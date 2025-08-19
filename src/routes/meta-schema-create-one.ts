import type { Context } from 'hono';
import { db, schema, type TxContext } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import * as yaml from 'js-yaml';
import {
    createSuccessResponse,
    createValidationError,
    createInternalError,
} from '../lib/api/responses.js';

interface JsonSchemaProperty {
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

interface JsonSchema {
    title: string;
    description?: string;
    type: 'object';
    required?: string[];
    properties: Record<string, JsonSchemaProperty>;
}

export default async function (c: Context): Promise<any> {
    try {
        // Parse YAML content 
        const yamlContent = await c.req.text();
        let jsonSchema: JsonSchema;
        
        try {
            jsonSchema = yaml.load(yamlContent) as JsonSchema;
        } catch (yamlError) {
            return createValidationError(c, 'YAML parsing error', [{
                path: ['yaml'],
                message: yamlError instanceof Error ? yamlError.message : 'Invalid YAML format'
            }]);
        }

        // Basic validation
        if (!jsonSchema || typeof jsonSchema !== 'object') {
            return createValidationError(c, 'Invalid schema definition format', []);
        }

        if (!jsonSchema.title || !jsonSchema.properties) {
            return createValidationError(c, 'Schema must have title and properties', []);
        }

        // Use transaction for write operation
        const result = await db.transaction(async (tx: TxContext) => {
            // Extract schema name from title
            const schemaName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
            const tableName = `${schemaName}s`;

            // Create schema record
            const schemaRecord = await tx.insert(schema.schemas).values({
                name: schemaName,
                table_name: tableName,
                status: 'active',
                definition: jsonSchema,
                field_count: Object.keys(jsonSchema.properties).length.toString()
            }).returning();

            // Generate CREATE TABLE DDL
            const ddl = generateCreateTableDDL(tableName, jsonSchema);
            
            // Create the actual table
            await tx.execute(sql.raw(ddl));

            return schemaRecord[0];
        });

        return createSuccessResponse(c, result, 201);
    } catch (error) {
        console.error('Error creating schema:', error);
        return createInternalError(c, 'Failed to create schema');
    }
}

// Helper function to generate CREATE TABLE DDL
function generateCreateTableDDL(tableName: string, jsonSchema: JsonSchema): string {
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
        const pgType = jsonSchemaTypeToPostgres(property);
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

// Helper function to convert JSON Schema types to PostgreSQL types
function jsonSchemaTypeToPostgres(property: JsonSchemaProperty): string {
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