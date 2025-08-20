import { db, builtins, type DbContext, type TxContext } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { Schema, type SchemaName } from './schema.js';
import { Filter, type FilterData } from './filter.js';
import _ from 'lodash';

/**
 * Database service wrapper providing high-level operations
 * Simplified version of the 2019 database-service.ts
 */
export class Database {
    private static instance: Database;

    static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }

    // Schema operations
    async toSchema(schemaName: SchemaName, dtx: DbContext | TxContext = db) {
        const result = await dtx
            .select()
            .from(builtins.schemas)
            .where(eq(builtins.schemas.name, schemaName))
            .limit(1);

        if (result.length == 0) {
            throw new Error(`Schema '${schemaName}' not found`);
        }

        return result[0];
    }

    // Count
    async count(schemaName: SchemaName, filterData: FilterData = {}, dtx: DbContext | TxContext = db): Promise<number> {
        const schema = await this.toSchema(schemaName, dtx);
        const filter = new Filter(schemaName, schema.table_name, dtx).assign(filterData);

        // TODO implement actual filtering
        const countQuery = `SELECT COUNT(*) as count FROM "${schema.table_name}" WHERE 1=1`;
        const result = await dtx.execute(sql.raw(countQuery));

        return parseInt(result.rows[0].count as string);
    }

    async selectAll(schemaName: SchemaName, records: Record<string, any>[], tx: TxContext): Promise<any[]> {
        // TODO
        return [];
    }

    async createAll(schemaName: SchemaName, records: Record<string, any>[], tx: TxContext): Promise<any[]> {
        return Promise.all(records.map(record => {
            return this.createOne(schemaName, record, tx);
        }));
    }

    async updateAll(schemaName: SchemaName, updates: Record<string, any>[], tx: TxContext): Promise<any[]> {
        return Promise.all(updates.map(record => {
            return this.updateOne(schemaName, record.id, record, tx);
        }));
    }

    async deleteAll(schemaName: SchemaName, deletes: Record<string, any>[], tx: TxContext): Promise<any[]> {
        return Promise.all(deletes.map(record => {
            return this.deleteOne(schemaName, record.id, tx);
        }));
    }
    
    // Core data operations
    async selectOne(schemaName: SchemaName, filterData: FilterData, dtx: DbContext | TxContext = db): Promise<any | null> {
        return await this.selectAny(schemaName, filterData, dtx).then(_.head);
    }

    async select404(schemaName: SchemaName, filter: FilterData, dtx: DbContext | TxContext = db, message?: string): Promise<any> {
        const record = await this.selectOne(schemaName, filter, dtx);

        if (!record) {
            throw new Error(message || `Record not found in schema '${schemaName}'`);
        }

        return record;
    }

    // ID-based operations - always work with arrays
    async selectIds(schemaName: SchemaName, ids: string[], dtx: DbContext | TxContext = db): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.selectAny(schemaName, { where: { id: ids } }, dtx);
    }

    async updateIds(schemaName: SchemaName, ids: string[], changes: Record<string, any>, tx: TxContext): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.updateAny(schemaName, { where: { id: ids } }, changes, tx);
    }

    async deleteIds(schemaName: SchemaName, ids: string[], tx: TxContext): Promise<any[]> {
        if (ids.length === 0) return [];
        return await this.deleteAny(schemaName, { where: { id: ids } }, tx);
    }

    // Advanced operations - filter-based updates/deletes
    async selectAny(schemaName: SchemaName, filterData: FilterData = {}, dtx: DbContext | TxContext = db): Promise<any[]> {
        const schema = await this.toSchema(schemaName, dtx);
        const filter = new Filter(schemaName, schema.table_name, dtx).assign(filterData);
        return await filter.execute();
    }

    async updateAny(schemaName: string, filterData: FilterData, changes: Record<string, any>, tx: TxContext): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAny(schemaName, filterData, tx);

        if (records.length === 0) {
            return [];
        }

        // 2. Apply changes to each record
        const updates = records.map(record => ({
            id: record.id,
            ...changes,
        }));

        // 3. Bulk update all matched records
        return await this.updateAll(schemaName, updates, tx);
    }

    async deleteAny(schemaName: string, filter: FilterData, tx: TxContext): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAny(schemaName, filter, tx);

        if (records.length === 0) {
            return [];
        }

        // 2. Extract IDs and bulk delete
        const recordIds = records.map(record => record.id);
        return await this.deleteIds(schemaName, recordIds, tx);
    }

    async createOne(schemaName: SchemaName, recordData: Record<string, any>, tx: TxContext): Promise<any> {
        const schema = await this.toSchema(schemaName, tx);

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
                const pgArrayLiteral = `{${value.join(',')}}`;
                valueParams.push(sql`${pgArrayLiteral}::uuid[]`);
            } else {
                valueParams.push(sql`${value}`);
            }
        }

        const columnIdentifiers = columns.map(c => sql.identifier(c));

        const result = await tx.execute(sql`
            INSERT INTO ${sql.identifier(schema.table_name)} 
            (${sql.join(columnIdentifiers, sql`, `)}) 
            VALUES (${sql.join(valueParams, sql`, `)})
            RETURNING *
        `);

        const createdRecord = result.rows[0];
        return createdRecord;
    }

    async updateOne(schemaName: SchemaName, recordId: string, updates: Record<string, any>, tx: TxContext): Promise<any> {
        const schema = await this.toSchema(schemaName, tx);

        // Verify record exists
        const existing = await this.select404(schemaName, { where: { id: recordId }}, tx);

        // Build UPDATE query with updated_at
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString(),
        };

        const setClauses: any[] = [];
        for (const [key, value] of Object.entries(updateData)) {
            if ((key === 'access_read' || key === 'access_edit' || key === 'access_full' || key === 'access_deny') && Array.isArray(value)) {
                const pgArrayLiteral = `{${value.join(',')}}`;
                setClauses.push(sql`${sql.identifier(key)} = ${pgArrayLiteral}::uuid[]`);
            } else {
                setClauses.push(sql`${sql.identifier(key)} = ${value}`);
            }
        }

        const result = await tx.execute(sql`
            UPDATE ${sql.identifier(schema.table_name)}
            SET ${sql.join(setClauses, sql`, `)}
            WHERE id = ${recordId}
            RETURNING *
        `);

        return result.rows[0];
    }

    async deleteOne(schemaName: SchemaName, recordId: string, tx: TxContext): Promise<any> {
        const schema = await this.toSchema(schemaName, tx);

        const result = await tx.execute(sql`
            DELETE FROM ${sql.identifier(schema.table_name)}
            WHERE id = ${recordId}
            RETURNING id
        `);

        if (result.rows.length === 0) {
            throw new Error(`Record '${recordId}' not found`);
        }

        return { id: recordId, deleted: true };
    }

    // Transaction wrapper
    async transaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
        return await db.transaction(fn);
    }

    // Raw SQL execution - for complex operations
    async raw(query: string, dtx: DbContext | TxContext = db): Promise<any> {
        return await dtx.execute(sql.raw(query));
    }

    // Access control operations - separate from regular data updates
    async accessOne(schemaName: SchemaName, recordId: string, accessChanges: Record<string, any>, tx: TxContext): Promise<any> {
        const schema = await this.toSchema(schemaName, tx);

        // Verify record exists
        await this.select404(schemaName, { where: { id: recordId } }, tx);

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
        const setClauses: any[] = [];
        for (const [key, value] of Object.entries(filteredChanges)) {
            if (allowedFields.includes(key) && Array.isArray(value)) {
                const pgArrayLiteral = `{${value.join(',')}}`;
                setClauses.push(sql`${sql.identifier(key)} = ${pgArrayLiteral}::uuid[]`);
            } else {
                setClauses.push(sql`${sql.identifier(key)} = ${value}`);
            }
        }

        const result = await tx.execute(sql`
            UPDATE ${sql.identifier(schema.table_name)}
            SET ${sql.join(setClauses, sql`, `)}
            WHERE id = ${recordId}
            RETURNING *
        `);

        return result.rows[0];
    }

    async accessAll(schemaName: SchemaName, updates: Array<{ id: string; access: Record<string, any> }>, tx: TxContext): Promise<any[]> {
        const results: any[] = [];
        for (const update of updates) {
            results.push(await this.accessOne(schemaName, update.id, update.access, tx));
        }
        return results;
    }

    async accessAny(schemaName: SchemaName, filter: FilterData, accessChanges: Record<string, any>, tx: TxContext): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAny(schemaName, filter, tx);

        if (records.length === 0) {
            return [];
        }

        // 2. Apply access changes to each record
        const accessUpdates = records.map(record => ({
            id: record.id,
            access: { ...accessChanges },
        }));

        // 3. Bulk update access permissions
        return await this.accessAll(schemaName, accessUpdates, tx);
    }

    // 404 operations - convenience methods that throw if not found
    async update404(schemaName: SchemaName, filter: FilterData, changes: Record<string, any>, tx: TxContext, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, tx, message);

        return await this.updateOne(schemaName, record.id, changes, tx);
    }

    async delete404(schemaName: SchemaName, filter: FilterData, tx: TxContext, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, tx, message);
        return await this.deleteOne(schemaName, record.id, tx);
    }

    async access404(schemaName: SchemaName, filter: FilterData, accessChanges: Record<string, any>, tx: TxContext, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, tx, message);
        return await this.accessOne(schemaName, record.id, accessChanges, tx);
    }
}

// Export singleton instance
export const database = Database.getInstance();
