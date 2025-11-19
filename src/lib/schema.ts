import type { FilterData } from '@src/lib/filter-types.js';
import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';

export type SchemaName = string;

/**
 * Merged validation configuration for a single field
 * Pre-calculated once per schema to avoid redundant loops during validation
 */
export interface FieldValidationConfig {
    fieldName: string;
    required: boolean;
    type?: { type: string; is_array: boolean };
    constraints?: { minimum?: number; maximum?: number; pattern?: RegExp };
    enum?: string[];
}

/**
 * Schema wrapper class providing database operation proxies and validation
 * Inspired by cloud-api-2019/src/classes/schema.ts
 */

export class Schema {
    // Schema properties from database record
    private schemaName: SchemaName;
    private status: string;
    public sudo?: boolean;
    public freeze?: boolean;
    public definition?: any;

    // Precalculated column metadata for performance
    public immutableFields: Set<string>;
    public sudoFields: Set<string>;
    public trackedFields: Set<string>;
    public requiredFields: Set<string>;
    public typedFields: Map<string, { type: string; is_array: boolean }>;
    public rangeFields: Map<string, { minimum?: number; maximum?: number; pattern?: RegExp }>;
    public enumFields: Map<string, string[]>;
    public transformFields: Map<string, string>;

    // Merged validation configuration (optimized for single-loop validation)
    // Combines all validation metadata into one array, excludes system fields
    public validationFields: FieldValidationConfig[];

    constructor(
        private system: SystemContextWithInfrastructure,
        schemaName: SchemaName,
        schemaRecord: any
    ) {
        this.schemaName = schemaName;
        this.status = schemaRecord.status || 'active';
        this.sudo = schemaRecord.sudo;
        this.freeze = schemaRecord.freeze;
        this.definition = schemaRecord.definition;

        // Precalculate immutable, sudo, tracked, required, type, range, enum, and transform fields from column metadata for O(1) lookups
        this.immutableFields = new Set<string>();
        this.sudoFields = new Set<string>();
        this.trackedFields = new Set<string>();
        this.requiredFields = new Set<string>();
        this.typedFields = new Map();
        this.rangeFields = new Map();
        this.enumFields = new Map();
        this.transformFields = new Map();

        if (schemaRecord._columns && Array.isArray(schemaRecord._columns)) {
            for (const column of schemaRecord._columns) {
                const fieldName = column.column_name;

                // Existing fields
                if (column.immutable === true) {
                    this.immutableFields.add(fieldName);
                }
                if (column.sudo === true) {
                    this.sudoFields.add(fieldName);
                }
                if (column.tracked === true) {
                    this.trackedFields.add(fieldName);
                }

                // New validation fields
                if (column.required === true) {
                    this.requiredFields.add(fieldName);
                }

                if (column.type) {
                    this.typedFields.set(fieldName, {
                        type: column.type,
                        is_array: column.is_array || false,
                    });
                }

                // Range/pattern constraints
                if (column.minimum !== null || column.maximum !== null || column.pattern) {
                    const range: { minimum?: number; maximum?: number; pattern?: RegExp } = {};
                    if (column.minimum !== null && column.minimum !== undefined) {
                        range.minimum = Number(column.minimum);
                    }
                    if (column.maximum !== null && column.maximum !== undefined) {
                        range.maximum = Number(column.maximum);
                    }
                    if (column.pattern) {
                        try {
                            range.pattern = new RegExp(column.pattern);
                        } catch (error) {
                            logger.warn(`Invalid regex pattern for ${fieldName}`, { pattern: column.pattern });
                        }
                    }
                    this.rangeFields.set(fieldName, range);
                }

                // Enum values
                if (column.enum_values && Array.isArray(column.enum_values) && column.enum_values.length > 0) {
                    this.enumFields.set(fieldName, column.enum_values);
                }

                // Transforms
                if (column.transform) {
                    this.transformFields.set(fieldName, column.transform);
                }
            }
        }

        // Build merged validation field configs (optimized for single-loop validation)
        this.validationFields = this.buildValidationFields();

        logger.info('Schema initialized with metadata', {
            schemaName: this.schemaName,
            freeze: this.freeze,
            immutableFields: this.immutableFields.size,
            sudoFields: this.sudoFields.size,
            trackedFields: this.trackedFields.size,
            requiredFields: this.requiredFields.size,
            typedFields: this.typedFields.size,
            rangeFields: this.rangeFields.size,
            enumFields: this.enumFields.size,
            transformFields: this.transformFields.size,
            validationFields: this.validationFields.length
        });
    }

