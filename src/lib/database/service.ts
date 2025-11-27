/**
 * Database Service
 *
 * High-level database operations providing:
 * - Select operations (read-only, no observer pipeline)
 * - Mutate operations (create/update/delete via observer pipeline)
 * - Access control operations (ACL modifications via observer pipeline)
 *
 * Per-request instance with specific database context.
 * Uses dependency injection pattern to break circular dependencies.
 */

import type { SystemContext } from '@src/lib/system-context-types.js';
import type { FilterData } from '@src/lib/filter-types.js';
import type {
    DbRecord,
    DbCreateInput,
    DbUpdateInput,
    DbDeleteInput,
    DbRevertInput,
    DbAccessInput,
    DbAccessUpdate,
} from '@src/lib/database-types.js';
import type { SelectOptions, CachedRelationship } from './types.js';
import type { ModelName } from '@src/lib/model.js';

// Import operations from modules
import * as selectOps from './select.js';
import * as mutateOps from './mutate.js';
import * as accessOps from './access.js';

/**
 * Database service wrapper providing high-level operations
 * Per-request instance with specific database context
 */
export class Database {
    public readonly system: SystemContext;

    constructor(system: SystemContext) {
        this.system = system;
    }

    // ========================================================================
    // Low-level Operations
    // ========================================================================

    async execute(query: string, params: any[] = []): Promise<any> {
        return selectOps.execute(this.system, query, params);
    }

    async getRelationship(parentModel: string, relationshipName: string): Promise<CachedRelationship> {
        return selectOps.getRelationship(this.system, parentModel, relationshipName);
    }

    // ========================================================================
    // Aggregation Operations
    // ========================================================================

    async count(modelName: ModelName, filterData: FilterData = {}, options: SelectOptions = {}): Promise<number> {
        return selectOps.count(this.system, modelName, filterData, options);
    }

    async aggregate(modelName: ModelName, body: any = {}, options: SelectOptions = {}): Promise<any[]> {
        return selectOps.aggregate(this.system, modelName, body, options);
    }

    // ========================================================================
    // Select Operations
    // ========================================================================

    async selectAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData = {},
        options: SelectOptions = {}
    ): Promise<DbRecord<T>[]> {
        return selectOps.selectAny<T>(this.system, modelName, filterData, options);
    }

    async selectOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData,
        options: SelectOptions = {}
    ): Promise<DbRecord<T> | null> {
        return selectOps.selectOne<T>(this.system, modelName, filterData, options);
    }

    async select404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        message?: string,
        options: SelectOptions = {}
    ): Promise<DbRecord<T>> {
        return selectOps.select404<T>(this.system, modelName, filter, message, options);
    }

    async selectIds<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        ids: string[],
        options: SelectOptions = {}
    ): Promise<DbRecord<T>[]> {
        return selectOps.selectIds<T>(this.system, modelName, ids, options);
    }

    async selectAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        records: DbRecord<T>[]
    ): Promise<DbRecord<T>[]> {
        return selectOps.selectAll<T>(this.system, modelName, records);
    }

    // ========================================================================
    // Create Operations
    // ========================================================================

    async createAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        records: DbCreateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        return mutateOps.createAll<T>(this.system, modelName, records);
    }

    async createOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordData: DbCreateInput<T>
    ): Promise<DbRecord<T>> {
        return mutateOps.createOne<T>(this.system, modelName, recordData);
    }

    // ========================================================================
    // Update Operations
    // ========================================================================

    async updateAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        updates: DbUpdateInput<T>[]
    ): Promise<DbRecord<T>[]> {
        return mutateOps.updateAll<T>(this.system, modelName, updates);
    }

    async updateOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string,
        updates: Partial<T>
    ): Promise<DbRecord<T>> {
        return mutateOps.updateOne<T>(this.system, modelName, recordId, updates);
    }

    async updateIds<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        ids: string[],
        changes: Partial<T>
    ): Promise<DbRecord<T>[]> {
        return mutateOps.updateIds<T>(this.system, modelName, ids, changes);
    }

    async updateAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData,
        changes: Partial<T>
    ): Promise<DbRecord<T>[]> {
        return mutateOps.updateAny<T>(this.system, modelName, filterData, changes);
    }

    async update404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        changes: Partial<T>,
        message?: string
    ): Promise<DbRecord<T>> {
        return mutateOps.update404<T>(this.system, modelName, filter, changes, message);
    }

    // ========================================================================
    // Upsert Operations
    // ========================================================================

    async upsertAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        records: (DbCreateInput<T> | DbUpdateInput<T>)[]
    ): Promise<DbRecord<T>[]> {
        return mutateOps.upsertAll<T>(this.system, modelName, records);
    }

    async upsertOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        record: DbCreateInput<T> | DbUpdateInput<T>
    ): Promise<DbRecord<T>> {
        return mutateOps.upsertOne<T>(this.system, modelName, record);
    }

    // ========================================================================
    // Delete Operations (Soft Delete)
    // ========================================================================

    async deleteAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        deletes: DbDeleteInput[]
    ): Promise<DbRecord<T>[]> {
        return mutateOps.deleteAll<T>(this.system, modelName, deletes);
    }

    async deleteOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string
    ): Promise<DbRecord<T>> {
        return mutateOps.deleteOne<T>(this.system, modelName, recordId);
    }

    async deleteIds<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        ids: string[]
    ): Promise<DbRecord<T>[]> {
        return mutateOps.deleteIds<T>(this.system, modelName, ids);
    }

    async deleteAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData
    ): Promise<DbRecord<T>[]> {
        return mutateOps.deleteAny<T>(this.system, modelName, filter);
    }

    async delete404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        message?: string
    ): Promise<DbRecord<T>> {
        return mutateOps.delete404<T>(this.system, modelName, filter, message);
    }

    // ========================================================================
    // Revert Operations (Undo Soft Delete)
    // ========================================================================

    async revertAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        reverts: DbRevertInput[]
    ): Promise<DbRecord<T>[]> {
        return mutateOps.revertAll<T>(this.system, modelName, reverts);
    }

    async revertOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string
    ): Promise<DbRecord<T>> {
        return mutateOps.revertOne<T>(this.system, modelName, recordId);
    }

    async revertAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filterData: FilterData = {}
    ): Promise<DbRecord<T>[]> {
        return mutateOps.revertAny<T>(this.system, modelName, filterData);
    }

    // ========================================================================
    // Access Control Operations
    // ========================================================================

    async accessAll<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        accessUpdates: DbAccessUpdate[]
    ): Promise<DbRecord<T>[]> {
        return accessOps.accessAll<T>(this.system, modelName, accessUpdates);
    }

    async accessOne<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        recordId: string,
        accessChanges: DbAccessInput
    ): Promise<DbRecord<T>> {
        return accessOps.accessOne<T>(this.system, modelName, recordId, accessChanges);
    }

    async accessAny<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        accessChanges: DbAccessInput
    ): Promise<DbRecord<T>[]> {
        return accessOps.accessAny<T>(this.system, modelName, filter, accessChanges);
    }

    async access404<T extends Record<string, any> = Record<string, any>>(
        modelName: ModelName,
        filter: FilterData,
        accessChanges: DbAccessInput,
        message?: string
    ): Promise<DbRecord<T>> {
        return accessOps.access404<T>(this.system, modelName, filter, accessChanges, message);
    }
}
