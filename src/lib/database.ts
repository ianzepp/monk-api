import { db, builtins, type DbContext, type TxContext } from '@src/db/index.js';
import { Schema, type SchemaName } from '@lib/schema.js';
import { Filter, type FilterData } from '@lib/filter.js';
import { DatabaseManager } from '@lib/database-manager.js';
import type { Context } from 'hono';
import type { SystemContext } from '@lib/types/system-context.js';
import { SchemaCache } from '@lib/schema-cache.js';
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
    public readonly system: SystemContext;
    public readonly dtx: DbContext | TxContext;

    constructor(system: SystemContext, dtx: DbContext | TxContext) {
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

        // Generate WHERE clause from filter and use it in COUNT query
        const whereClause = filter.getWhereClause();
        const result = await this.execute(`SELECT COUNT(*) as count FROM "${schema.table}" WHERE ${whereClause}`);

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
        return Promise.all(records.map(record => {
            return this.createOne(schemaName, record);
        }));
    }


    /**
     * Core batch soft delete method - optimized for multiple records.
     * Soft delete multiple records by setting trashed_at timestamp using single batch UPDATE query.
     * Records with trashed_at set are automatically excluded from select queries via Filter class.
     */
    async deleteAll(schemaName: SchemaName, deletes: Record<string, any>[]): Promise<any[]> {
        if (deletes.length === 0) return [];
        
        console.debug(`Database.deleteAll: starting batch delete for schema '${schemaName}', ${deletes.length} records`);
        
        const schema = await this.toSchema(schemaName);
        
        // Protect system schemas from data operations
        if (schema.isSystemSchema()) {
            throw new Error(`Cannot delete records in system schema "${schemaName}" - use meta API for schema management`);
        }
        
        // 1. Extract IDs and validate we have them
        const ids = deletes.map(record => record.id).filter(id => id !== undefined);
        console.debug(`Database.deleteAll: extracted ${ids.length} IDs:`, ids);
        
        if (ids.length !== deletes.length) {
            throw new Error('All delete records must have an id field');
        }
        
        // 2. Execute efficient batch soft delete using single UPDATE query with WHERE IN
        console.debug(`Database.deleteAll: executing batch soft delete for ${ids.length} records`);
        
        const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
        const result = await this.execute(`
            UPDATE "${schema.table}"
            SET trashed_at = NOW(), updated_at = NOW()
            WHERE id IN (${placeholders})
            AND trashed_at IS NULL
            RETURNING *
        `, ids);
        
        console.debug(`Database.deleteAll: soft deleted ${result.rows.length} records`);
        
        if (result.rows.length !== ids.length) {
            const deletedIds = result.rows.map((r: any) => r.id);
            const missingIds = ids.filter(id => !deletedIds.includes(id));
            throw new Error(`Some records not found or already trashed: ${missingIds.join(', ')}`);
        }
        
        return result.rows;
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
        return await filter.execute();
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
        const schema = await this.toSchema(schemaName);

        // Protect system schemas from data operations
        if (schema.isSystemSchema()) {
            throw new Error(`Cannot create records in system schema "${schemaName}" - use meta API for schema management`);
        }

        // Validate record data against schema definition
        schema.validateOrThrow(recordData);

        // Generate new record with base fields
        const newRecord = {
            id: crypto.randomUUID(),
            domain: recordData.domain || null,
            access_read: recordData.access_read || [],
            access_edit: recordData.access_edit || [],
            access_full: recordData.access_full || [],
            access_deny: recordData.access_deny || [],
            ...recordData,
        };

        // Build INSERT query
        const columns: string[] = [];
        const valueParams: any[] = [];

        for (const [key, value] of Object.entries(newRecord)) {
            columns.push(key);
            if ((key === 'access_read' || key === 'access_edit' || key === 'access_full' || key === 'access_deny') && Array.isArray(value)) {
                const pgArrayLiteral = `'{${value.join(',')}}'::uuid[]`;
                valueParams.push(pgArrayLiteral);
            } else if (value === null) {
                valueParams.push('NULL');
            } else if (typeof value === 'string') {
                valueParams.push(`'${value.replace(/'/g, "''")}'`);
            } else {
                valueParams.push(`'${value}'`);
            }
        }

        const columnList = columns.map(c => `"${c}"`).join(', ');
        const valueList = valueParams.join(', ');

        const result = await this.execute(`
            INSERT INTO "${schema.table}" 
            (${columnList}) 
            VALUES (${valueList})
            RETURNING *
        `);

        const createdRecord = result.rows[0];
        return createdRecord;
    }

    // Optimized: updateOne() delegates to updateAll() for efficiency
    async updateOne(schemaName: SchemaName, recordId: string, updates: Record<string, any>): Promise<any> {
        const results = await this.updateAll(schemaName, [{ id: recordId, ...updates }]);
        
        if (results.length === 0) {
            throw new Error(`Record '${recordId}' not found in schema '${schemaName}'`);
        }
        
        return results[0];
    }

    // Core batch update method - optimized for multiple records
    async updateAll(schemaName: SchemaName, updates: Record<string, any>[]): Promise<any[]> {
        if (updates.length === 0) return [];
        
        console.debug(`Database.updateAll: starting batch update for schema '${schemaName}', ${updates.length} records`);
        
        const schema = await this.toSchema(schemaName);
        
        // Protect system schemas from data operations
        if (schema.isSystemSchema()) {
            throw new Error(`Cannot update records in system schema "${schemaName}" - use meta API for schema management`);
        }
        
        // 1. Extract IDs and validate we have them
        const ids = updates.map(update => update.id).filter(id => id !== undefined);
        console.debug(`Database.updateAll: extracted ${ids.length} IDs:`, ids);
        
        if (ids.length !== updates.length) {
            throw new Error('All update records must have an id field');
        }
        
        // 2. Batch fetch existing records to verify they exist and for validation merging
        console.debug(`Database.updateAll: fetching existing records for validation merge`);
        const existingRecords = await this.selectIds(schemaName, ids);
        console.debug(`Database.updateAll: found ${existingRecords.length} existing records`);
        
        if (existingRecords.length !== ids.length) {
            const foundIds = existingRecords.map(r => r.id);
            const missingIds = ids.filter(id => !foundIds.includes(id));
            throw new Error(`Records not found: ${missingIds.join(', ')}`);
        }
        
        // 2.5. Validate that no records are trashed or deleted (Issue #30)
        console.debug(`Database.updateAll: checking for trashed/deleted records`);
        const trashedRecords = existingRecords.filter(r => r.trashed_at !== null);
        const deletedRecords = existingRecords.filter(r => r.deleted_at !== null);
        
        if (trashedRecords.length > 0) {
            const trashedIds = trashedRecords.map(r => r.id);
            throw new Error(`Cannot update trashed record(s): ${trashedIds.join(', ')}. Restore the record(s) first using PATCH with trashed_at: null`);
        }
        
        if (deletedRecords.length > 0) {
            const deletedIds = deletedRecords.map(r => r.id);
            throw new Error(`Cannot update deleted record(s): ${deletedIds.join(', ')}. Restore the record(s) first using PATCH with deleted_at: null`);
        }
        
        // 3. Create lookup map for existing records
        const existingMap = new Map(existingRecords.map(record => [record.id, record]));
        
        // 4. Merge updates with existing records and validate complete records
        console.debug(`Database.updateAll: starting validation merge for ${updates.length} updates`);
        
        // Optimize: Get required fields once for all records in this batch
        const requiredFields = new Set(schema.definition?.required || []);
        console.debug(`Database.updateAll: required fields for validation:`, Array.from(requiredFields));
        
        const validatedUpdates = [];
        for (let i = 0; i < updates.length; i++) {
            const update = updates[i];
            const existing = existingMap.get(update.id)!;
            const mergedRecord = { ...existing, ...update };
            
            // Remove null values for optional fields before validation
            const cleanedRecord = { ...mergedRecord };
            for (const [key, value] of Object.entries(cleanedRecord)) {
                if (value === null && !requiredFields.has(key)) {
                    delete cleanedRecord[key];
                }
            }
            
            console.debug(`Database.updateAll: validating merged record ${i + 1}/${updates.length} for ID ${update.id}`);
            console.debug(`Database.updateAll: existing record:`, existing);
            console.debug(`Database.updateAll: update data:`, update);
            console.debug(`Database.updateAll: merged record:`, mergedRecord);
            console.debug(`Database.updateAll: cleaned record (for validation):`, cleanedRecord);
            
            // Validate the cleaned merged record
            schema.validateOrThrow(cleanedRecord);
            console.debug(`Database.updateAll: validation passed for record ${i + 1}`);
            
            validatedUpdates.push({
                id: update.id,
                changes: { ...update, updated_at: new Date().toISOString() }
            });
        }
        
        // 5. Execute batch update
        const results = [];
        for (const { id, changes } of validatedUpdates) {
            const setClauses: string[] = [];
            for (const [key, value] of Object.entries(changes)) {
                if (key === 'id') continue; // Skip ID in SET clause
                
                if ((key === 'access_read' || key === 'access_edit' || key === 'access_full' || key === 'access_deny') && Array.isArray(value)) {
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
                WHERE id = '${id}'
                RETURNING *
            `);
            
            results.push(result.rows[0]);
        }
        
        return results;
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
        if (reverts.length === 0) return [];
        
        const schema = await this.toSchema(schemaName);
        const ids = reverts.map(record => record.id).filter(id => id !== undefined);
        
        if (ids.length === 0) {
            throw new Error('No valid IDs provided for revert operation');
        }
        
        // Validate all records are actually trashed (with include_trashed option)
        const trashedRecords = await this.selectAny(schemaName, { 
            where: { id: { $in: ids } }
        });
        
        // Check if we have trashed records when include_trashed=true should be set
        if (trashedRecords.length === 0 && !this.system.options.trashed) {
            throw new Error('No trashed records found. Use ?include_trashed=true to revert soft-deleted records');
        }
        
        // Find records that are not actually trashed
        const trashedIds = trashedRecords.filter(r => r.trashed_at !== null).map(r => r.id);
        const nonTrashedIds = ids.filter(id => !trashedIds.includes(id));
        
        if (nonTrashedIds.length > 0) {
            throw new Error(`Cannot revert non-trashed records: ${nonTrashedIds.join(', ')}`);
        }
        
        // Validate that revert data includes trashed_at: null
        for (const record of reverts) {
            if (record.trashed_at !== null) {
                throw new Error(`Revert operation requires trashed_at: null. Record ${record.id} has trashed_at: ${record.trashed_at}`);
            }
        }
        
        // Perform batch revert using UPDATE
        const idsString = ids.map(id => `'${id}'`).join(', ');
        const result = await this.execute(`
            UPDATE "${schema.table}"
            SET trashed_at = NULL, updated_at = NOW()
            WHERE id IN (${idsString}) AND trashed_at IS NOT NULL
            RETURNING *
        `);
        
        if (result.rows.length !== ids.length) {
            throw new Error(`Revert operation failed. Expected ${ids.length} records, reverted ${result.rows.length}`);
        }
        
        return result.rows;
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
