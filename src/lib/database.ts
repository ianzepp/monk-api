import { db, schema, type DbContext, type TxContext } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { Filter, type FilterData } from './filter.js';

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
    async getSchema(schemaName: string, dbOrTx: DbContext | TxContext = db) {
        const result = await dbOrTx
            .select()
            .from(schema.schemas)
            .where(eq(schema.schemas.name, schemaName))
            .limit(1);
        
        return result.length > 0 ? result[0] : null;
    }

    async validateSchema(schemaName: string, dbOrTx: DbContext | TxContext = db) {
        const schemaInfo = await this.getSchema(schemaName, dbOrTx);
        if (!schemaInfo) {
            throw new Error(`Schema '${schemaName}' not found`);
        }
        return schemaInfo;
    }

    // Core data operations
    async selectAll(schemaName: string, filter?: FilterData | string | string[], dbOrTx: DbContext | TxContext = db): Promise<any[]> {
        const schemaInfo = await this.validateSchema(schemaName, dbOrTx);
        
        const filterInstance = new Filter(schemaName, schemaInfo.table_name, dbOrTx);
        filterInstance.assign(filter);
        
        return await filterInstance.execute();
    }

    async selectOne(schemaName: string, filter: FilterData | string, dbOrTx: DbContext | TxContext = db): Promise<any | null> {
        const results = await this.selectAll(schemaName, filter, dbOrTx);
        return results.length > 0 ? results[0] : null;
    }

    async select404(schemaName: string, filter: FilterData | string, dbOrTx: DbContext | TxContext = db, message?: string): Promise<any> {
        const result = await this.selectOne(schemaName, filter, dbOrTx);
        if (!result) {
            throw new Error(message || `Record not found in schema '${schemaName}'`);
        }
        return result;
    }

    async count(schemaName: string, filter?: FilterData, dbOrTx: DbContext | TxContext = db): Promise<number> {
        const schemaInfo = await this.validateSchema(schemaName, dbOrTx);
        
        // Build count query
        let whereClause = '';
        if (filter?.where) {
            const filterInstance = new Filter(schemaName, schemaInfo.table_name, dbOrTx);
            filterInstance.assign(filter);
            // Extract WHERE conditions (simplified for count)
            whereClause = 'WHERE 1=1'; // TODO: Extract actual conditions from filter
        }

        const countQuery = `SELECT COUNT(*) as count FROM "${schemaInfo.table_name}" ${whereClause}`;
        const result = await dbOrTx.execute(sql.raw(countQuery));
        
        return parseInt(result.rows[0].count as string);
    }

    async createOne(schemaName: string, recordData: Record<string, any>, tx: TxContext): Promise<any> {
        const schemaInfo = await this.validateSchema(schemaName, tx);
        
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

        // Build INSERT query (reuse logic from data-record-create-one.ts)
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
            INSERT INTO ${sql.identifier(schemaInfo.table_name)} 
            (${sql.join(columnIdentifiers, sql`, `)}) 
            VALUES (${sql.join(valueParams, sql`, `)})
            RETURNING *
        `);

        return result.rows[0];
    }

    async updateOne(schemaName: string, recordId: string, updates: Record<string, any>, tx: TxContext): Promise<any> {
        const schemaInfo = await this.validateSchema(schemaName, tx);
        
        // Verify record exists
        const existing = await this.select404(schemaName, recordId, tx);
        
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
            UPDATE ${sql.identifier(schemaInfo.table_name)}
            SET ${sql.join(setClauses, sql`, `)}
            WHERE id = ${recordId}
            RETURNING *
        `);

        return result.rows[0];
    }

    async deleteOne(schemaName: string, recordId: string, tx: TxContext): Promise<any> {
        const schemaInfo = await this.validateSchema(schemaName, tx);
        
        const result = await tx.execute(sql`
            DELETE FROM ${sql.identifier(schemaInfo.table_name)}
            WHERE id = ${recordId}
            RETURNING id
        `);

        if (result.rows.length === 0) {
            throw new Error(`Record '${recordId}' not found`);
        }

        return { id: recordId, deleted: true };
    }

    // Bulk operations
    async createAll(schemaName: string, records: Record<string, any>[], tx: TxContext): Promise<any[]> {
        const results: any[] = [];
        for (const record of records) {
            results.push(await this.createOne(schemaName, record, tx));
        }
        return results;
    }

    async updateAll(schemaName: string, updates: Array<{id: string, data: Record<string, any>}>, tx: TxContext): Promise<any[]> {
        const results: any[] = [];
        for (const update of updates) {
            results.push(await this.updateOne(schemaName, update.id, update.data, tx));
        }
        return results;
    }

    async deleteAll(schemaName: string, recordIds: string[], tx: TxContext): Promise<any[]> {
        const results: any[] = [];
        for (const id of recordIds) {
            results.push(await this.deleteOne(schemaName, id, tx));
        }
        return results;
    }

    // Convenience methods
    async findOne(schemaName: string, filter: FilterData): Promise<any | null> {
        const results = await this.selectAll(schemaName, filter);
        return results.length > 0 ? results[0] : null;
    }

    async findMany(schemaName: string, filter: FilterData): Promise<any[]> {
        return await this.selectAll(schemaName, filter);
    }

    // Transaction wrapper
    async transaction<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
        return await db.transaction(fn);
    }

    // Raw SQL execution - for complex operations
    async raw(query: string, dbOrTx: DbContext | TxContext = db): Promise<any> {
        return await dbOrTx.execute(sql.raw(query));
    }

    // Advanced operations - filter-based updates/deletes
    async updateAny(schemaName: string, filter: FilterData | string[], changes: Record<string, any>, tx: TxContext): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAll(schemaName, filter, tx);
        
        if (records.length === 0) {
            return [];
        }

        // 2. Apply changes to each record
        const updates = records.map(record => ({
            id: record.id,
            data: { ...changes }
        }));

        // 3. Bulk update all matched records
        return await this.updateAll(schemaName, updates, tx);
    }

    async deleteAny(schemaName: string, filter: FilterData | string[], tx: TxContext): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAll(schemaName, filter, tx);
        
        if (records.length === 0) {
            return [];
        }

        // 2. Extract IDs and bulk delete
        const recordIds = records.map(record => record.id);
        return await this.deleteAll(schemaName, recordIds, tx);
    }

    // Access control operations - separate from regular data updates
    async accessOne(schemaName: string, recordId: string, accessChanges: Record<string, any>, tx: TxContext): Promise<any> {
        const schemaInfo = await this.validateSchema(schemaName, tx);
        
        // Verify record exists
        await this.select404(schemaName, recordId, tx);
        
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
            UPDATE ${sql.identifier(schemaInfo.table_name)}
            SET ${sql.join(setClauses, sql`, `)}
            WHERE id = ${recordId}
            RETURNING *
        `);

        return result.rows[0];
    }

    async accessAll(schemaName: string, updates: Array<{id: string, access: Record<string, any>}>, tx: TxContext): Promise<any[]> {
        const results: any[] = [];
        for (const update of updates) {
            results.push(await this.accessOne(schemaName, update.id, update.access, tx));
        }
        return results;
    }

    async accessAny(schemaName: string, filter: FilterData | string[], accessChanges: Record<string, any>, tx: TxContext): Promise<any[]> {
        // 1. Find all records matching the filter
        const records = await this.selectAll(schemaName, filter, tx);
        
        if (records.length === 0) {
            return [];
        }

        // 2. Apply access changes to each record
        const accessUpdates = records.map(record => ({
            id: record.id,
            access: { ...accessChanges }
        }));

        // 3. Bulk update access permissions
        return await this.accessAll(schemaName, accessUpdates, tx);
    }

    // 404 operations - convenience methods that throw if not found
    async update404(schemaName: string, filter: FilterData | string, changes: Record<string, any>, tx: TxContext, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        await this.select404(schemaName, filter, tx, message);
        
        // Extract ID for update
        const recordId = typeof filter === 'string' ? filter : (await this.selectOne(schemaName, filter, tx))?.id;
        
        if (!recordId) {
            throw new Error(message || `Record not found for update in schema '${schemaName}'`);
        }
        
        return await this.updateOne(schemaName, recordId, changes, tx);
    }

    async delete404(schemaName: string, filter: FilterData | string, tx: TxContext, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, tx, message);
        
        return await this.deleteOne(schemaName, record.id, tx);
    }

    async access404(schemaName: string, filter: FilterData | string, accessChanges: Record<string, any>, tx: TxContext, message?: string): Promise<any> {
        // First ensure record exists (throws if not found)
        const record = await this.select404(schemaName, filter, tx, message);
        
        return await this.accessOne(schemaName, record.id, accessChanges, tx);
    }
}

// Export singleton instance
export const database = Database.getInstance();