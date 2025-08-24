import { db, builtins, type DbContext, type TxContext } from '@src/db/index.js';
import { Schema, type SchemaName } from '@lib/schema.js';
import { Filter, type FilterData } from '@lib/filter.js';
import { DatabaseManager } from '@lib/database-manager.js';
import type { Context } from 'hono';
import type { SystemContextWithInfrastructure } from '@lib/types/system-context.js';
import { SchemaCache } from '@lib/schema-cache.js';
import { ObserverRunner } from '@lib/observers/runner.js';
import { ObserverRecursionError, SystemError } from '@lib/observers/errors.js';
import type { OperationType } from '@lib/observers/types.js';
import _ from 'lodash';
import crypto from 'crypto';

/**
 * Database service wrapper providing high-level operations
 * Per-request instance with specific database context
 * 
 * Uses dependency injection pattern to break circular dependencies:
 * - SystemContext provides business context
 * - DbContext/TxContext injected separately for database access
 */
export class Database {
    public readonly system: SystemContextWithInfrastructure;
    public readonly dtx: DbContext | TxContext;
    
    /** Maximum observer recursion depth to prevent infinite loops */
    static readonly SQL_MAX_RECURSION = 3;

    constructor(system: SystemContextWithInfrastructure, dtx: DbContext | TxContext) {
        this.system = system;
        this.dtx = dtx;
    }

    // Schema operations with caching - returns Schema instance
    async toSchema(schemaName: SchemaName): Promise<Schema> {
        console.debug(`Database.toSchema: requesting schema '${schemaName}'`);
        const schemaCache = SchemaCache.getInstance();
        const schemaRecord = await schemaCache.getSchema(this.system, schemaName);
        
        // Create Schema instance with validation capabilities
        const schema = new Schema(this.system, schemaName, schemaRecord);
        console.debug(`Database.toSchema: schema '${schemaName}' resolved`);
        return schema;
    }

    // List all schemas
    async listSchemas() {
        const query = `SELECT * FROM ${builtins.TABLE_NAMES.schema}`;
        const result = await this.execute(query);
        return result.rows;
    }

    // Core operation. Execute raw SQL query
    async execute(query: string, params: any[] = []): Promise<any> {
        if (params.length > 0) {
            return await this.dtx.query(query, params);
        } else {
            return await this.dtx.query(query);
        }
    }

    // Count
    async count(schemaName: SchemaName, filterData: FilterData = {}): Promise<number> {
        const schema = await this.toSchema(schemaName);
        const filter = new Filter(this.system, schemaName, schema.table).assign(filterData);

        // Issue #102: Use toCountSQL() pattern instead of manual query building
        const { query, params } = filter.toCountSQL();
        const result = await this.execute(query);

        return parseInt(result.rows[0].count as string);
    }

    async selectAll(schemaName: SchemaName, records: Record<string, any>[]): Promise<any[]> {
        // Extract IDs from records
        const ids = records.map(record => record.id).filter(id => id !== undefined);
        
        if (ids.length === 0) {
            return [];
        }
        
        // Use selectAny with ID filter - lenient approach, returns what exists
        return await this.selectAny(schemaName, { where: { id: { $in: ids } } });
    }

    async createAll(schemaName: SchemaName, records: Record<string, any>[]): Promise<any[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('create', schemaName, records);
    }


    /**
     * Core batch soft delete method - optimized for multiple records.
     * Soft delete multiple records by setting trashed_at timestamp using single batch UPDATE query.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     */
    async deleteAll(schemaName: SchemaName, deletes: Record<string, any>[]): Promise<any[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('delete', schemaName, deletes);
    }
    
    // Core data operations
    async selectOne(schemaName: SchemaName, filterData: FilterData): Promise<any | null> {
        return await this.selectAny(schemaName, filterData).then(_.head);
    }

    async select404(schemaName: SchemaName, filter: FilterData, message?: string): Promise<any> {
        const record = await this.selectOne(schemaName, filter);

        if (!record) {
            throw new Error(message || `Record not found in schema '${schemaName}'`);
        }

        return record;
    }

