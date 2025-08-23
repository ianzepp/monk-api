import { builtins, type TxContext, type DbContext } from '@src/db/index.js';
import { DatabaseManager } from './database-manager.js';
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
 * Schema Meta YAML - Direct YAML-based schema operations for meta API
 * Bypasses System/Database abstractions for clean YAML input/output
 */
export class SchemaMetaYAML {
    // Get database connection from Hono context
    private static async getDatabaseFromContext(context: Context): Promise<DbContext> {
        const payload = context.get('jwtPayload') as any;
        const databaseName = payload?.database;
        
        if (!databaseName) {
            throw new Error('No database context available');
        }
        
        return await DatabaseManager.getDatabaseForDomain(databaseName);
    }

    // Get transaction from database connection
    private static async getTransaction(db: DbContext): Promise<TxContext> {
        return await db.connect();
    }

    // Check schema status and existence in one query
    private static async getSchemaStatus(db: DbContext | TxContext, schemaName: string): Promise<{exists: boolean, isSystem: boolean}> {
        const statusQuery = `SELECT status FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1 LIMIT 1`;
        const statusResult = await db.query(statusQuery, [schemaName]);
        
        if (statusResult.rows.length === 0) {
            return {exists: false, isSystem: false};
        }
        
        return {
            exists: true,
            isSystem: statusResult.rows[0].status === 'system'
        };
    }

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
            INSERT INTO ${builtins.TABLE_NAMES.schema} 
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

