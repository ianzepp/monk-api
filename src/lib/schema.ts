import { type FilterData } from '@lib/filter.js';
import { type TxContext } from '@src/db/index.js';
import type { SystemContextWithInfrastructure } from '@lib/types/system-context.js';
import { isSystemField } from '@lib/metabase.js';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export type SchemaName = string;

// Custom validation error class
export class ValidationError extends Error {
    public readonly errors: ErrorObject[];
    
    constructor(errors: ErrorObject[]) {
        const message = errors.map(err => 
            `${err.instancePath || 'root'}: ${err.message}`
        ).join(', ');
        
        super(`Validation failed: ${message}`);
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

/**
 * Schema wrapper class providing database operation proxies and validation
 * Inspired by cloud-api-2019/src/classes/schema.ts
 */

export class Schema {
    private static ajv: Ajv | null = null;
    private cachedValidator?: Function;
    
    // Schema properties from database record
    private schemaName: SchemaName;
    private tableName: string;
    private status: string;
    public definition?: any;

    constructor(
        private system: SystemContextWithInfrastructure,
        schemaName: SchemaName,
        schemaRecord: any
    ) {
        this.schemaName = schemaName;
        this.tableName = schemaRecord.table_name;
        this.status = schemaRecord.status || 'active';
        this.definition = schemaRecord.definition;
    }

    /**
     * Check if this schema is a protected system schema
     */
    isSystemSchema(): boolean {
        return this.status === 'system';
    }

    /**
     * Get or initialize global AJV instance
     */
    private static getAjv(): Ajv {
        if (!Schema.ajv) {
            Schema.ajv = new Ajv({
                allErrors: true,        // Return all validation errors
                removeAdditional: false, // Don't remove additional properties
                coerceTypes: false,     // Don't auto-convert types
                strict: false           // Allow unknown keywords
            });
            
            // Add standard format validations (email, date-time, etc.)
            addFormats(Schema.ajv);
            
            logger.info('Schema AJV initialized with formats');
        }
        return Schema.ajv;
    }

    get name(): SchemaName {
        return this.schemaName;
    }

    get table(): string {
        return this.tableName;
    }

    /**
     * Preprocess schema definition to allow null values for non-required fields.
     * This allows generators to return null for optional fields without validation errors.
     */
    private preprocessSchemaForNullability(definition: any): any {
        // Deep clone to avoid modifying original
        const processed = JSON.parse(JSON.stringify(definition));
        const required = processed.required || [];
        
        if (processed.properties) {
            for (const [fieldName, propertyDef] of Object.entries(processed.properties)) {
                const property = propertyDef as any;
                // Skip system fields (they're handled separately) and required fields
                if (!required.includes(fieldName) && !isSystemField(fieldName)) {
                    // For enum fields, we need to use anyOf to allow null
                    if (property.enum) {
                        // Convert enum to anyOf that allows null or the enum values
                        processed.properties[fieldName] = {
                            anyOf: [
                                { type: 'null' },
                                { enum: property.enum }
                            ]
                        };
                        // Preserve other properties like description
                        if (property.description) {
                            processed.properties[fieldName].description = property.description;
                        }
                    } else if (typeof property.type === 'string') {
                        // Convert "string" to ["string", "null"]
                        property.type = [property.type, 'null'];
                    } else if (Array.isArray(property.type) && !property.type.includes('null')) {
                        // Add "null" to existing type array if not already present
                        property.type.push('null');
                    }
                }
            }
        }
        
        return processed;
    }

    /**
     * Validate record data against this schema's JSON Schema definition
     */
    isValid(recordData: any): { valid: boolean; errors?: ErrorObject[] } {
        if (!this.definition) {
            logger.warn('Schema definition not available for validation', { schema: this.schemaName });
            return { valid: true }; // Allow if no definition
        }

        // Get or compile validator
        if (!this.cachedValidator) {
            const ajv = Schema.getAjv();
            
            // Preprocess schema to allow nulls for non-required fields
            const processedDefinition = this.preprocessSchemaForNullability(this.definition);
            
            this.cachedValidator = ajv.compile(processedDefinition);
            console.debug(`Schema '${this.schemaName}': compiled validator with nullable support for non-required fields`);
        }

        // Validate the data
        const valid = this.cachedValidator(recordData) as boolean;
        
        if (!valid && (this.cachedValidator as any).errors) {
            return {
                valid: false,
                errors: [...(this.cachedValidator as any).errors]
            };
        }

        return { valid: true };
    }

    /**
     * Validate record data and throw ValidationError if invalid
     */
    validateOrThrow(recordData: any): void {
        const result = this.isValid(recordData);
        if (!result.valid && result.errors) {
            throw new ValidationError(result.errors);
        }
        console.debug(`Schema '${this.schemaName}': validation passed`);
    }

    //
    // Database operation proxies - delegate to Database service
    //

    async count(filterData?: FilterData): Promise<number> {
        return this.system.database.count(this.schemaName, filterData);
    }

    async selectAny(filterData: FilterData = {}): Promise<any[]> {
        return this.system.database.selectAny(this.schemaName, filterData);
    }

    async selectOne(filterData: FilterData): Promise<any | null> {
        return this.system.database.selectOne(this.schemaName, filterData);
    }

    async select404(filterData: FilterData, message?: string): Promise<any> {
        return this.system.database.select404(this.schemaName, filterData, message);
    }

    // ID-based operations - always work with arrays
    async selectIds(ids: string[]): Promise<any[]> {
        return this.system.database.selectIds(this.schemaName, ids);
    }

    async updateIds(ids: string[], changes: Record<string, any>): Promise<any[]> {
        return this.system.database.updateIds(this.schemaName, ids, changes);
    }

    async deleteIds(ids: string[]): Promise<any[]> {
        return this.system.database.deleteIds(this.schemaName, ids);
    }

    async selectMax(filter: FilterData = {}): Promise<any[]> {
        // Set limit to 'max' in filter and delegate
        filter.limit = 10000;
        return this.system.database.selectAny(this.schemaName, filter);
    }

    // Transaction-based operations (require tx context)
    async createOne(record: Record<string, any>): Promise<any> {
        return this.system.database.createOne(this.schemaName, record);
    }

    async createAll(collection: Record<string, any>[]): Promise<any[]> {
        return this.system.database.createAll(this.schemaName, collection);
    }

    async updateOne(recordId: string, updates: Record<string, any>): Promise<any> {
        return this.system.database.updateOne(this.schemaName, recordId, updates);
    }

    async updateAll(updates: Array<{id: string, data: Record<string, any>}>): Promise<any[]> {
        return this.system.database.updateAll(this.schemaName, updates);
    }

    async deleteOne(recordId: string): Promise<any> {
        return this.system.database.deleteOne(this.schemaName, recordId);
    }

    async deleteAll(recordIds: string[]): Promise<any[]> {
        return this.system.database.deleteIds(this.schemaName, recordIds);
    }

    // Upsert operations (simplified - create or update based on ID presence)
    async upsertOne(record: Record<string, any>): Promise<any> {
        if (record.id) {
            // Try to update, create if not found
            try {
                return await this.updateOne(record.id, record);
            } catch (error) {
                if (error instanceof Error && error.message.includes('not found')) {
                    return await this.createOne(record);
                }
                throw error;
            }
        } else {
            // No ID provided, create new record
            return await this.createOne(record);
        }
    }

    async upsertAll(collection: Record<string, any>[]): Promise<any[]> {
        const results: any[] = [];
        for (const record of collection) {
            results.push(await this.upsertOne(record));
        }
        return results;
    }

    // Advanced filter-based operations
    async updateAny(filterData: FilterData, changes: Record<string, any>): Promise<any[]> {
        return this.system.database.updateAny(this.schemaName, filterData, changes);
    }

    async deleteAny(filterData: FilterData): Promise<any[]> {
        return this.system.database.deleteAny(this.schemaName, filterData);
    }

    // Access control operations - separate from regular data updates
    async accessOne(recordId: string, accessChanges: Record<string, any>): Promise<any> {
        return this.system.database.accessOne(this.schemaName, recordId, accessChanges);
    }

    async accessAll(updates: Array<{id: string, access: Record<string, any>}>): Promise<any[]> {
        return this.system.database.accessAll(this.schemaName, updates);
    }

    async accessAny(filter: FilterData, accessChanges: Record<string, any>): Promise<any[]> {
        return this.system.database.accessAny(this.schemaName, filter, accessChanges);
    }

    // 404 operations - throw error if record not found
    async update404(filter: FilterData, changes: Record<string, any>, message?: string): Promise<any> {
        return this.system.database.update404(this.schemaName, filter, changes, message);
    }

    async delete404(filter: FilterData, message?: string): Promise<any> {
        return this.system.database.delete404(this.schemaName, filter, message);
    }

    async access404(filter: FilterData, accessChanges: Record<string, any>, message?: string): Promise<any> {
        return this.system.database.access404(this.schemaName, filter, accessChanges, message);
    }

    // Utility methods
    toJSON() {
        return {
            name: this.schemaName,
            table: this.tableName,
            definition: this.definition
        };
    }
}

/**
 * Factory function to create Schema instances
 */
export async function createSchema(system: SystemContextWithInfrastructure, schemaName: string): Promise<Schema> {
    const schemaInfo = await system.database.toSchema(schemaName);
    
    if (!schemaInfo) {
        throw new Error(`Schema '${schemaName}' not found`);
    }
    
    return new Schema(system, schemaName, {
        table_name: schemaInfo.table,
        definition: schemaInfo.definition,
        status: 'active' // Assume active for legacy calls
    });
}