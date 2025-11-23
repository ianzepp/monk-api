import type { FilterData } from '@src/lib/filter-types.js';
import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';

export type ModelName = string;

/**
 * Special models that are fundamental to the platform and cannot be modified
 */
export const SYSTEM_MODELS = new Set([
    'models',
    'fields',
]);

/**
 * Predefined fields that exist on every model
 */
export const SYSTEM_FIELDS = new Set([
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

/**
 * Merged validation configuration for a single field
 * Pre-calculated once per model to avoid redundant loops during validation
 */
export interface FieldValidationConfig {
    fieldName: string;
    required: boolean;
    type?: { type: string; is_array: boolean };
    constraints?: { minimum?: number; maximum?: number; pattern?: RegExp };
    enum?: string[];
}

/**
 * Model wrapper class providing database operation proxies and validation
 * Inspired by cloud-api-2019/src/classes/model.ts
 */

export class Model {
    // Model properties from database record
    public modelName: ModelName;
    public status: string;

    // Model flags
    public sudo?: boolean;
    public frozen?: boolean;
    public external?: boolean;

    // Precalculated field metadata for performance
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
        modelName: ModelName,
        modelRecord: any
    ) {
        this.modelName = modelName;
        this.status = modelRecord.status || 'active';
        this.sudo = modelRecord.sudo;
        this.frozen = modelRecord.frozen;
        this.external = modelRecord.external;

        // Precalculate immutable, sudo, tracked, required, type, range, enum, and transform fields from field metadata for O(1) lookups
        this.immutableFields = new Set<string>();
        this.sudoFields = new Set<string>();
        this.trackedFields = new Set<string>();
        this.requiredFields = new Set<string>();
        this.typedFields = new Map();
        this.rangeFields = new Map();
        this.enumFields = new Map();
        this.transformFields = new Map();

        if (modelRecord._fields && Array.isArray(modelRecord._fields)) {
            for (const field of modelRecord._fields) {
                const fieldName = field.field_name;

                // Existing fields
                if (field.immutable === true) {
                    this.immutableFields.add(fieldName);
                }
                if (field.sudo === true) {
                    this.sudoFields.add(fieldName);
                }
                if (field.tracked === true) {
                    this.trackedFields.add(fieldName);
                }

                // New validation fields
                if (field.required === true) {
                    this.requiredFields.add(fieldName);
                }

                if (field.type) {
                    this.typedFields.set(fieldName, {
                        type: field.type,
                        is_array: field.is_array || false,
                    });
                }

                // Range/pattern constraints
                if (field.minimum !== null || field.maximum !== null || field.pattern) {
                    const range: { minimum?: number; maximum?: number; pattern?: RegExp } = {};
                    if (field.minimum !== null && field.minimum !== undefined) {
                        range.minimum = Number(field.minimum);
                    }
                    if (field.maximum !== null && field.maximum !== undefined) {
                        range.maximum = Number(field.maximum);
                    }
                    if (field.pattern) {
                        try {
                            range.pattern = new RegExp(field.pattern);
                        } catch (error) {
                            console.warn(`Invalid regex pattern for ${fieldName}`, { pattern: field.pattern });
                        }
                    }
                    this.rangeFields.set(fieldName, range);
                }

                // Enum values
                if (field.enum_values && Array.isArray(field.enum_values) && field.enum_values.length > 0) {
                    this.enumFields.set(fieldName, field.enum_values);
                }

                // Transforms
                if (field.transform) {
                    this.transformFields.set(fieldName, field.transform);
                }
            }
        }

        // Build merged validation field configs (optimized for single-loop validation)
        this.validationFields = this.buildValidationFields();

        console.info('Model initialized with metadata', {
            modelName: this.modelName,
            frozen: this.frozen,
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
            if (SYSTEM_FIELDS.has(fieldName)) {
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
     * Check if this model is a protected system model
     */
    isSystemModel(): boolean {
        return this.status === 'system';
    }

    /**
     * Check if this model is frozen (no data changes allowed)
     */
    isFrozen(): boolean {
        return this.frozen === true;
    }

    /**
     * Check if a field is immutable (cannot be changed once set)
     */
    isFieldImmutable(fieldName: string): boolean {
        return this.immutableFields.has(fieldName);
    }

    /**
     * Get all immutable fields for this model
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
     * Get all sudo-protected fields for this model
     */
    getSudoFields(): Set<string> {
        return this.sudoFields;
    }

    /**
     * Get all required fields for this model
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

    /**
     * Check if a field exists in this model
     * Returns true if the field is either a system field or has metadata
     */
    hasField(fieldName: string): boolean {
        // System fields always exist
        if (SYSTEM_FIELDS.has(fieldName)) {
            return true;
        }

        // Check if field has any metadata (type, immutable, sudo, etc.)
        return this.typedFields.has(fieldName) ||
               this.immutableFields.has(fieldName) ||
               this.sudoFields.has(fieldName) ||
               this.requiredFields.has(fieldName) ||
               this.trackedFields.has(fieldName) ||
               this.rangeFields.has(fieldName) ||
               this.enumFields.has(fieldName) ||
               this.transformFields.has(fieldName);
    }

    get model_name(): ModelName {
        return this.modelName;
    }

    //
    // Database operation proxies - delegate to Database service
    //

    async count(filterData?: FilterData): Promise<number> {
        return this.system.database.count(this.modelName, filterData);
    }

    async selectAny(filterData: FilterData = {}): Promise<any[]> {
        return this.system.database.selectAny(this.modelName, filterData);
    }

    async selectOne(filterData: FilterData): Promise<any | null> {
        return this.system.database.selectOne(this.modelName, filterData);
    }

    async select404(filterData: FilterData, message?: string): Promise<any> {
        return this.system.database.select404(this.modelName, filterData, message);
    }

    // ID-based operations - always work with arrays
    async selectIds(ids: string[]): Promise<any[]> {
        return this.system.database.selectIds(this.modelName, ids);
    }

    async updateIds(ids: string[], changes: Record<string, any>): Promise<any[]> {
        return this.system.database.updateIds(this.modelName, ids, changes);
    }

    async deleteIds(ids: string[]): Promise<any[]> {
        return this.system.database.deleteIds(this.modelName, ids);
    }

    async selectMax(filter: FilterData = {}): Promise<any[]> {
        // Set limit to 'max' in filter and delegate
        filter.limit = 10000;
        return this.system.database.selectAny(this.modelName, filter);
    }

    // Transaction-based operations (require tx context)
    async createOne(record: Record<string, any>): Promise<any> {
        return this.system.database.createOne(this.modelName, record);
    }

    async createAll(collection: Record<string, any>[]): Promise<any[]> {
        return this.system.database.createAll(this.modelName, collection);
    }

    async updateOne(recordId: string, updates: Record<string, any>): Promise<any> {
        return this.system.database.updateOne(this.modelName, recordId, updates);
    }

    async updateAll(updates: Array<{ id: string; data: Record<string, any> }>): Promise<any[]> {
        return this.system.database.updateAll(this.modelName, updates);
    }

    async deleteOne(recordId: string): Promise<any> {
        return this.system.database.deleteOne(this.modelName, recordId);
    }

    async deleteAll(recordIds: string[]): Promise<any[]> {
        return this.system.database.deleteIds(this.modelName, recordIds);
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
        return this.system.database.updateAny(this.modelName, filterData, changes);
    }

    async deleteAny(filterData: FilterData): Promise<any[]> {
        return this.system.database.deleteAny(this.modelName, filterData);
    }

    // Access control operations - separate from regular data updates
    async accessOne(recordId: string, accessChanges: Record<string, any>): Promise<any> {
        return this.system.database.accessOne(this.modelName, recordId, accessChanges);
    }

    async accessAll(updates: Array<{ id: string; access: Record<string, any> }>): Promise<any[]> {
        return this.system.database.accessAll(this.modelName, updates);
    }

    async accessAny(filter: FilterData, accessChanges: Record<string, any>): Promise<any[]> {
        return this.system.database.accessAny(this.modelName, filter, accessChanges);
    }

    // 404 operations - throw error if record not found
    async update404(filter: FilterData, changes: Record<string, any>, message?: string): Promise<any> {
        return this.system.database.update404(this.modelName, filter, changes, message);
    }

    async delete404(filter: FilterData, message?: string): Promise<any> {
        return this.system.database.delete404(this.modelName, filter, message);
    }

    async access404(filter: FilterData, accessChanges: Record<string, any>, message?: string): Promise<any> {
        return this.system.database.access404(this.modelName, filter, accessChanges, message);
    }

    // Utility methods
    toJSON() {
        return {
            model_name: this.modelName,
            status: this.status,
        };
    }
}

/**
 * Factory function to create Model instances
 */
export async function createModel(system: SystemContextWithInfrastructure, modelName: string): Promise<Model> {
    const modelInfo = await system.database.toModel(modelName);

    if (!modelInfo) {
        throw new Error(`Model '${modelName}' not found`);
    }

    return new Model(system, modelName, {
        status: 'active', // Assume active for legacy calls
    });
}
