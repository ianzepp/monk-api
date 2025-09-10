import type { System } from '@src/lib/system.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { logger } from '@src/lib/logger.js';

/**
 * Bulk operation types supported by the Bulk API
 */
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

/**
 * Individual bulk operation definition
 */
export interface BulkOperation {
    operation: BulkOperationType;
    schema: string;
    data?: any;
    filter?: any;
    id?: string;
    message?: string;
    result?: any; // Populated after execution
}

/**
 * Bulk operation request structure
 */
export interface BulkRequest {
    operations: BulkOperation[];
}

/**
 * BulkProcessor - Handles batch operations with proper validation and execution
 * 
 * Provides clean separation of concerns:
 * - Request validation and normalization
 * - Operation execution with error handling
 * - Result compilation and formatting
 * 
 * Designed for atomic transaction integration via withTransactionParams.
 */
export class BulkProcessor {
    constructor(private system: System) {}

    /**
     * Process bulk request with comprehensive validation and execution
     */
    async process(requestBody: any): Promise<BulkOperation[]> {
        // Validate and extract operations
        const operations = this.validateRequest(requestBody);
        
        // Validate individual operations
        this.validateOperations(operations);
        
        // Execute all operations
        await this.executeOperations(operations);
        
        return operations;
    }

    /**
     * Validate bulk request structure and extract operations
     */
    private validateRequest(requestBody: any): BulkOperation[] {
        if (!requestBody || typeof requestBody !== 'object') {
            throw HttpErrors.badRequest('Request body must be an object with operations array', 'REQUEST_INVALID_FORMAT');
        }

        if (!requestBody.operations || !Array.isArray(requestBody.operations)) {
            throw HttpErrors.badRequest('Request body must contain an operations array', 'REQUEST_INVALID_FORMAT');
        }

        return requestBody.operations;
    }

