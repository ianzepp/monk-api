import type { Context } from 'hono';
import { db, schema, type TxContext } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import * as yaml from 'js-yaml';
import {
    createSuccessResponse,
    createNotFoundError,
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
    const schemaName = c.req.param('name');

    try {
        // Parse YAML content
        const yamlContent = await c.req.text();
        let newJsonSchema: JsonSchema;
        
        try {
            newJsonSchema = yaml.load(yamlContent) as JsonSchema;
        } catch (yamlError) {
            return createValidationError(c, 'YAML parsing error', [{
                path: ['yaml'],
                message: yamlError instanceof Error ? yamlError.message : 'Invalid YAML format'
            }]);
        }

        // Use transaction for write operation
        const result = await db.transaction(async (tx: TxContext) => {
            // 1. Get existing schema
            const existingSchema = await tx
                .select()
                .from(schema.schemas)
                .where(eq(schema.schemas.name, schemaName))
                .limit(1);

            if (existingSchema.length === 0) {
                throw new Error(`Schema not found: ${schemaName}`);
            }

            const tableName = existingSchema[0].table_name;
            const oldDefinition = existingSchema[0].definition as JsonSchema;

            // 2. Generate ALTER TABLE statements
            const alterStatements = generateSchemaAlterDDL(tableName, oldDefinition, newJsonSchema);

            // 3. Apply database changes
            for (const ddl of alterStatements) {
                if (ddl.trim()) {
                    console.log('Executing DDL:', ddl);
                    await tx.execute(sql.raw(ddl));
                }
            }

            // 4. Update schema registry
            await tx
                .update(schema.schemas)
                .set({
                    definition: newJsonSchema,
                    field_count: Object.keys(newJsonSchema.properties).length.toString(),
                })
                .where(eq(schema.schemas.name, schemaName));

            // 5. Update column registry (remove old, add new)
            await tx
                .delete(schema.columns)
                .where(eq(schema.columns.schema_name, schemaName));

            // Add updated column metadata
            for (const [fieldName, property] of Object.entries(newJsonSchema.properties)) {
                const columnRecord = {
                    schema_name: schemaName,
                    column_name: fieldName,
                    pg_type: jsonSchemaTypeToPostgres(property),
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
                };
                await tx.insert(schema.columns).values(columnRecord);
            }

            // 6. Return updated schema
            const updatedSchema = await tx
                .select()
                .from(schema.schemas)
                .where(eq(schema.schemas.name, schemaName))
                .limit(1);

            return updatedSchema[0];
        });

        return createSuccessResponse(c, result);
    } catch (error) {
        console.error('Error updating schema:', error);
        if (error instanceof Error && error.message.includes('not found')) {
            return createNotFoundError(c, 'Schema', schemaName);
        }
        return createInternalError(c, 'Failed to update schema');
    }
}

// Helper function to generate ALTER TABLE DDL for schema evolution
function generateSchemaAlterDDL(
    tableName: string,
    oldSchema: JsonSchema,
    newSchema: JsonSchema
): string[] {
    const statements: string[] = [];
    const oldProps = oldSchema.properties;
    const newProps = newSchema.properties;
    const oldRequired = oldSchema.required || [];
    const newRequired = newSchema.required || [];

    // Add new columns
    for (const [fieldName, property] of Object.entries(newProps)) {
        if (!oldProps[fieldName]) {
            const pgType = jsonSchemaTypeToPostgres(property);
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

    // Note constraint changes (non-destructive - affects new data only)
    for (const [fieldName, newProperty] of Object.entries(newProps)) {
        const oldProperty = oldProps[fieldName];
        if (oldProperty) {
            const oldConstraints = JSON.stringify({
                minLength: oldProperty.minLength,
                maxLength: oldProperty.maxLength,
                pattern: oldProperty.pattern,
                enum: oldProperty.enum
            });
            const newConstraints = JSON.stringify({
                minLength: newProperty.minLength,
                maxLength: newProperty.maxLength,
                pattern: newProperty.pattern,
                enum: newProperty.enum
            });
            
            if (oldConstraints !== newConstraints) {
                console.log(`Note: Validation constraints changed for field '${fieldName}' - affects new data only`);
            }
        }
    }

    return statements;
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