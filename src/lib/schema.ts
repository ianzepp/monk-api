import { database } from './database.js';
import { type FilterData } from './filter.js';
import { type TxContext } from '../db/index.js';

/**
 * Schema wrapper class providing database operation proxies
 * Inspired by cloud-api-2019/src/classes/schema.ts
 */
export class Schema {
    constructor(
        private schemaName: string,
        private tableName: string,
        private definition?: any
    ) {}

    get name(): string {
        return this.schemaName;
    }

    get table(): string {
        return this.tableName;
    }

    //
    // Database operation proxies - delegate to Database service
    //

    async count(filter?: FilterData): Promise<number> {
        return database.count(this.schemaName, filter);
    }

    async selectAll(filter?: FilterData): Promise<any[]> {
        return database.selectAll(this.schemaName, filter);
    }

    async selectOne(filter: FilterData | string): Promise<any | null> {
        return database.selectOne(this.schemaName, filter);
    }

    async select404(filter: FilterData | string, message?: string): Promise<any> {
        return database.select404(this.schemaName, filter, undefined, message);
    }

    async selectMax(filter?: FilterData): Promise<any[]> {
        // Set limit to 'max' in filter and delegate
        const maxFilter = filter ? { ...filter, limit: 100000 } : { limit: 100000 };
        return database.selectAll(this.schemaName, maxFilter);
    }

    // Transaction-based operations (require tx context)
    async createOne(record: Record<string, any>, tx: TxContext): Promise<any> {
        return database.createOne(this.schemaName, record, tx);
    }

    async createAll(collection: Record<string, any>[], tx: TxContext): Promise<any[]> {
        return database.createAll(this.schemaName, collection, tx);
    }

    async updateOne(recordId: string, updates: Record<string, any>, tx: TxContext): Promise<any> {
        return database.updateOne(this.schemaName, recordId, updates, tx);
    }

    async updateAll(updates: Array<{id: string, data: Record<string, any>}>, tx: TxContext): Promise<any[]> {
        return database.updateAll(this.schemaName, updates, tx);
    }

    async deleteOne(recordId: string, tx: TxContext): Promise<any> {
        return database.deleteOne(this.schemaName, recordId, tx);
    }

    async deleteAll(recordIds: string[], tx: TxContext): Promise<any[]> {
        return database.deleteAll(this.schemaName, recordIds, tx);
    }

    // Upsert operations (simplified - create or update based on ID presence)
    async upsertOne(record: Record<string, any>, tx: TxContext): Promise<any> {
        if (record.id) {
            // Try to update, create if not found
            try {
                return await this.updateOne(record.id, record, tx);
            } catch (error) {
                if (error instanceof Error && error.message.includes('not found')) {
                    return await this.createOne(record, tx);
                }
                throw error;
            }
        } else {
            // No ID provided, create new record
            return await this.createOne(record, tx);
        }
    }

    async upsertAll(collection: Record<string, any>[], tx: TxContext): Promise<any[]> {
        const results: any[] = [];
        for (const record of collection) {
            results.push(await this.upsertOne(record, tx));
        }
        return results;
    }

    // Convenience methods for common patterns
    async findOne(filter: FilterData): Promise<any | null> {
        return database.findOne(this.schemaName, filter);
    }

    async findMany(filter: FilterData): Promise<any[]> {
        return database.findMany(this.schemaName, filter);
    }

    // Advanced filter-based operations
    async updateAny(filter: FilterData | string[], changes: Record<string, any>, tx: TxContext): Promise<any[]> {
        return database.updateAny(this.schemaName, filter, changes, tx);
    }

    async deleteAny(filter: FilterData | string[], tx: TxContext): Promise<any[]> {
        return database.deleteAny(this.schemaName, filter, tx);
    }

    // Access control operations - separate from regular data updates
    async accessOne(recordId: string, accessChanges: Record<string, any>, tx: TxContext): Promise<any> {
        return database.accessOne(this.schemaName, recordId, accessChanges, tx);
    }

    async accessAll(updates: Array<{id: string, access: Record<string, any>}>, tx: TxContext): Promise<any[]> {
        return database.accessAll(this.schemaName, updates, tx);
    }

    async accessAny(filter: FilterData | string[], accessChanges: Record<string, any>, tx: TxContext): Promise<any[]> {
        return database.accessAny(this.schemaName, filter, accessChanges, tx);
    }

    // 404 operations - throw error if record not found
    async update404(filter: FilterData | string, changes: Record<string, any>, tx: TxContext, message?: string): Promise<any> {
        return database.update404(this.schemaName, filter, changes, tx, message);
    }

    async delete404(filter: FilterData | string, tx: TxContext, message?: string): Promise<any> {
        return database.delete404(this.schemaName, filter, tx, message);
    }

    async access404(filter: FilterData | string, accessChanges: Record<string, any>, tx: TxContext, message?: string): Promise<any> {
        return database.access404(this.schemaName, filter, accessChanges, tx, message);
    }

    // Utility methods
    toJSON() {
        return {
            name: this.schemaName,
            table: this.tableName,
            definition: this.definition
        };
    }
}

/**
 * Factory function to create Schema instances
 */
export async function createSchema(schemaName: string): Promise<Schema> {
    const schemaInfo = await database.getSchema(schemaName);
    if (!schemaInfo) {
        throw new Error(`Schema '${schemaName}' not found`);
    }
    
    return new Schema(schemaName, schemaInfo.table_name, schemaInfo.definition);
}