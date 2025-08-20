import type { Context } from 'hono';
import { database } from '../lib/database.js';
import { createSchema } from '../lib/schema.js';
import {
    createSuccessResponse,
    createValidationError,
    createInternalError,
} from '../lib/api/responses.js';
import { filter } from 'lodash';

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
    try {
        const operations: BulkOperation[] = await c.req.json();

        // Validate input
        if (!Array.isArray(operations)) {
            return createValidationError(c, 'Request body must be an array of operations', []);
        }

        if (operations.length === 0) {
            return createSuccessResponse(c, []);
        }

        // Validate each operation
        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            if (!op.operation || !op.schema) {
                return createValidationError(c, `Operation at index ${i} missing required fields`, [{
                    path: [i],
                    message: 'operation and schema are required'
                }]);
            }
        }

        // Determine execution strategy
        const readOnlyOps = [
            BulkOperationType.Select,
            BulkOperationType.SelectAll,
            BulkOperationType.SelectOne,
            BulkOperationType.Select404,
            BulkOperationType.SelectMax,
            BulkOperationType.Count,
        ];

        const hasWriteOps = operations.some(op => !readOnlyOps.includes(op.operation));

        if (hasWriteOps) {
            // Execute in transaction for write operations
            await database.transaction(async (tx) => {
                for (let i = 0; i < operations.length; i++) {
                    operations[i].result = await executeOperation(operations[i], tx);
                }
            });
        } else {
            // Execute in parallel for read-only operations
            await Promise.all(operations.map(async (op, i) => {
                operations[i].result = await executeOperation(op);
            }));
        }

        return createSuccessResponse(c, operations);
    } catch (error) {
        console.error('Error executing bulk operations:', error);
        return createInternalError(c, 'Failed to execute bulk operations');
    }
}

async function executeOperation(op: BulkOperation, tx?: any): Promise<any> {
    const schemaName = op.schema;
    const filterData = op.filter;
    const filterById = { where: { id: op.id || null }};
    const recordId = op.id;
    const recordData = op.data;

    switch (op.operation) {
        // Read operations
        case BulkOperationType.Select:
        case BulkOperationType.SelectAll:
            return await database.selectAll(schemaName, filterData, tx);
            
        case BulkOperationType.SelectOne:
            return await database.selectOne(schemaName, filterData || filterById, tx);
            
        case BulkOperationType.Select404:
            return await database.select404(schemaName, filterData || filterById, tx, op.message);
            
        case BulkOperationType.SelectMax:
            // TODO return await schema.selectMax(op.filter);
            return [];
            
        case BulkOperationType.Count:
            return await database.count(schemaName, filterData, tx);

        // Write operations (require transaction)
        case BulkOperationType.Create:
        case BulkOperationType.CreateOne:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.createOne(schemaName, recordData, tx);
            
        case BulkOperationType.CreateAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.createAll(schemaName, recordData, tx);
            
        case BulkOperationType.Update:
        case BulkOperationType.UpdateOne:
            if (!tx) throw new Error('Transaction required for write operations');
            if (!recordId) throw new Error('ID required for updateOne operation');
            return await database.updateOne(schemaName, recordId, recordData, tx);
            
        case BulkOperationType.UpdateAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.updateAll(schemaName, recordData, tx);
            
        case BulkOperationType.UpdateAny:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.updateAny(schemaName, filterData, recordData, tx);
            
        case BulkOperationType.Update404:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.update404(schemaName, filterData || filterById, recordData, tx, op.message);
            
        case BulkOperationType.Delete:
        case BulkOperationType.DeleteOne:
            if (!tx) throw new Error('Transaction required for write operations');
            if (!recordId) throw new Error('ID required for deleteOne operation');
            return await database.deleteOne(schemaName, recordId, tx);
            
        case BulkOperationType.DeleteAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.deleteAll(schemaName, recordData, tx);
            
        case BulkOperationType.DeleteAny:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.deleteAny(schemaName, filterData, tx);
            
        case BulkOperationType.Delete404:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.delete404(schemaName, filterData || filterById, tx, op.message);
            
        case BulkOperationType.Upsert:
        case BulkOperationType.UpsertOne:
            if (!tx) throw new Error('Transaction required for write operations');
            // TODO return await database.upsertOne(schemaName, recordData, tx);
            throw new Error('Unsupported');
            
        case BulkOperationType.UpsertAll:
            if (!tx) throw new Error('Transaction required for write operations');
            // TODO return await database.upsertAll(schemaName, recordData, tx);
            throw new Error('Unsupported');

        // Access control operations
        case BulkOperationType.Access:
        case BulkOperationType.AccessOne:
            if (!tx) throw new Error('Transaction required for write operations');
            if (!recordId) throw new Error('ID required for accessOne operation');
            return await database.accessOne(schemaName, recordId, op.data, tx);
            
        case BulkOperationType.AccessAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.accessAll(schemaName, recordData, tx);
            
        case BulkOperationType.AccessAny:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.accessAny(schemaName, filterData, recordData, tx);
            
        case BulkOperationType.Access404:
            if (!tx) throw new Error('Transaction required for write operations');
            return await database.access404(schemaName, filterData || filterById, recordData, tx, op.message);

        default:
            throw new Error(`Unsupported operation: ${op.operation}`);
    }
}