    /**
     * Build merged validation field configurations
     * Combines all validation metadata into a single array for optimal single-loop validation
     * Automatically excludes system fields
     */
    private buildValidationFields(): FieldValidationConfig[] {
        const systemFields = new Set([
            'id',
            'created_at',
            'updated_at',
            'deleted_at',
            'trashed_at',
            'access_deny',
            'access_edit',
            'access_full',
            'access_read',
        ]);

        const fields: FieldValidationConfig[] = [];

        // Collect all unique field names that have any validation metadata
        const allFieldNames = new Set<string>([
            ...this.requiredFields,
            ...this.typedFields.keys(),
            ...this.rangeFields.keys(),
            ...this.enumFields.keys(),
        ]);

        // Build config for each field (excluding system fields)
        for (const fieldName of allFieldNames) {
            // Skip system fields
            if (systemFields.has(fieldName)) {
                continue;
            }

            const config: FieldValidationConfig = {
                fieldName,
                required: this.requiredFields.has(fieldName),
            };

            // Add type info if exists
            const typeInfo = this.typedFields.get(fieldName);
            if (typeInfo) {
                config.type = typeInfo;
            }

            // Add constraints if exists
            const constraints = this.rangeFields.get(fieldName);
            if (constraints) {
                config.constraints = constraints;
            }

            // Add enum if exists
            const enumValues = this.enumFields.get(fieldName);
            if (enumValues) {
                config.enum = enumValues;
            }

            fields.push(config);
        }

        return fields;
    }

    /**
     * Check if this schema is a protected system schema
     */
    isSystemSchema(): boolean {
        return this.status === 'system';
    }

    /**
     * Check if this schema is frozen (no data changes allowed)
     */
    isFrozen(): boolean {
        return this.freeze === true;
    }

    /**
     * Check if a field is immutable (cannot be changed once set)
     */
    isFieldImmutable(fieldName: string): boolean {
        return this.immutableFields.has(fieldName);
    }

    /**
     * Get all immutable fields for this schema
     */
    getImmutableFields(): Set<string> {
        return this.immutableFields;
    }

    /**
     * Check if a field requires sudo access to modify
     */
    isFieldSudo(fieldName: string): boolean {
        return this.sudoFields.has(fieldName);
    }

    /**
     * Get all sudo-protected fields for this schema
     */
    getSudoFields(): Set<string> {
        return this.sudoFields;
    }

    /**
     * Get all required fields for this schema
     */
    getRequiredFields(): Set<string> {
        return this.requiredFields;
    }

    /**
     * Get all typed fields with their type information
     */
    getTypedFields(): Map<string, { type: string; is_array: boolean }> {
        return this.typedFields;
    }

    /**
     * Get all fields with range/pattern constraints
     */
    getRangeFields(): Map<string, { minimum?: number; maximum?: number; pattern?: RegExp }> {
        return this.rangeFields;
    }

    /**
     * Get all fields with enum constraints
     */
    getEnumFields(): Map<string, string[]> {
        return this.enumFields;
    }

    /**
     * Get all fields with transform operations
     */
    getTransformFields(): Map<string, string> {
        return this.transformFields;
    }

    /**
     * Get merged validation field configurations
     * Optimized for single-loop validation - contains all validation metadata
     * in one structure, with system fields already excluded
     */
    getValidationFields(): FieldValidationConfig[] {
        return this.validationFields;
    }

    get schema_name(): SchemaName {
        return this.schemaName;
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

    async updateAll(updates: Array<{ id: string; data: Record<string, any> }>): Promise<any[]> {
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

    async accessAll(updates: Array<{ id: string; access: Record<string, any> }>): Promise<any[]> {
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
            schema_name: this.schemaName,
            status: this.status,
            definition: this.definition,
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
        definition: schemaInfo.definition,
        status: 'active', // Assume active for legacy calls
    });
}
