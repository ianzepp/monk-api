import type { Context } from 'hono';
import { System } from '@lib/system.js';
import { setRouteResult } from '@lib/middleware/system-context.js';
import { createSchema } from '@lib/schema.js';

export enum BulkOperationType {
    // Read operations
    Select = 'select',
    SelectAll = 'select-all', 
    SelectOne = 'select-one',
    Select404 = 'select-404',
    SelectMax = 'select-max',
    Count = 'count',
    
    // Write operations
    Create = 'create',
    CreateAll = 'create-all',
    CreateOne = 'create-one',
    Update = 'update',
    UpdateAll = 'update-all', 
    UpdateOne = 'update-one',
    UpdateAny = 'update-any',
    Update404 = 'update-404',
    Delete = 'delete',
    DeleteAll = 'delete-all',
    DeleteOne = 'delete-one', 
    DeleteAny = 'delete-any',
    Delete404 = 'delete-404',
    Upsert = 'upsert',
    UpsertAll = 'upsert-all',
    UpsertOne = 'upsert-one',
    
    // Access control operations
    Access = 'access',
    AccessAll = 'access-all',
    AccessOne = 'access-one',
    AccessAny = 'access-any',
    Access404 = 'access-404',
}

export interface BulkOperation {
    operation: BulkOperationType;
    schema: string;
    data?: any;
    filter?: any;
    id?: string;
    message?: string;
    result?: any; // Store operation results
}

export default async function (c: Context): Promise<any> {
    const system = c.get('system');
    const operations: BulkOperation[] = await c.req.json();

    // Validate input
    if (!Array.isArray(operations)) {
        throw new Error('Request body must be an array of operations');
    }

    if (operations.length === 0) {
        setRouteResult(c, []);
        return;
    }

    // Validate each operation
    for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (!op.operation || !op.schema) {
            throw new Error(`Operation at index ${i} missing required fields: operation and schema are required`);
        }
    }

    // Execute all operations in transaction
    for (let i = 0; i < operations.length; i++) {
        operations[i].result = await executeOperation(operations[i], system);
    }

    setRouteResult(c, operations);
}

async function executeOperation(op: BulkOperation, system: System): Promise<any> {
    const schemaName = op.schema;
    const filterData = op.filter;
    const filterById = { where: { id: op.id || null }};
    const recordId = op.id;
    const recordData = op.data;

    switch (op.operation) {
        // Read operations
        case BulkOperationType.Select:
        case BulkOperationType.SelectAll:
            return await system.database.selectAll(schemaName, filterData);
            
        case BulkOperationType.SelectOne:
            return await system.database.selectOne(schemaName, filterData || filterById);
            
        case BulkOperationType.Select404:
            return await system.database.select404(schemaName, filterData || filterById, op.message);
            
        case BulkOperationType.SelectMax:
            // TODO return await schema.selectMax(op.filter);
            return [];
            
        case BulkOperationType.Count:
            return await system.database.count(schemaName, filterData);

        // Write operations (require transaction)
        case BulkOperationType.Create:
        case BulkOperationType.CreateOne:
            return await system.database.createOne(schemaName, recordData);
            
        case BulkOperationType.CreateAll:
            return await system.database.createAll(schemaName, recordData);
            
        case BulkOperationType.Update:
        case BulkOperationType.UpdateOne:
            if (!recordId) throw new Error('ID required for updateOne operation');
            return await system.database.updateOne(schemaName, recordId, recordData);
            
        case BulkOperationType.UpdateAll:
            return await system.database.updateAll(schemaName, recordData);
            
        case BulkOperationType.UpdateAny:
            return await system.database.updateAny(schemaName, filterData, recordData);
            
        case BulkOperationType.Update404:
            return await system.database.update404(schemaName, filterData || filterById, recordData, op.message);
            
        case BulkOperationType.Delete:
        case BulkOperationType.DeleteOne:
            if (!recordId) throw new Error('ID required for deleteOne operation');
            return await system.database.deleteOne(schemaName, recordId);
            
        case BulkOperationType.DeleteAll:
            return await system.database.deleteAll(schemaName, recordData);
            
        case BulkOperationType.DeleteAny:
            return await system.database.deleteAny(schemaName, filterData);
            
        case BulkOperationType.Delete404:
            return await system.database.delete404(schemaName, filterData || filterById, op.message);
            
        case BulkOperationType.Upsert:
        case BulkOperationType.UpsertOne:
            // TODO return await database.upsertOne(schemaName, recordData);
            throw new Error('Unsupported');
            
        case BulkOperationType.UpsertAll:
            // TODO return await database.upsertAll(schemaName, recordData);
            throw new Error('Unsupported');

        // Access control operations
        case BulkOperationType.Access:
        case BulkOperationType.AccessOne:
            if (!recordId) throw new Error('ID required for accessOne operation');
            return await system.database.accessOne(schemaName, recordId, op.data);
            
        case BulkOperationType.AccessAll:
            return await system.database.accessAll(schemaName, recordData);
            
        case BulkOperationType.AccessAny:
            return await system.database.accessAny(schemaName, filterData, recordData);
            
        case BulkOperationType.Access404:
            return await system.database.access404(schemaName, filterData || filterById, recordData, op.message);

        default:
            throw new Error(`Unsupported operation: ${op.operation}`);
    }
}