    // ID-based operations - always work with arrays
    async selectIds(schemaName: SchemaName, ids: string[]): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.selectAny(schemaName, { where: { id: { $in: ids } } });
    }

    async updateIds(schemaName: SchemaName, ids: string[], changes: Record<string, any>): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.updateAny(schemaName, { where: { id: { $in: ids } } }, changes);
    }

    async deleteIds(schemaName: SchemaName, ids: string[]): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.deleteAny(schemaName, { where: { id: { $in: ids } } });
    }

    // Advanced operations - filter-based updates/deletes
    async selectAny(schemaName: SchemaName, filterData: FilterData = {}): Promise<any[]> {
        const schema = await this.toSchema(schemaName);
        const filter = new Filter(this.system, schemaName, schema.table).assign(filterData);
        
        // Issue #102: Use toSQL() pattern instead of direct filter.execute()
        const { query, params } = filter.toSQL();
        const result = await this.system.database.execute(query);
        return result.rows;
    }

    async updateAny(schemaName: string, filterData: FilterData, changes: Record<string, any>): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAny(schemaName, filterData);

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

    async deleteAny(schemaName: string, filter: FilterData): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAny(schemaName, filter);

        if (records.length === 0) {
            return [];
        }

        // 2. Extract IDs and bulk delete
        const recordIds = records.map(record => record.id);
        return await this.deleteIds(schemaName, recordIds);
    }

    async createOne(schemaName: SchemaName, recordData: Record<string, any>): Promise<any> {
        // Universal pattern: Single → Array → Observer Pipeline
        const results = await this.createAll(schemaName, [recordData]);
        return results[0];
    }

    async updateOne(schemaName: SchemaName, recordId: string, updates: Record<string, any>): Promise<any> {
        const results = await this.updateAll(schemaName, [{ id: recordId, ...updates }]);
        
        if (results.length === 0) {
            throw new Error(`Record '${recordId}' not found in schema '${schemaName}'`);
        }
        
        return results[0];
    }

    // Core batch update method - optimized for multiple records
    async updateAll(schemaName: SchemaName, updates: Record<string, any>[]): Promise<any[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('update', schemaName, updates);
    }

    /**
     * Soft delete a single record by setting trashed_at timestamp.
     * Delegates to deleteAll() for consistency and efficiency.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     * @returns The updated record with trashed_at timestamp set
     */
    async deleteOne(schemaName: SchemaName, recordId: string): Promise<any> {
        const results = await this.deleteAll(schemaName, [{ id: recordId }]);
        
        if (results.length === 0) {
            throw new Error(`Record '${recordId}' not found or already trashed`);
        }
        
        return results[0];
    }

    /**
     * Revert multiple soft-deleted records by setting trashed_at to NULL.
     * Core batch implementation for record restoration.
     * Validates that records are actually trashed before reverting.
     * @returns Array of reverted records with trashed_at set to null
     */
    async revertAll(schemaName: SchemaName, reverts: Record<string, any>[]): Promise<any[]> {
        // Universal pattern: Array → Observer Pipeline
        return await this.runObserverPipeline('revert', schemaName, reverts);
    }

    /**
     * Revert a single soft-deleted record by setting trashed_at to NULL.
     * Delegates to revertAll() for consistency with updateOne/updateAll pattern.
     */
    async revertOne(schemaName: SchemaName, recordId: string): Promise<any> {
        const results = await this.revertAll(schemaName, [{ id: recordId, trashed_at: null }]);
        
        if (results.length === 0) {
            throw new Error(`Record '${recordId}' not found or not trashed`);
        }
        
        return results[0];
    }

    /**
     * Revert multiple records using filter criteria.
     * Finds trashed records matching filter, then reverts them.
     */
    async revertAny(schemaName: SchemaName, filterData: FilterData = {}): Promise<any[]> {
        // First find all trashed records matching the filter
        // Note: This requires include_trashed=true to find trashed records
        if (!this.system.options.trashed) {
            throw new Error('revertAny() requires include_trashed=true option to find trashed records');
        }
        
        const trashedRecords = await this.selectAny(schemaName, filterData);
        const recordsToRevert = trashedRecords
            .filter(record => record.trashed_at !== null)
            .map(record => ({ id: record.id, trashed_at: null }));
        
        if (recordsToRevert.length === 0) {
            return [];
        }
        
        return await this.revertAll(schemaName, recordsToRevert);
    }

    /**
     * Observer Pipeline Integration (Phase 3.5)
     * 
     * Executes the complete observer pipeline for any database operation.
     * Handles recursion detection, transaction management, and selective ring execution.
     */
    private async runObserverPipeline(
        operation: OperationType,
        schema: string,
        data: any[],
        depth: number = 0
    ): Promise<any[]> {
        // Recursion protection
        if (depth > Database.SQL_MAX_RECURSION) {
            throw new ObserverRecursionError(depth, Database.SQL_MAX_RECURSION);
        }

        console.debug(`🔄 Starting observer pipeline: ${operation} on ${schema} (${data.length} records, depth ${depth})`);
        
        try {
            // For now, execute observer pipeline directly 
            // TODO: Implement proper transaction management in Ring 5
            return await this.executeObserverPipeline(operation, schema, data, depth + 1);
            
        } catch (error) {
            console.error(`💥 Observer pipeline failed: ${operation} on ${schema}`, error);
            throw error instanceof Error ? error : new SystemError(`Observer pipeline failed: ${error}`);
        }
    }
    
    /**
     * Execute observer pipeline within existing transaction context
     */
    private async executeObserverPipeline(
        operation: OperationType,
        schema: string,
        data: any[],
        depth: number
    ): Promise<any[]> {
        const runner = new ObserverRunner();
        
        const result = await runner.execute(
            this.system as any, // TODO: Fix System vs SystemContext type mismatch
            operation,
            schema,
            data,
            undefined, // existing records (for updates)
            depth
        );
        
        if (!result.success) {
            throw new SystemError(`Observer pipeline validation failed: ${result.errors?.map(e => e.message).join(', ')}`);
        }
        
        return result.result || data;
    }

    // Database class doesn't handle transactions - System class does

    // Access control operations - separate from regular data updates
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
                console.warn(`Ignoring non-access field in accessOne: ${key}`);
            }
        }

        if (Object.keys(filteredChanges).length === 0) {
            throw new Error('No valid access fields provided for accessOne operation');
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
        // 1. Find all records matching the filter
        const records = await this.selectAny(schemaName, filter);

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

    // 404 operations - convenience methods that throw if not found
    async update404(schemaName: SchemaName, filter: FilterData, changes: Record<string, any>, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, message);

        return await this.updateOne(schemaName, record.id, changes);
    }

    async delete404(schemaName: SchemaName, filter: FilterData, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, message);
        return await this.deleteOne(schemaName, record.id);
    }

    async access404(schemaName: SchemaName, filter: FilterData, accessChanges: Record<string, any>, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, message);
        return await this.accessOne(schemaName, record.id, accessChanges);
    }
}

// Database instances are now created per-request via System class