    // Select schema and return as YAML
    static async selectSchema(db: DbContext | TxContext, schemaName: string): Promise<string> {
        // Get schema record from database
        const selectQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1 LIMIT 1`;
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

    // High-level method: Create schema from YAML and return created schema as YAML
    static async createSchemaFromYaml(context: Context, yamlContent: string): Promise<Response> {
        try {
            // Validate content-type
            const contentType = context.req.header('content-type');
            if (!contentType || (!contentType.includes('text/yaml') && !contentType.includes('application/yaml') && !contentType.includes('text/plain'))) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Content-Type must be text/yaml, application/yaml, or text/plain',
                    error_code: 'INVALID_CONTENT_TYPE'
                }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 400
                });
            }

            const db = await this.getDatabaseFromContext(context);
            const tx = await this.getTransaction(db);
            
            try {
                // Validate YAML before transaction
                const jsonSchema = this.parseYamlSchema(yamlContent);
                const schemaName = jsonSchema.title.toLowerCase().replace(/\s+/g, '_');
                
                // Protect system schema names from being used
                if (schemaName === 'schema') {
                    throw new Error('Cannot create schema with reserved system name "schema"');
                }
                
                // Check schema status and existence
                const {exists, isSystem} = await this.getSchemaStatus(tx, schemaName);
                
                if (exists) {
                    throw new Error(`Schema '${schemaName}' already exists`);
                }
                
                console.debug('Delegating to createSchema()');
                await this.createSchema(tx, yamlContent);
                
                await tx.query('COMMIT');
                tx.release();
                
                // Return the created schema as YAML (fetch it back)
                const createdYaml = await this.selectSchema(db, schemaName);
                
                return new Response(createdYaml, {
                    headers: { 'Content-Type': 'text/yaml' },
                    status: 201
                });
            } catch (error) {
                await tx.query('ROLLBACK');
                tx.release();
                throw error;
            }
        } catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Schema creation failed',
                error_code: 'SCHEMA_CREATE_FAILED'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
    }

    // High-level method: Get schema as YAML (for routes to call directly)
    static async getSchemaAsYaml(context: Context, schemaName: string): Promise<Response> {
        try {
            const db = await this.getDatabaseFromContext(context);
            const yamlOutput = await this.selectSchema(db, schemaName);
            
            return new Response(yamlOutput, {
                headers: { 'Content-Type': 'text/yaml' },
                status: 200
            });
        } catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Schema not found',
                error_code: 'SCHEMA_NOT_FOUND'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }
    }

    // High-level method: Update schema from YAML and return updated schema as YAML
    static async updateSchemaFromYaml(context: Context, schemaName: string, yamlContent: string): Promise<Response> {
        try {
            // Validate content-type
            const contentType = context.req.header('content-type');
            if (!contentType || (!contentType.includes('text/yaml') && !contentType.includes('application/yaml') && !contentType.includes('text/plain'))) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Content-Type must be text/yaml, application/yaml, or text/plain',
                    error_code: 'INVALID_CONTENT_TYPE'
                }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 400
                });
            }

            const db = await this.getDatabaseFromContext(context);
            const tx = await this.getTransaction(db);
            
            try {
                // Validate YAML before transaction
                this.parseYamlSchema(yamlContent);
                
                // Check schema status and existence
                const {exists, isSystem} = await this.getSchemaStatus(tx, schemaName);
                
                if (!exists) {
                    throw new Error(`Schema '${schemaName}' not found`);
                }
                
                if (isSystem) {
                    throw new Error('System schemas are protected and cannot be modified via meta API');
                }
                
                console.debug('Delegating to updateSchema()');
                await this.updateSchema(tx, schemaName, yamlContent);
                
                await tx.query('COMMIT');
                tx.release();
                
                // Return the updated schema as YAML (fetch it back)
                const updatedYaml = await this.selectSchema(db, schemaName);
                
                return new Response(updatedYaml, {
                    headers: { 'Content-Type': 'text/yaml' },
                    status: 200
                });
            } catch (error) {
                await tx.query('ROLLBACK');
                tx.release();
                throw error;
            }
        } catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Schema update failed',
                error_code: 'SCHEMA_UPDATE_FAILED'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
    }

    // High-level method: Delete schema and return no content
    static async deleteSchemaByName(context: Context, schemaName: string): Promise<Response> {
        try {
            const db = await this.getDatabaseFromContext(context);
            const tx = await this.getTransaction(db);
            
            try {
                // Check schema status and existence
                const {exists, isSystem} = await this.getSchemaStatus(tx, schemaName);
                
                if (!exists) {
                    throw new Error(`Schema '${schemaName}' not found`);
                }
                
                if (isSystem) {
                    throw new Error('System schemas are protected and cannot be deleted via meta API');
                }
                
                console.debug('Delegating to deleteSchema()');
                await this.deleteSchema(tx, schemaName);
                
                await tx.query('COMMIT');
                tx.release();
                
                // Return no content for successful deletion
                return new Response(null, {
                    status: 204
                });
            } catch (error) {
                await tx.query('ROLLBACK');
                tx.release();
                throw error;
            }
        } catch (error) {
            return new Response(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Schema deletion failed',
                error_code: 'SCHEMA_DELETE_FAILED'
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }
    }

    // Update existing schema with non-destructive evolution
    static async updateSchema(tx: TxContext, schemaName: string, yamlContent: string): Promise<any> {
        const newJsonSchema = this.parseYamlSchema(yamlContent);
        
        // Get existing schema
        const existingQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1 LIMIT 1`;
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
            UPDATE ${builtins.TABLE_NAMES.schema} 
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

        const updatedSchemaQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1 LIMIT 1`;
        const updatedResult = await tx.query(updatedSchemaQuery, [schemaName]);
        return updatedResult.rows[0];
    }

    // Delete schema with dependency checking
    static async deleteSchema(tx: TxContext, schemaName: string): Promise<any> {
        // Get schema info
        const schemaQuery = `SELECT * FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1 LIMIT 1`;
        const schemaResult = await tx.query(schemaQuery, [schemaName]);

        if (schemaResult.rows.length === 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        const tableName = schemaResult.rows[0].table_name;

        // Check for dependencies
        const dependencyQuery = `
            SELECT name as schemaName, table_name as tableName 
            FROM ${builtins.TABLE_NAMES.schema} 
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
        await tx.query(`DELETE FROM ${builtins.TABLE_NAMES.schema} WHERE name = $1`, [schemaName]);

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