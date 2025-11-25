import crypto from 'crypto';
import type { TxContext } from '@src/db/index.js';

import type { SystemContext } from '@src/lib/system-context-types.js';
import { Model, type ModelName } from '@src/lib/model.js';
import { ModelRecord } from '@src/lib/model-record.js';
import { Filter, type AggregateSpec } from '@src/lib/filter.js';
import type { FilterData, AggregateData } from '@src/lib/filter-types.js';
import type { FilterWhereOptions } from '@src/lib/filter-types.js';
import { ObserverRunner } from '@src/lib/observers/runner.js';
import { ObserverRecursionError, SystemError } from '@src/lib/observers/errors.js';
import type { OperationType } from '@src/lib/observers/types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { convertRecordPgToMonk } from '@src/lib/field-types.js';
import { SQL_MAX_RECURSION } from '@src/lib/constants.js';
import type {
    DbRecord,
    DbCreateInput,
    DbUpdateInput,
    DbDeleteInput,
    DbRevertInput,
    DbAccessInput,
    DbAccessUpdate,
} from '@src/lib/database-types.js';

/**
 * Relationship metadata returned by getRelationship()
 */
export interface CachedRelationship {
    fieldName: string;      // Foreign key field on child model
    childModel: string;     // Child model name
    relationshipType: string; // 'owned', 'referenced', etc.
}

/**
 * Options for database select operations with context-aware soft delete handling
 */
export interface SelectOptions extends FilterWhereOptions {
    context?: 'api' | 'observer' | 'system';
}

/**
 * Database service wrapper providing high-level operations
 * Per-request instance with specific database context
 *
 * Uses dependency injection pattern to break circular dependencies:
 * - SystemContext provides business context
 * - pg.Pool/pg.PoolClient injected separately for database access
 */
export class Database {
    public readonly system: SystemContext;

    /**
     * Create a new Database instance
     *
     * Database is per-request and provides high-level operations over the observer pipeline.
     * Uses dependency injection pattern to break circular dependencies.
     *
     * @param system - System context with infrastructure (db, tx, database, describe)
     */
    constructor(system: SystemContext) {
        this.system = system;
    }

    /**
     * Get transaction context for database operations
     *
     * Returns the active transaction context with search_path configured.
     * All tenant-scoped operations require a transaction for namespace isolation.
     *
     * @private
     * @returns Transaction context with search_path set
     * @throws Error if transaction not initialized (programming error)
     */
    private get dbContext(): TxContext {
        if (!this.system.tx) {
            throw new Error('Transaction context not initialized - ensure withTransaction() wrapper is used');
        }
        return this.system.tx;
    }

    /**
     * Resolve model name to Model instance with caching
     *
     * Uses NamespaceCache for schema-aware caching.
     *
     * @param modelName - Name of the model to load
     * @returns Model instance with metadata and validation methods
     */
    async toModel(modelName: ModelName): Promise<Model> {
        return this.system.namespace.getModel(modelName);
    }

    /**
     * Get relationship metadata by parent model and relationship name
     *
     * Uses NamespaceCache for schema-aware caching.
     *
     * @param parentModel - Parent model name (the model being queried)
     * @param relationshipName - Relationship name defined on the child field
     * @returns Relationship metadata with fieldName, childModel, relationshipType
     * @throws HttpErrors.notFound if relationship doesn't exist
     */
    async getRelationship(parentModel: string, relationshipName: string): Promise<CachedRelationship> {
        const fields = this.system.namespace.getRelationships(parentModel, relationshipName);
        if (fields.length === 0) {
            throw HttpErrors.notFound(
                `Relationship '${relationshipName}' not found for model '${parentModel}'`,
                'RELATIONSHIP_NOT_FOUND'
            );
        }
        // Return first field as CachedRelationship format (for backward compatibility)
        const field = fields[0];
        return {
            fieldName: field.fieldName,
            childModel: field.modelName,
            relationshipType: field.relationshipType || 'owned',
        };
    }

