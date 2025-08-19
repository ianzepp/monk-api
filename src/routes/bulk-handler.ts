import type { Context } from 'hono';
import { database } from '../lib/database.js';
import { createSchema } from '../lib/schema.js';
import {
    createSuccessResponse,
    createValidationError,
    createInternalError,
} from '../lib/api/responses.js';

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
    const schema = await createSchema(op.schema);

    switch (op.operation) {
        // Read operations
        case BulkOperationType.Select:
        case BulkOperationType.SelectAll:
            return await schema.selectAll(op.filter);
            
        case BulkOperationType.SelectOne:
            return await schema.selectOne(op.filter || op.id);
            
        case BulkOperationType.Select404:
            return await schema.select404(op.filter || op.id, op.message);
            
        case BulkOperationType.SelectMax:
            return await schema.selectMax(op.filter);
            
        case BulkOperationType.Count:
            return await schema.count(op.filter);

        // Write operations (require transaction)
        case BulkOperationType.Create:
        case BulkOperationType.CreateOne:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.createOne(op.data, tx);
            
        case BulkOperationType.CreateAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.createAll(op.data, tx);
            
        case BulkOperationType.Update:
        case BulkOperationType.UpdateOne:
            if (!tx) throw new Error('Transaction required for write operations');
            if (!op.id) throw new Error('ID required for updateOne operation');
            return await schema.updateOne(op.id, op.data, tx);
            
        case BulkOperationType.UpdateAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.updateAll(op.data, tx);
            
        case BulkOperationType.UpdateAny:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.updateAny(op.filter, op.data, tx);
            
        case BulkOperationType.Update404:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.update404(op.filter || op.id, op.data, tx, op.message);
            
        case BulkOperationType.Delete:
        case BulkOperationType.DeleteOne:
            if (!tx) throw new Error('Transaction required for write operations');
            if (!op.id) throw new Error('ID required for deleteOne operation');
            return await schema.deleteOne(op.id, tx);
            
        case BulkOperationType.DeleteAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.deleteAll(op.data, tx);
            
        case BulkOperationType.DeleteAny:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.deleteAny(op.filter, tx);
            
        case BulkOperationType.Delete404:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.delete404(op.filter || op.id, tx, op.message);
            
        case BulkOperationType.Upsert:
        case BulkOperationType.UpsertOne:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.upsertOne(op.data, tx);
            
        case BulkOperationType.UpsertAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.upsertAll(op.data, tx);

        // Access control operations
        case BulkOperationType.Access:
        case BulkOperationType.AccessOne:
            if (!tx) throw new Error('Transaction required for write operations');
            if (!op.id) throw new Error('ID required for accessOne operation');
            return await schema.accessOne(op.id, op.data, tx);
            
        case BulkOperationType.AccessAll:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.accessAll(op.data, tx);
            
        case BulkOperationType.AccessAny:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.accessAny(op.filter, op.data, tx);
            
        case BulkOperationType.Access404:
            if (!tx) throw new Error('Transaction required for write operations');
            return await schema.access404(op.filter || op.id, op.data, tx, op.message);

        default:
            throw new Error(`Unsupported operation: ${op.operation}`);
    }
}