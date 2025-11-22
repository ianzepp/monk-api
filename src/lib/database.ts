import crypto from 'crypto';
import type { DbContext, TxContext } from '@src/db/index.js';

import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';
import { Schema, type SchemaName } from '@src/lib/schema.js';
import { SchemaRecord } from '@src/lib/schema-record.js';
import { Filter, type AggregateSpec } from '@src/lib/filter.js';
import type { FilterData } from '@src/lib/filter-types.js';
import type { FilterWhereOptions } from '@src/lib/filter-types.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import { ObserverRunner } from '@src/lib/observers/runner.js';
import { ObserverRecursionError, SystemError } from '@src/lib/observers/errors.js';
import type { OperationType } from '@src/lib/observers/types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { convertRecordPgToMonk } from '@src/lib/column-types.js';
import type {
    DbRecord,
    DbCreateInput,
    DbUpdateInput,
    DbDeleteInput,
    DbAccessInput,
} from '@src/lib/database-types.js';

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
    public readonly system: SystemContextWithInfrastructure;

    /** Maximum observer recursion depth to prevent infinite loops */
    static readonly SQL_MAX_RECURSION = 3;

    constructor(system: SystemContextWithInfrastructure) {
        this.system = system;
    }

    /**
     * Get transaction-aware database context
     * Uses transaction if available, otherwise uses database connection
     */
    private get dbContext(): DbContext | TxContext {
        return this.system.tx || this.system.db;
    }

    // Schema operations with caching - returns Schema instance
    async toSchema(schemaName: SchemaName): Promise<Schema> {
        const schemaCache = SchemaCache.getInstance();
        const schemaRecord = await schemaCache.getSchema(this.system, schemaName);

        // Create Schema instance with validation capabilities
        const schema = new Schema(this.system, schemaName, schemaRecord);
        return schema;
    }

    // Core operation. Execute raw SQL query
    async execute(query: string, params: any[] = []): Promise<any> {
        const dbContext = this.dbContext;
        if (params.length > 0) {
            return await dbContext.query(query, params);
        } else {
            return await dbContext.query(query);
        }
    }

    // Count
    async count(schemaName: SchemaName, filterData: FilterData = {}): Promise<number> {
        const schema = await this.toSchema(schemaName);
        const filter = new Filter(schema.schema_name).assign(filterData);

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
     * @param schemaName - Schema to aggregate
     * @param filterData - Filter conditions (where clause)
     * @param aggregations - Aggregation specifications (e.g., {total: {$count: '*'}})
     * @param groupBy - Optional columns to group by
     * @param options - Soft delete and context options
     * @returns Array of aggregation results
     */
    async aggregate(
        schemaName: SchemaName,
        filterData: FilterData = {},
        aggregations: AggregateSpec,
        groupBy?: string[],
        options: SelectOptions = {}
    ): Promise<any[]> {
        const schema = await this.toSchema(schemaName);

        // Apply context-based soft delete defaults
        const defaultOptions = this.getDefaultSoftDeleteOptions(options.context);
        const mergedOptions = { ...defaultOptions, ...options };

        // Create filter and apply WHERE conditions
        const filter = new Filter(schema.schema_name)
            .assign(filterData)
            .withSoftDeleteOptions(mergedOptions);

        // Generate aggregation SQL
        const { query, params } = filter.toAggregateSQL(aggregations, groupBy);
        const result = await this.execute(query, params);

        // Convert PostgreSQL string types back to proper JSON types
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, schema));
    }

    async selectAll<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        records: DbRecord<T>[]
    ): Promise<DbRecord<T>[]> {
        // Extract IDs from records
        const ids = records.map(record => record.id).filter(id => id !== undefined);

        if (ids.length === 0) {
            return [];
        }

        // Use selectAny with ID filter - lenient approach, returns what exists
        return await this.selectAny<T>(schemaName, { where: { id: { $in: ids } } }, { context: 'system' });
    }

    async createAll<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        records: DbCreateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('create', schemaName, records);
    }

    /**
     * Core batch soft delete method - optimized for multiple records.
     * Soft delete multiple records by setting trashed_at timestamp using single batch UPDATE query.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     */
    async deleteAll<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        deletes: DbDeleteInput[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('delete', schemaName, deletes);
    }

    // Core data operations
    async selectOne<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filterData: FilterData,
        options: SelectOptions = {}
    ): Promise<DbRecord<T> | null> {
        const results = await this.selectAny<T>(schemaName, filterData, options);
        return results[0] || null;
    }

    async select404<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filter: FilterData,
        message?: string,
        options: SelectOptions = {}
    ): Promise<DbRecord<T>> {
        const record = await this.selectOne<T>(schemaName, filter, options);

        if (!record) {
            throw HttpErrors.notFound(message || 'Record not found', 'RECORD_NOT_FOUND');
        }

        return record;
    }

    // ID-based operations - always work with arrays
    async selectIds<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        ids: string[],
        options: SelectOptions = {}
    ): Promise<DbRecord<T>[]> {
        if (ids.length === 0) return [];
        return await this.selectAny<T>(schemaName, { where: { id: { $in: ids } } }, options);
    }

    async updateIds<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        ids: string[],
        changes: Partial<T>
    ): Promise<DbRecord<T>[]> {
        if (ids.length === 0) return [];
        return await this.updateAny<T>(schemaName, { where: { id: { $in: ids } } }, changes);
    }

    async deleteIds<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        ids: string[]
    ): Promise<DbRecord<T>[]> {
        if (ids.length === 0) return [];

        // Convert IDs to delete records with just ID field
        const deleteRecords = ids.map(id => ({ id }));
        return await this.deleteAll<T>(schemaName, deleteRecords);
    }

    // Advanced operations - filter-based updates/deletes
    async selectAny<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filterData: FilterData = {},
        options: SelectOptions = {}
    ): Promise<DbRecord<T>[]> {
        const schema = await this.toSchema(schemaName);

        // Apply context-based soft delete defaults
        const defaultOptions = this.getDefaultSoftDeleteOptions(options.context);
        const mergedOptions = { ...defaultOptions, ...options };

        const filter = new Filter(schema.schema_name)
            .assign(filterData)
            .withSoftDeleteOptions(mergedOptions);

        // Use Filter.toSQL() pattern for proper separation of concerns
        const { query, params } = filter.toSQL();
        const result = await this.system.database.execute(query, params);

        // Convert PostgreSQL string types back to proper JSON types
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, schema));
    }

    /**
     * Get default soft delete options based on context
     *
     * - 'api': Excludes trashed and deleted records (default user-facing behavior)
     * - 'observer': Includes trashed but excludes deleted (observers may need trashed records)
     * - 'system': Includes everything (system-level operations)
     */
    private getDefaultSoftDeleteOptions(context?: 'api' | 'observer' | 'system'): FilterWhereOptions {
        switch (context) {
            case 'observer':
                return {
                    includeTrashed: true,
                    includeDeleted: false
                };
            case 'system':
                return {
                    includeTrashed: true,
                    includeDeleted: true
                };
            case 'api':
            default:
                return {
                    includeTrashed: false,
                    includeDeleted: false
                };
        }
    }

    /**
     * Convert PostgreSQL string results back to proper JSON types
     *
     * PostgreSQL returns all values as strings by default. This method converts
     * them back to the correct JSON types based on the schema column metadata.
     */
    private convertPostgreSQLTypes(record: any, schema: any): any {
        if (!schema.typedFields || schema.typedFields.size === 0) {
            return record;
        }

        return convertRecordPgToMonk(record, schema.typedFields);
    }

    async updateAny<T extends Record<string, any> = Record<string, any>>(
        schemaName: string,
        filterData: FilterData,
        changes: Partial<T>
    ): Promise<DbRecord<T>[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny<T>(schemaName, filterData, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Apply changes to each record
        const updates = records.map(record => ({
            id: record.id,
            ...changes,
        }));

        // 3. Bulk update all matched records
        return await this.updateAll<T>(schemaName, updates);
    }

    async deleteAny<T extends Record<string, any> = Record<string, any>>(
        schemaName: string,
        filter: FilterData
    ): Promise<DbRecord<T>[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny<T>(schemaName, filter, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Extract IDs and bulk delete
        const recordIds = records.map(record => record.id);
        return await this.deleteIds<T>(schemaName, recordIds);
    }

    async createOne<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        recordData: DbCreateInput<T>
    ): Promise<DbRecord<T>> {
        // Universal pattern: Single → Array → Observer Pipeline
        const results = await this.createAll<T>(schemaName, [recordData]);
        return results[0];
    }

    async updateOne<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        recordId: string,
        updates: Partial<T>
    ): Promise<DbRecord<T>> {
        const results = await this.updateAll<T>(schemaName, [{ id: recordId, ...updates }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    // Core batch update method - optimized for multiple records
    async updateAll<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        updates: DbUpdateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('update', schemaName, updates);
    }

    /**
     * Soft delete a single record by setting trashed_at timestamp.
     * Delegates to deleteAll() for consistency and efficiency.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     * @returns The updated record with trashed_at timestamp set
     */
    async deleteOne<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        recordId: string
    ): Promise<DbRecord<T>> {
        const results = await this.deleteAll<T>(schemaName, [{ id: recordId }]);

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
        schemaName: SchemaName,
        reverts: DbUpdateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('revert', schemaName, reverts);
    }

    /**
     * Revert a single soft-deleted record by setting trashed_at to NULL.
     * Delegates to revertAll() for consistency with updateOne/updateAll pattern.
     */
    async revertOne<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        recordId: string
    ): Promise<DbRecord<T>> {
        const results = await this.revertAll<T>(schemaName, [{ id: recordId, trashed_at: null } as unknown as DbUpdateInput<T>]);

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
        schemaName: SchemaName,
        filterData: FilterData = {}
    ): Promise<DbRecord<T>[]> {
        // First find all trashed records matching the filter
        // Note: This requires include_trashed=true to find trashed records
        if (!this.system.options.trashed) {
            throw HttpErrors.badRequest('revertAny() requires include_trashed=true option to find trashed records', 'REQUEST_INVALID_OPTIONS');
        }

        const trashedRecords = await this.selectAny<T>(schemaName, filterData, { includeTrashed: true, includeDeleted: false, context: 'system' });
        const recordsToRevert = trashedRecords.filter(record => record.trashed_at !== null).map(record => ({ id: record.id, trashed_at: null } as unknown as DbUpdateInput<T>));

        if (recordsToRevert.length === 0) {
            return [];
        }

        return await this.revertAll<T>(schemaName, recordsToRevert);
    }

    /**
     * Observer Pipeline Integration (Phase 3.5)
     *
     * Executes the complete observer pipeline for any database operation.
     * Handles recursion detection, transaction management, and selective ring execution.
     */
    private async runObserverPipeline(operation: OperationType, schemaName: string, data: any[], depth: number = 0): Promise<any[]> {
        // Recursion protection
        if (depth > Database.SQL_MAX_RECURSION) {
            throw new ObserverRecursionError(depth, Database.SQL_MAX_RECURSION);
        }

        const startTime = Date.now();

        console.info('Observer pipeline started', {
            operation,
            schemaName,
            recordCount: data.length,
            depth,
        });

        // 🎯 SINGLE POINT: Convert schemaName → schema object here
        const schema = await this.toSchema(schemaName);

        try {
            // Execute observer pipeline with resolved schema object
            const result = await this.executeObserverPipeline(operation, schema, data, depth + 1);

            // Transaction management now handled at route level via withTransactionParams

            // Performance timing for successful pipeline
            const duration = Date.now() - startTime;
            console.info('Observer pipeline completed', {
                operation,
                schemaName: schema.schema_name,
                recordCount: data.length,
                depth,
                durationMs: duration,
            });

            return result;
        } catch (error) {
            console.warn('Observer pipeline failed', {
                operation,
                schemaName: schema.schema_name,
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
    private async executeObserverPipeline(operation: OperationType, schema: Schema, data: any[], depth: number): Promise<any[]> {
        // Wrap input data in SchemaRecord instances
        const records = data.map(d => new SchemaRecord(schema, d));

        const runner = new ObserverRunner();

        const result = await runner.execute(
            this.system as any, // TODO: Fix System vs SystemContext type mismatch
            operation,
            schema,
            records,  // Pass SchemaRecord[] instead of any[]
            undefined, // existing records (DEPRECATED - RecordPreloader will inject into SchemaRecord.load())
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

        // Unwrap SchemaRecord instances back to plain objects
        // context.data is the single array flowing through the pipeline
        // SQL observers update it in-place with setCurrent()
        return records.map((r: SchemaRecord) => r.toObject());
    }

    // Database class doesn't handle transactions - System class does

    // Access control operations - separate from regular data updates
    async accessOne<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        recordId: string,
        accessChanges: DbAccessInput
    ): Promise<DbRecord<T>> {
        const schema = await this.toSchema(schemaName);

        // Verify record exists
        await this.select404<T>(schemaName, { where: { id: recordId } });

        // Only allow access_* field updates
        const allowedFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];
        const filteredChanges: Record<string, any> = {};

        for (const [key, value] of Object.entries(accessChanges)) {
            if (allowedFields.includes(key)) {
                filteredChanges[key] = value;
            } else {
                console.warn('Ignoring non-access field in accessOne', { field: key });
            }
        }

        if (Object.keys(filteredChanges).length === 0) {
            throw HttpErrors.badRequest('No valid access fields provided for accessOne operation', 'REQUEST_MISSING_FIELDS');
        }

        // Add updated_at for audit trail
        filteredChanges.updated_at = new Date().toISOString();

        // Build UPDATE query for access fields only
        const setClauses: string[] = [];
        for (const [key, value] of Object.entries(filteredChanges)) {
            if (allowedFields.includes(key) && Array.isArray(value)) {
                const pgArrayLiteral = `'{${value.join(',')}}'::uuid[]`;
                setClauses.push(`"${key}" = ${pgArrayLiteral}`);
            } else if (value === null) {
                setClauses.push(`"${key}" = NULL`);
            } else if (typeof value === 'string') {
                setClauses.push(`"${key}" = '${value.replace(/'/g, "''")}'`);
            } else {
                setClauses.push(`"${key}" = '${value}'`);
            }
        }

        const setClause = setClauses.join(', ');

        const result = await this.execute(`
            UPDATE "${schema.schema_name}"
            SET ${setClause}
            WHERE id = '${recordId}'
            RETURNING *
        `);

        return result.rows[0];
    }

    async accessAll<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        updates: Array<{ id: string; access: DbAccessInput }>
    ): Promise<DbRecord<T>[]> {
        const results: DbRecord<T>[] = [];
        for (const update of updates) {
            results.push(await this.accessOne<T>(schemaName, update.id, update.access));
        }
        return results;
    }

    async accessAny<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filter: FilterData,
        accessChanges: DbAccessInput
    ): Promise<DbRecord<T>[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny<T>(schemaName, filter, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Apply access changes to each record
        const accessUpdates = records.map(record => ({
            id: record.id,
            access: { ...accessChanges },
        }));

        // 3. Bulk update access permissions
        return await this.accessAll<T>(schemaName, accessUpdates);
    }

    // 404 operations - convenience methods that throw if not found
    async update404<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filter: FilterData,
        changes: Partial<T>,
        message?: string
    ): Promise<DbRecord<T>> {
        // First ensure record exists (throws if not found)
        const record = await this.select404<T>(schemaName, filter, message);

        return await this.updateOne<T>(schemaName, record.id, changes);
    }

    async delete404<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filter: FilterData,
        message?: string
    ): Promise<DbRecord<T>> {
        // First ensure record exists (throws if not found)
        const record = await this.select404<T>(schemaName, filter, message);
        return await this.deleteOne<T>(schemaName, record.id);
    }

    async access404<T extends Record<string, any> = Record<string, any>>(
        schemaName: SchemaName,
        filter: FilterData,
        accessChanges: DbAccessInput,
        message?: string
    ): Promise<DbRecord<T>> {
        // First ensure record exists (throws if not found)
        const record = await this.select404<T>(schemaName, filter, message);
        return await this.accessOne<T>(schemaName, record.id, accessChanges);
    }
}

// Database instances are now created per-request via System class