    /**
     * Execute raw SQL query with optional parameters
     *
     * Low-level query execution using current transaction or database connection.
     * Automatically uses parameterized queries when params provided.
     *
     * @param query - SQL query string
     * @param params - Optional query parameters for parameterized queries
     * @returns Query result with rows and metadata
     */
    async execute(query: string, params: any[] = []): Promise<any> {
        const dbContext = this.dbContext;
        if (params.length > 0) {
            return await dbContext.query(query, params);
        } else {
            return await dbContext.query(query);
        }
    }

    /**
     * Count records matching filter criteria
     *
     * Executes COUNT(*) query with optional WHERE conditions.
     * Respects soft delete settings from system context.
     *
     * @param modelName - Model to count records from
     * @param filterData - Optional filter conditions (where clause)
     * @returns Total count of matching records
     */
    async count(modelName: ModelName, filterData: FilterData = {}): Promise<number> {
        const model = await this.toModel(modelName);
        const filter = new Filter(model.model_name).assign(filterData);

        // Issue #102: Use toCountSQL() pattern instead of manual query building
        const { query, params } = filter.toCountSQL();
        const result = await this.execute(query, params);

        return parseInt(result.rows[0].count as string);
    }

    /**
     * Aggregate data with optional GROUP BY
     *
     * Executes aggregation queries (SUM, AVG, MIN, MAX, COUNT) with optional grouping.
     * Supports filtering via where clause and respects soft delete settings.
     *
     * @param modelName - Model to aggregate
     * @param body - Request body containing aggregate, where, and groupBy fields
     * @param options - Soft delete and context options
     * @returns Array of aggregation results
     */
    async aggregate(
        modelName: ModelName,
        body: AggregateData | any = {},
        options: SelectOptions = {}
    ): Promise<any[]> {
        // Validate request body
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
        }

        // Validate aggregations
        if (!body.aggregate || typeof body.aggregate !== 'object' || Object.keys(body.aggregate).length === 0) {
            throw HttpErrors.badRequest('Request must include "aggregate" field with at least one aggregation function', 'BODY_MISSING_FIELD');
        }

        // Extract parameters
        const filterData = body.where ? { where: body.where } : {};
        const aggregations = body.aggregate;
        const groupBy = body.groupBy || body.group_by;

        const model = await this.toModel(modelName);

        // Apply context-based soft delete defaults
        const defaultOptions = this.getDefaultSoftDeleteOptions(options.context);
        const mergedOptions = { ...defaultOptions, ...options };

        // Create filter and apply WHERE conditions
        const filter = new Filter(model.model_name)
            .assign(filterData)
            .withSoftDeleteOptions(mergedOptions);

        // Generate aggregation SQL
        const { query, params } = filter.toAggregateSQL(aggregations, groupBy);
        const result = await this.execute(query, params);

