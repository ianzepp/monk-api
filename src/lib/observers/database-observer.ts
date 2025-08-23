/**
 * Built-in Database Observer
 * 
 * Handles actual SQL execution in Ring 5 (DATABASE_RING)
 * This observer is automatically registered and executes database operations
 */

import type { Observer, ObserverContext } from '@observers/interfaces.js';
import { ObserverRing } from '@observers/types.js';

export class DatabaseObserver implements Observer {
    ring = ObserverRing.Database;
    name = 'DatabaseObserver';

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, schema, data, recordId, existing } = context;
        
        try {
            console.debug(`🎯 DATABASE RING (${this.ring}): Executing ${operation} on ${schema}`);
            
            switch (operation) {
                case 'create':
                    context.result = await this.handleCreate(system, schema, data);
                    break;
                    
                case 'update':
                    context.result = await this.handleUpdate(system, schema, recordId!, data, existing);
                    break;
                    
                case 'delete':
                    context.result = await this.handleDelete(system, schema, recordId!, existing);
                    break;
                    
                case 'select':
                    context.result = await this.handleSelect(system, schema, recordId!);
                    break;
                    
                default:
                    throw new Error(`Unsupported database operation: ${operation}`);
            }
            
            console.debug(`✅ Database operation completed: ${operation} on ${schema}`);
            
        } catch (error) {
            console.error(`❌ Database operation failed: ${operation} on ${schema}`, error);
            
            // Add database error to context
            context.errors.push({
                message: `Database operation failed: ${error}`,
                code: 'DATABASE_OPERATION_FAILED',
                ring: this.ring,
                observer: this.name
            });
        }
    }

    private async handleCreate(system: any, schema: string, data: any): Promise<any> {
        if (!data) {
            throw new Error('No data provided for create operation');
        }
        
        // Use system database for create operation
        return await system.database.createOne(schema, data);
    }

    private async handleUpdate(system: any, schema: string, recordId: string, data: any, existing: any): Promise<any> {
        if (!recordId) {
            throw new Error('No record ID provided for update operation');
        }
        
        if (!data || Object.keys(data).length === 0) {
            throw new Error('No update data provided');
        }
        
        // Use system database for update operation
        return await system.database.updateOne(schema, recordId, data);
    }

    private async handleDelete(system: any, schema: string, recordId: string, existing: any): Promise<any> {
        if (!recordId) {
            throw new Error('No record ID provided for delete operation');
        }
        
        // Use system database for delete operation (soft delete)
        return await system.database.deleteOne(schema, recordId);
    }

    private async handleSelect(system: any, schema: string, recordId: string): Promise<any> {
        if (!recordId) {
            throw new Error('No record ID provided for select operation');
        }
        
        // Use system database for select operation
        return await system.database.selectOne(schema, { where: { id: recordId } });
    }
}