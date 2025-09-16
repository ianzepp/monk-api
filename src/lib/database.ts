import crypto from 'crypto';
import pg from 'pg';

import modash from '@src/lib/modash.js';
import type { SystemContextWithInfrastructure } from '@src/lib/system-context-types.js';
import { Schema, type SchemaName } from '@src/lib/schema.js';
import { Filter } from '@src/lib/filter.js';
import type { FilterData } from '@src/lib/filter-types.js';
import type { FilterWhereOptions } from '@src/lib/filter-types.js';
import { SchemaCache } from '@src/lib/schema-cache.js';
import { PipelineRunner } from '@src/lib/pipeline/runner.js';
import { PipelineRecursionError, SystemError } from '@src/lib/pipeline/errors.js';
import type { OperationType } from '@src/lib/pipeline/types.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

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
    private get dbContext(): pg.Pool | pg.PoolClient {
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

    //
    // SELECT operations
    //

    async count(schemaName: SchemaName, filterData: FilterData = {}): Promise<number> {
        const schema = await this.toSchema(schemaName);
        const filter = new Filter(schema.table).assign(filterData);

        // Issue #102: Use toCountSQL() pattern instead of manual query building
        const { query, params } = filter.toCountSQL();
        const result = await this.execute(query, params);

        return parseInt(result.rows[0].count as string);
    }

    async selectAny(schemaName: SchemaName, filterData: FilterData = {}, options: SelectOptions = {}): Promise<any[]> {
        const schema = await this.toSchema(schemaName);

        // Apply context-based soft delete defaults
        const defaultOptions = this.getDefaultSoftDeleteOptions(options.context);
        const mergedOptions = { ...defaultOptions, ...options };

        const filter = new Filter(schema.table).assign(filterData).withSoftDeleteOptions(mergedOptions);

        // Use Filter.toSQL() pattern for proper separation of concerns
        const { query, params } = filter.toSQL();
        const result = await this.system.database.execute(query, params);

        // Convert PostgreSQL string types back to proper JSON types
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, schema));
    }

    async selectIds(schemaName: SchemaName, ids: string[], options: SelectOptions = {}): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.selectAny(schemaName, { where: { id: { $in: ids } } }, options);
    }

    async selectAll(schemaName: SchemaName, records: Record<string, any>[], options: SelectOptions = {}): Promise<any[]> {
        return await this.selectIds(schemaName, records.map(record => record.id).filter(id => id !== undefined), options);
    }

    async selectOne(schemaName: SchemaName, filter: FilterData, options: SelectOptions = {}): Promise<any | null> {
        return await this.selectAny(schemaName, filter, options).then(modash.head);
    }

    async select404(schemaName: SchemaName, filter: FilterData, message?: string, options: SelectOptions = {}): Promise<any> {
        const record = await this.selectOne(schemaName, filter, options);

        if (!record) {
            throw HttpErrors.notFound(message || 'Record not found', 'RECORD_NOT_FOUND');
        }

        return record;
    }

    //
    // CREATE operations
    //

    async createAll(schemaName: SchemaName, records: Record<string, any>[]): Promise<any[]> {
        return await this.run('create', schemaName, records);
    }

    async createOne(schemaName: SchemaName, record: Record<string, any>): Promise<any> {
        return await this.run('create', schemaName, [record]).then(modash.head);
    }

    //
    // UPDATE operations
    //

    async updateAny(schemaName: string, filterData: FilterData, changes: Record<string, any>): Promise<any[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny(schemaName, filterData, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Apply changes to each record
        const updates = records.map(record => ({
            id: record.id,
            ...changes,
        }));

        // 3. Bulk update all matched records
        return await this.updateAll(schemaName, updates);
    }

    async updateIds(schemaName: SchemaName, ids: string[], changes: Record<string, any>): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.updateAny(schemaName, { where: { id: { $in: ids } } }, changes);
    }

    async updateAll(schemaName: SchemaName, updates: Record<string, any>[]): Promise<any[]> {
        return await this.run('update', schemaName, updates);
    }

    async updateOne(schemaName: SchemaName, recordId: string, updates: Record<string, any>): Promise<any> {
        const results = await this.updateAll(schemaName, [{ id: recordId, ...updates }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    async update404(schemaName: SchemaName, filter: FilterData, changes: Record<string, any>, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, message);

        return await this.updateOne(schemaName, record.id, changes);
    }

    //
    // DELETE operations
    //

    async deleteAny(schemaName: string, filter: FilterData): Promise<any[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny(schemaName, filter, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Extract IDs and bulk delete
        const recordIds = records.map(record => record.id);
        return await this.deleteIds(schemaName, recordIds);
    }

    async deleteIds(schemaName: SchemaName, ids: string[]): Promise<any[]> {
        if (ids.length === 0) return [];

        // Convert IDs to delete records with just ID field
        const deleteRecords = ids.map(id => ({ id }));
        return await this.deleteAll(schemaName, deleteRecords);
    }

    async deleteAll(schemaName: SchemaName, deletes: Record<string, any>[]): Promise<any[]> {
        return await this.run('delete', schemaName, deletes);
    }

    async deleteOne(schemaName: SchemaName, recordId: string): Promise<any> {
        const results = await this.deleteAll(schemaName, [{ id: recordId }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found or already trashed', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    async delete404(schemaName: SchemaName, filter: FilterData, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, message);
        return await this.deleteOne(schemaName, record.id);
    }

    //
    // REVERT operations
    //

    async revertAll(schemaName: SchemaName, reverts: Record<string, any>[]): Promise<any[]> {
        // Universal pattern: Array → Pipeline Pipeline
        return await this.runPipelinePipeline('revert', schemaName, reverts);
    }

    async revertOne(schemaName: SchemaName, recordId: string): Promise<any> {
        const results = await this.revertAll(schemaName, [{ id: recordId, trashed_at: null }]);

        if (results.length === 0) {
            throw HttpErrors.notFound('Record not found or not trashed', 'RECORD_NOT_FOUND');
        }

        return results[0];
    }

    async revertAny(schemaName: SchemaName, filterData: FilterData = {}): Promise<any[]> {
        // First find all trashed records matching the filter
        // Note: This requires include_trashed=true to find trashed records
        if (!this.system.options.trashed) {
            throw HttpErrors.badRequest('revertAny() requires include_trashed=true option to find trashed records', 'REQUEST_INVALID_OPTIONS');
        }

        const trashedRecords = await this.selectAny(schemaName, filterData, { includeTrashed: true, includeDeleted: false, context: 'system' });
        const recordsToRevert = trashedRecords.filter(record => record.trashed_at !== null).map(record => ({ id: record.id, trashed_at: null }));

        if (recordsToRevert.length === 0) {
            return [];
        }

        return await this.revertAll(schemaName, recordsToRevert);
    }

    //
    // ACCESS operations
    //

    async accessOne(schemaName: SchemaName, recordId: string, accessChanges: Record<string, any>): Promise<any> {
        const schema = await this.toSchema(schemaName);

        // Verify record exists
        await this.select404(schemaName, { where: { id: recordId } });

        // Only allow access_* field updates
        const allowedFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];
        const filteredChanges: Record<string, any> = {};

        for (const [key, value] of Object.entries(accessChanges)) {
            if (allowedFields.includes(key)) {
                filteredChanges[key] = value;
            } else {
                logger.warn('Ignoring non-access field in accessOne', { field: key });
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
            UPDATE "${schema.table}"
            SET ${setClause}
            WHERE id = '${recordId}'
            RETURNING *
        `);

        return result.rows[0];
    }

    async accessAll(schemaName: SchemaName, updates: Array<{ id: string; access: Record<string, any> }>): Promise<any[]> {
        const results: any[] = [];
        for (const update of updates) {
            results.push(await this.accessOne(schemaName, update.id, update.access));
        }
        return results;
    }

    async accessAny(schemaName: SchemaName, filter: FilterData, accessChanges: Record<string, any>): Promise<any[]> {
        // 1. Find all records matching the filter - use system context for internal operations
        const records = await this.selectAny(schemaName, filter, { context: 'system' });

        if (records.length === 0) {
            return [];
        }

        // 2. Apply access changes to each record
        const accessUpdates = records.map(record => ({
            id: record.id,
            access: { ...accessChanges },
        }));

        // 3. Bulk update access permissions
        return await this.accessAll(schemaName, accessUpdates);
    }

    async access404(schemaName: SchemaName, filter: FilterData, accessChanges: Record<string, any>, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, message);
        return await this.accessOne(schemaName, record.id, accessChanges);
    }

    /**
     * Pipeline Integration (Phase 3.5)
     *
     * Executes the complete observer pipeline for any database operation.
     * Handles recursion detection, transaction management, and selective ring execution.
     */

    private async run(operation: OperationType, schemaName: string, data: any[], depth: number = 0): Promise<any[]> {
        // Recursion protection
        if (depth > Database.SQL_MAX_RECURSION) {
            throw new PipelineRecursionError(depth, Database.SQL_MAX_RECURSION);
        }

        const startTime = Date.now();

        logger.info('Pipeline pipeline started', {
            operation,
            schemaName,
            recordCount: data.length,
            depth,
        });

        // 🎯 SINGLE POINT: Convert schemaName → schema object here
        const schema = await this.toSchema(schemaName);

        try {
            // Execute observer pipeline with resolved schema object
            const result = await this.executePipeline(operation, schema, data, depth + 1);

            // Transaction management now handled at route level via withTransactionParams

            // Performance timing for successful pipeline
            const duration = Date.now() - startTime;
            logger.info('Pipeline completed', {
                operation,
                schemaName: schema.name,
                recordCount: data.length,
                depth,
                durationMs: duration,
            });

            return result;
        } catch (error) {
            logger.warn('Pipeline failed', {
                operation,
                schemaName: schema.name,
                recordCount: data.length,
                depth,
                error: error instanceof Error ? error.message : String(error),
            });

            // Transaction rollback now handled at route level via withTransactionParams

            throw error instanceof Error ? error : new SystemError(`Pipeline failed: ${error}`);
        }
    }

    /**
     * Execute observer pipeline within existing transaction context
     */
    private async executePipelinePipeline(operation: OperationType, schema: Schema, data: any[], depth: number): Promise<any[]> {
        const runner = new PipelineRunner();

        const result = await runner.execute(
            this.system as any, // TODO: Fix System vs SystemContext type mismatch
            operation,
            schema,
            data,
            undefined, // existing records (for updates)
            depth
        );

        if (!result.success) {
            throw new SystemError(`Pipeline pipeline validation failed: ${result.errors?.map(e => e.message).join(', ')}`);
        }

        return result.result || data;
    }

    // Database class doesn't handle transactions - System class does

    // Access control operations - separate from regular data updates


    // 404 operations - convenience methods that throw if not found


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
                    includeDeleted: false,
                };
            case 'system':
                return {
                    includeTrashed: true,
                    includeDeleted: true,
                };
            case 'api':
            default:
                return {
                    includeTrashed: false,
                    includeDeleted: false,
                };
        }
    }

    /**
     * Convert PostgreSQL string results back to proper JSON types
     *
     * PostgreSQL returns all values as strings by default. This method converts
     * them back to the correct JSON types based on the schema definition.
     */
    private convertPostgreSQLTypes(record: any, schema: any): any {
        if (!schema.definition?.properties) {
            return record;
        }

        const converted = { ...record };
        const properties = schema.definition.properties;

        for (const [fieldName, fieldDef] of Object.entries(properties)) {
            if (converted[fieldName] !== null && converted[fieldName] !== undefined) {
                const fieldDefinition = fieldDef as any;

                switch (fieldDefinition.type) {
                    case 'number':
                    case 'integer':
                        if (typeof converted[fieldName] === 'string') {
                            converted[fieldName] = Number(converted[fieldName]);
                        }
                        break;

                    case 'boolean':
                        if (typeof converted[fieldName] === 'string') {
                            converted[fieldName] = converted[fieldName] === 'true';
                        }
                        break;

                    // Arrays and objects should already be handled by PostgreSQL
                    // Strings and dates can remain as strings
                }
            }
        }

        return converted;
    }
}

// Database instances are now created per-request via System class
