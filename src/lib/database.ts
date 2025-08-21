import { db, builtins, type DbContext, type TxContext } from '../db/index.js';
import { Schema, type SchemaName } from './schema.js';
import { Filter, type FilterData } from './filter.js';
import { DatabaseManager } from './database-manager.js';
import type { Context } from 'hono';
import type { System } from './system.js';
import { SchemaCache } from './schema-cache.js';
import _ from 'lodash';

/**
 * Database service wrapper providing high-level operations
 * Per-request instance with specific database context
 */
export class Database {
    public readonly system: System;

    constructor(system: System) {
        this.system = system;
    }

    // Schema operations with caching - returns Schema instance
    async toSchema(schemaName: SchemaName): Promise<Schema> {
        console.debug(`Database.toSchema: requesting schema '${schemaName}'`);
        const schemaCache = SchemaCache.getInstance();
        const schemaRecord = await schemaCache.getSchema(this.system, schemaName);
        
        // Create Schema instance with validation capabilities
        const schema = new Schema(this.system, schemaName, schemaRecord.table_name, schemaRecord.definition);
        console.debug(`Database.toSchema: schema '${schemaName}' resolved`);
        return schema;
    }

    // List all schemas
    async listSchemas() {
        const query = `SELECT * FROM ${builtins.TABLE_NAMES.schemas}`;
        const result = await this.execute(query);
        return result.rows;
    }

    // Core operation. Execute raw SQL query
    async execute(query: string, params: any[] = []): Promise<any> {
        if (params.length > 0) {
            return await this.system.dtx.query(query, params);
        } else {
            return await this.system.dtx.query(query);
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


    async deleteAll(schemaName: SchemaName, deletes: Record<string, any>[]): Promise<any[]> {
        return Promise.all(deletes.map(record => {
            return this.deleteOne(schemaName, record.id);
        }));
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

    async deleteOne(schemaName: SchemaName, recordId: string): Promise<any> {
        const schema = await this.toSchema(schemaName);

        const result = await this.execute(`
            DELETE FROM "${schema.table}"
            WHERE id = '${recordId}'
            RETURNING id
        `);

        if (result.rows.length === 0) {
            throw new Error(`Record '${recordId}' not found`);
        }

        return { id: recordId, deleted: true };
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