    /**
     * Validate individual operation requirements
     */
    private validateOperations(operations: BulkOperation[]): void {
        if (operations.length === 0) {
            return; // Empty operations array is valid
        }

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            
            // Basic required fields
            if (!op.operation || !op.schema) {
                throw HttpErrors.badRequest(
                    `Operation at index ${i} missing required fields: operation and schema are required`, 
                    'OPERATION_MISSING_FIELDS'
                );
            }
            
            // Operation-specific validation
            this.validateOperationRequirements(op, i);
        }
    }

    /**
     * Validate operation-specific field requirements
     */
    private validateOperationRequirements(op: BulkOperation, index: number): void {
        // Operations requiring ID
        const requiresId = [
            BulkOperationType.SelectOne, BulkOperationType.Select404,
            BulkOperationType.UpdateOne, BulkOperationType.Update404,
            BulkOperationType.DeleteOne, BulkOperationType.Delete404,
            BulkOperationType.AccessOne, BulkOperationType.Access404
        ];

        if (requiresId.includes(op.operation) && !op.id) {
            throw HttpErrors.badRequest(
                `Operation at index ${index} (${op.operation}) requires id field`, 
                'OPERATION_MISSING_ID'
            );
        }

        // Operations requiring data
        const requiresData = [
            BulkOperationType.Create, BulkOperationType.CreateOne, BulkOperationType.CreateAll,
            BulkOperationType.Update, BulkOperationType.UpdateOne, BulkOperationType.UpdateAll,
            BulkOperationType.Access, BulkOperationType.AccessOne, BulkOperationType.AccessAll
        ];

        if (requiresData.includes(op.operation) && !op.data) {
            throw HttpErrors.badRequest(
                `Operation at index ${index} (${op.operation}) requires data field`, 
                'OPERATION_MISSING_DATA'
            );
        }
    }

    /**
     * Execute all operations sequentially (within transaction if using withTransactionParams)
     */
    private async executeOperations(operations: BulkOperation[]): Promise<void> {
        for (let i = 0; i < operations.length; i++) {
            try {
                operations[i].result = await this.executeOperation(operations[i]);
                
                logger.info('Bulk operation completed', {
                    index: i,
                    operation: operations[i].operation,
                    schema: operations[i].schema
                });
            } catch (error) {
                logger.warn('Bulk operation failed', {
                    index: i,
                    operation: operations[i].operation,
                    schema: operations[i].schema,
                    error: error instanceof Error ? error.message : String(error)
                });
                throw error; // Re-throw to trigger transaction rollback
            }
        }
    }

    /**
     * Execute individual operation with proper database method mapping
     */
    private async executeOperation(op: BulkOperation): Promise<any> {
        const { schema: schemaName, data, filter, id, message } = op;
        const filterById = { where: { id: id || null }};

        switch (op.operation) {
            // Read operations
            case BulkOperationType.Select:
            case BulkOperationType.SelectAll:
                return await this.system.database.selectAny(schemaName, filter);
                
            case BulkOperationType.SelectOne:
                return await this.system.database.selectOne(schemaName, filter || filterById);
                
            case BulkOperationType.Select404:
                return await this.system.database.select404(schemaName, filter || filterById, message);
                
            case BulkOperationType.SelectMax:
                // TODO: Implement selectMax functionality
                logger.warn('SelectMax operation not yet implemented');
                return [];
                
            case BulkOperationType.Count:
                return await this.system.database.count(schemaName, filter);

            // Write operations
            case BulkOperationType.Create:
            case BulkOperationType.CreateOne:
                return await this.system.database.createOne(schemaName, data);
                
            case BulkOperationType.CreateAll:
                return await this.system.database.createAll(schemaName, data);
                
            case BulkOperationType.Update:
            case BulkOperationType.UpdateOne:
                if (!id) throw HttpErrors.badRequest('ID required for updateOne operation', 'OPERATION_MISSING_ID');
                return await this.system.database.updateOne(schemaName, id, data);
                
            case BulkOperationType.UpdateAll:
                return await this.system.database.updateAll(schemaName, data);
                
            case BulkOperationType.UpdateAny:
                return await this.system.database.updateAny(schemaName, filter, data);
                
            case BulkOperationType.Update404:
                return await this.system.database.update404(schemaName, filter || filterById, data, message);
                
            case BulkOperationType.Delete:
            case BulkOperationType.DeleteOne:
                if (!id) throw HttpErrors.badRequest('ID required for deleteOne operation', 'OPERATION_MISSING_ID');
                return await this.system.database.deleteOne(schemaName, id);
                
            case BulkOperationType.DeleteAll:
                return await this.system.database.deleteAll(schemaName, data);
                
            case BulkOperationType.DeleteAny:
                return await this.system.database.deleteAny(schemaName, filter);
                
            case BulkOperationType.Delete404:
                return await this.system.database.delete404(schemaName, filter || filterById, message);
                
            case BulkOperationType.Upsert:
            case BulkOperationType.UpsertOne:
            case BulkOperationType.UpsertAll:
                throw HttpErrors.unprocessableEntity('Upsert operations not yet implemented', 'OPERATION_UNSUPPORTED');

            // Access control operations
            case BulkOperationType.Access:
            case BulkOperationType.AccessOne:
                if (!id) throw HttpErrors.badRequest('ID required for accessOne operation', 'OPERATION_MISSING_ID');
                return await this.system.database.accessOne(schemaName, id, data);
                
            case BulkOperationType.AccessAll:
                return await this.system.database.accessAll(schemaName, data);
                
            case BulkOperationType.AccessAny:
                return await this.system.database.accessAny(schemaName, filter, data);
                
            case BulkOperationType.Access404:
                return await this.system.database.access404(schemaName, filter || filterById, data, message);

            default:
                throw HttpErrors.unprocessableEntity(`Unsupported operation: ${op.operation}`, 'OPERATION_UNSUPPORTED');
        }
    }
}