        // Convert PostgreSQL string types back to proper JSON types
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, model));
    }

    /**
     * Select multiple records by their IDs
     *
     * Lenient approach - returns only records that exist, no error if some missing.
     * Extracts IDs from record objects and performs batch query.
     *
     * @param modelName - Model to select from
     * @param records - Array of records with id fields
     * @returns Array of matching records (may be fewer than requested)
     */
    async selectAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        records: DbRecord<T>[]
    ): Promise<DbRecord<T>[]> {
        // Extract IDs from records
        const ids = records.map(record => record.id).filter(id => id !== undefined);

        if (ids.length === 0) {
            return [];
        }

        // Use selectAny with ID filter - lenient approach, returns what exists
        return await this.selectAny<T>(modelName, { where: { id: { $in: ids } } }, { context: 'system' });
    }

    /**
     * Create multiple records through observer pipeline
     *
     * Core batch creation method. Executes complete observer pipeline with:
     * - Input validation (Ring 1)
     * - Business logic (Ring 2-4)
     * - Database insertion (Ring 5)
     * - Post-processing (Ring 6-9)
     *
     * @param modelName - Model to create records in
     * @param records - Array of record data to create
     * @returns Array of created records with system fields populated
     */
    async createAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        records: DbCreateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('create', modelName, records);
    }

    /**
     * Core batch soft delete method - optimized for multiple records.
     * Soft delete multiple records by setting trashed_at timestamp using single batch UPDATE query.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     */
    async deleteAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        deletes: DbDeleteInput[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('delete', modelName, deletes);
    }

    /**
     * Select a single record matching filter criteria
     *
     * Returns first matching record or null if none found.
     * Respects soft delete settings and applies context-based defaults.
     *
     * @param modelName - Model to select from
     * @param filterData - Filter conditions (where, limit, offset, etc.)
     * @param options - Soft delete and context options
     * @returns First matching record or null if none found
     */
    async selectOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData,
        options: SelectOptions = {}
    ): Promise<DbRecord<T> | null> {
        const results = await this.selectAny<T>(modelName, filterData, options);
        return results[0] || null;
    }

    /**
     * Select a single record or throw 404 error
     *
     * Convenience method that throws HttpError if record not found.
     * Useful for API endpoints that require record to exist.
     *
     * @param modelName - Model to select from
     * @param filter - Filter conditions
     * @param message - Optional custom error message
     * @param options - Soft delete and context options
     * @returns Matching record
     * @throws HttpError 404 if record not found
     */
    async select404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        message?: string,
        options: SelectOptions = {}
    ): Promise<DbRecord<T>> {
        const record = await this.selectOne<T>(modelName, filter, options);

        if (!record) {
            throw HttpErrors.notFound(message || 'Record not found', 'RECORD_NOT_FOUND');
        }

        return record;
    }

    /**
     * Select multiple records by their IDs
     *
     * Batch query for specific record IDs. Returns only existing records,
     * no error if some IDs don't exist (lenient approach).
     *
     * @param modelName - Model to select from
     * @param ids - Array of record IDs to fetch
     * @param options - Soft delete and context options
     * @returns Array of matching records (may be fewer than requested IDs)
     */
    async selectIds<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        ids: string[],
        options: SelectOptions = {}
    ): Promise<DbRecord<T>[]> {
        if (ids.length === 0) return [];
        return await this.selectAny<T>(modelName, { where: { id: { $in: ids } } }, options);
    }

    /**
     * Update multiple records by their IDs
     *
     * Batch update applying same changes to all specified records.
     * Delegates to updateAny() for pipeline execution.
     *
     * @param modelName - Model to update records in
     * @param ids - Array of record IDs to update
     * @param changes - Partial record data to apply to all records
     * @returns Array of updated records
     */
    async updateIds<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        ids: string[],
        changes: Partial<T>
    ): Promise<DbRecord<T>[]> {
        if (ids.length === 0) return [];
        return await this.updateAny<T>(modelName, { where: { id: { $in: ids } } }, changes);
    }

    /**
     * Soft delete multiple records by their IDs
     *
     * Batch soft delete by setting trashed_at timestamp.
     * Delegates to deleteAll() for pipeline execution.
     *
     * @param modelName - Model to delete records from
     * @param ids - Array of record IDs to soft delete
     * @returns Array of soft deleted records with trashed_at set
     */
    async deleteIds<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        ids: string[]
    ): Promise<DbRecord<T>[]> {
        if (ids.length === 0) return [];

        // Convert IDs to delete records with just ID field
        const deleteRecords = ids.map(id => ({ id }));
        return await this.deleteAll<T>(modelName, deleteRecords);
    }

    /**
     * Select records matching filter criteria
     *
     * Core select method with full filter support (where, limit, offset, sort).
     * Respects soft delete settings and applies context-based defaults.
     * Converts PostgreSQL types back to proper JSON types.
     *
     * @param modelName - Model to select from
     * @param filterData - Filter conditions (where, limit, offset, sort, etc.)
     * @param options - Soft delete and context options
     * @returns Array of matching records
     */
    async selectAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData = {},
        options: SelectOptions = {}
    ): Promise<DbRecord<T>[]> {
        const model = await this.toModel(modelName);

        // Apply context-based soft delete defaults
        const defaultOptions = this.getDefaultSoftDeleteOptions(options.context);
        const mergedOptions = { ...defaultOptions, ...options };

        const filter = new Filter(model.model_name)
            .assign(filterData)
            .withSoftDeleteOptions(mergedOptions);

        // Use Filter.toSQL() pattern for proper separation of concerns
        const { query, params } = filter.toSQL();
        const result = await this.system.database.execute(query, params);

        // Convert PostgreSQL string types back to proper JSON types
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, model));
    }

    /**
     * Get default soft delete options based on context
     *
     * - 'api': Excludes trashed records (default user-facing behavior)
     * - 'observer': Includes trashed records (observers may need to process trashed records)
     * - 'system': Includes trashed records (system-level operations)
     *
     * Note: deleted_at records are ALWAYS excluded in all contexts.
     * They are kept in the database for compliance/audit but never visible through the API.
     */
    private getDefaultSoftDeleteOptions(context?: 'api' | 'observer' | 'system'): FilterWhereOptions {
        switch (context) {
            case 'observer':
            case 'system':
                return {
                    trashed: 'include'
                };
            case 'api':
            default:
                return {
                    trashed: 'exclude'
                };
        }
    }

    /**
     * Convert PostgreSQL string results back to proper JSON types
     *
     * PostgreSQL returns all values as strings by default. This method converts
     * them back to the correct JSON types based on the model field metadata.
     */
    private convertPostgreSQLTypes(record: any, model: any): any {
        if (!model.typedFields || model.typedFields.size === 0) {
            return record;
        }

        return convertRecordPgToMonk(record, model.typedFields);
    }

    /**
     * Update records matching filter criteria
     *
     * Two-phase operation: find matching records, then apply changes to all.
     * Uses system context for initial select to ensure all records are found.
     * Delegates to updateAll() for pipeline execution.
     *
     * @param modelName - Model to update records in
     * @param filterData - Filter to find records to update
     * @param changes - Partial record data to apply to all matching records
     * @returns Array of updated records
     */
    async updateAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData,
        changes: Partial<T>
    ): Promise<DbRecord<T>[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny<T>(modelName, filterData, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Apply changes to each record
        const updates = records.map(record => ({
            id: record.id,
            ...changes,
        }));

        // 3. Bulk update all matched records
        return await this.updateAll<T>(modelName, updates);
    }

    /**
     * Soft delete records matching filter criteria
     *
     * Two-phase operation: find matching records, then soft delete all by ID.
     * Uses system context for initial select to ensure all records are found.
     * Delegates to deleteIds() for pipeline execution.
     *
     * @param modelName - Model to delete records from
     * @param filter - Filter to find records to delete
     * @returns Array of soft deleted records with trashed_at set
     */
    async deleteAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData
    ): Promise<DbRecord<T>[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny<T>(modelName, filter, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Extract IDs and bulk delete
        const recordIds = records.map(record => record.id);
        return await this.deleteIds<T>(modelName, recordIds);
    }

    /**
     * Create a single record through observer pipeline
     *
     * Convenience method for single record creation.
     * Delegates to createAll() for pipeline execution.
     *
     * @param modelName - Model to create record in
     * @param recordData - Record data to create
     * @returns Created record with system fields populated
     */
    async createOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordData: DbCreateInput<T>
    ): Promise<DbRecord<T>> {
        // Universal pattern: Single → Array → Observer Pipeline
        const results = await this.createAll<T>(modelName, [recordData]);
        return results[0];
    }

    /**
     * Update a single record by ID
     *
     * Updates record with specified ID, throws 404 if not found.
     * Delegates to updateAll() for pipeline execution.
     *
     * @param modelName - Model to update record in
     * @param recordId - ID of record to update
     * @param updates - Partial record data to apply
     * @returns Updated record
     * @throws HttpError 404 if record not found
     */
    async updateOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string,
        updates: Partial<T>
    ): Promise<DbRecord<T>> {
        const results = await this.updateAll<T>(modelName, [{ id: recordId, ...updates }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    /**
     * Update multiple records through observer pipeline
     *
     * Core batch update method. Executes complete observer pipeline with:
     * - Input validation (Ring 1)
     * - Business logic (Ring 2-4)
     * - Database update (Ring 5)
     * - Post-processing (Ring 6-9)
     *
     * @param modelName - Model to update records in
     * @param updates - Array of partial record data with IDs
     * @returns Array of updated records
     */
    async updateAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        updates: DbUpdateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('update', modelName, updates);
    }

    /**
     * Soft delete a single record by setting trashed_at timestamp.
     * Delegates to deleteAll() for consistency and efficiency.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     * @returns The updated record with trashed_at timestamp set
     */
    async deleteOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string
    ): Promise<DbRecord<T>> {
        const results = await this.deleteAll<T>(modelName, [{ id: recordId }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found or already trashed', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    /**
     * Revert multiple soft-deleted records by setting trashed_at to NULL.
     * Core batch implementation for record restoration.
     * Validates that records are actually trashed before reverting.
     * @returns Array of reverted records with trashed_at set to null
     */
    async revertAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        reverts: DbRevertInput[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('revert', modelName, reverts);
    }

    /**
     * Revert a single soft-deleted record by setting trashed_at to NULL.
     * Delegates to revertAll() for consistency with updateOne/updateAll pattern.
     */
    async revertOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string
    ): Promise<DbRecord<T>> {
        const results = await this.revertAll<T>(modelName, [{ id: recordId, trashed_at: null }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found or not trashed', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    /**
     * Revert multiple records using filter criteria.
     * Finds trashed records matching filter, then reverts them.
     */
    async revertAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData = {}
    ): Promise<DbRecord<T>[]> {
        // First find all trashed records matching the filter
        // Note: This requires include_trashed=true to find trashed records
        if (!this.system.options.trashed) {
            throw HttpErrors.badRequest('revertAny() requires include_trashed=true option to find trashed records', 'REQUEST_INVALID_OPTIONS');
        }

        const trashedRecords = await this.selectAny<T>(modelName, filterData, { trashed: 'include', context: 'system' });
        const recordsToRevert = trashedRecords.filter(record => record.trashed_at !== null).map(record => ({ id: record.id, trashed_at: null }));

        if (recordsToRevert.length === 0) {
            return [];
        }

        return await this.revertAll<T>(modelName, recordsToRevert);
    }

    /**
     * Observer Pipeline Integration (Phase 3.5)
     *
     * Executes the complete observer pipeline for any database operation.
     * Handles recursion detection, transaction management, and selective ring execution.
     */
    private async runObserverPipeline(operation: OperationType, modelName: string, data: any[], depth: number = 0): Promise<any[]> {
        // Recursion protection
        if (depth > SQL_MAX_RECURSION) {
            throw new ObserverRecursionError(depth, SQL_MAX_RECURSION);
        }

        const startTime = Date.now();

        console.info('Observer pipeline started', {
            operation,
            modelName,
            recordCount: data.length,
            depth,
        });

        // 🎯 SINGLE POINT: Convert modelName → model object here
        const model = await this.toModel(modelName);

        try {
            // Execute observer pipeline with resolved model object
            const result = await this.executeObserverPipeline(operation, model, data, depth + 1);

            // Transaction management now handled at route level via withTransactionParams

            // Performance timing for successful pipeline
            const duration = Date.now() - startTime;
            console.info('Observer pipeline completed', {
                operation,
                modelName: model.model_name,
                recordCount: data.length,
                depth,
                durationMs: duration,
            });

            return result;
        } catch (error) {
            console.warn('Observer pipeline failed', {
                operation,
                modelName: model.model_name,
                recordCount: data.length,
                depth,
                error: error instanceof Error ? error.message : String(error),
            });

            // Transaction rollback now handled at route level via withTransactionParams

            throw error instanceof Error ? error : new SystemError(`Observer pipeline failed: ${error}`);
        }
    }

    /**
     * Execute observer pipeline within existing transaction context
     */
    private async executeObserverPipeline(operation: OperationType, model: Model, data: any[], depth: number): Promise<any[]> {
        // Wrap input data in ModelRecord instances
        const records = data.map(d => new ModelRecord(model, d));

        const runner = new ObserverRunner();

        const result = await runner.execute(
            this.system,
            operation,
            model,
            records,  // Pass ModelRecord[] instead of any[]
            depth
        );

        if (!result.success) {
            // Convert observer validation errors to structured HTTP errors
            const errors = result.errors || [];

            if (errors.length === 0) {
                // Fallback for unknown errors
                throw HttpErrors.internal('Observer pipeline failed without error details', 'OBSERVER_PIPELINE_FAILED');
            }

            // Use the first error's code, or default to VALIDATION_ERROR
            const primaryError = errors[0];
            const errorCode = primaryError.code || 'VALIDATION_ERROR';

            // Create structured error response with all validation errors
            throw HttpErrors.unprocessableEntity(
                primaryError.message,
                errorCode,
                {
                    validation_errors: errors.map(e => ({
                        message: e.message,
                        code: e.code,
                        field: (e as any).field // ValidationError has optional field property
                    })),
                    error_count: errors.length
                }
            );
        }

        // Unwrap ModelRecord instances back to plain objects
        // context.data is the single array flowing through the pipeline
        // SQL observers update it in-place with setCurrent()
        return records.map((r: ModelRecord) => r.toObject());
    }

    // Database class doesn't handle transactions - System class does

    // Access control operations - modify ACLs only, not record data
    /**
     * Update access control lists (ACLs) for multiple records.
     * Core batch implementation for ACL modifications.
     * Only modifies access_* fields, all other fields are ignored.
     * @returns Array of updated records with new ACL values
     */
    async accessAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        accessUpdates: DbAccessUpdate[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('access', modelName, accessUpdates);
    }

    /**
     * Update access control lists (ACLs) for a single record.
     * Delegates to accessAll() for consistency with updateOne/updateAll pattern.
     */
    async accessOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string,
        accessChanges: DbAccessInput
    ): Promise<DbRecord<T>> {
        const results = await this.accessAll<T>(modelName, [{ id: recordId, ...accessChanges }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    /**
     * Update access control lists (ACLs) for records matching a filter.
     * Finds records, then applies access changes to all matches.
     */
    async accessAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        accessChanges: DbAccessInput
    ): Promise<DbRecord<T>[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny<T>(modelName, filter, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Apply access changes to each record
        const accessUpdates = records.map(record => ({
            id: record.id,
            ...accessChanges,
        }));

        // 3. Bulk update access permissions
        return await this.accessAll<T>(modelName, accessUpdates);
    }

    /**
     * Update record by filter or throw 404 error
     *
     * Two-phase operation: verify record exists (throws 404), then update.
     * Convenience method for API endpoints requiring record to exist.
     *
     * @param modelName - Model to update record in
     * @param filter - Filter to find record
     * @param changes - Partial record data to apply
     * @param message - Optional custom error message
     * @returns Updated record
     * @throws HttpError 404 if record not found
     */
    async update404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        changes: Partial<T>,
        message?: string
    ): Promise<DbRecord<T>> {
        // First ensure record exists (throws if not found)
        const record = await this.select404<T>(modelName, filter, message);

        return await this.updateOne<T>(modelName, record.id, changes);
    }

    /**
     * Soft delete record by filter or throw 404 error
     *
     * Two-phase operation: verify record exists (throws 404), then soft delete.
     * Convenience method for API endpoints requiring record to exist.
     *
     * @param modelName - Model to delete record from
     * @param filter - Filter to find record
     * @param message - Optional custom error message
     * @returns Soft deleted record with trashed_at set
     * @throws HttpError 404 if record not found
     */
    async delete404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        message?: string
    ): Promise<DbRecord<T>> {
        // First ensure record exists (throws if not found)
        const record = await this.select404<T>(modelName, filter, message);
        return await this.deleteOne<T>(modelName, record.id);
    }

    /**
     * Update ACLs for record by filter or throw 404 error
     *
     * Two-phase operation: verify record exists (throws 404), then update ACLs.
     * Convenience method for API endpoints requiring record to exist.
     *
     * @param modelName - Model to update ACLs in
     * @param filter - Filter to find record
     * @param accessChanges - Access control changes to apply
     * @param message - Optional custom error message
     * @returns Record with updated ACLs
     * @throws HttpError 404 if record not found
     */
    async access404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        accessChanges: DbAccessInput,
        message?: string
    ): Promise<DbRecord<T>> {
        // First ensure record exists (throws if not found)
        const record = await this.select404<T>(modelName, filter, message);
        return await this.accessOne<T>(modelName, record.id, accessChanges);
    }
}

// Database instances are now created per-request via System class
