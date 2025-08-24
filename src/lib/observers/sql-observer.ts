/**
 * SQL Observer - Ring 5 Database Transport Layer
 * 
 * Handles direct SQL execution using system.dtx.query() for all database operations.
 * Works with arrays of records and performs bulk operations for optimal performance.
 * Does NOT call Database class methods to prevent infinite recursion.
 */

import type { ObserverContext } from '@observers/interfaces.js';
import { BaseObserver } from '@observers/base-observer.js';
import { ObserverRing } from '@observers/types.js';
import { SystemError } from '@observers/errors.js';
import { FilterWhere } from '@lib/filter-where.js';
import crypto from 'crypto';

export class SqlObserver extends BaseObserver {
    readonly ring = ObserverRing.Database;
    readonly operations = ['create', 'update', 'delete', 'select', 'revert'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, operation, schemaName, schema, data } = context;
        
        console.debug(`🎯 SQL RING (${this.ring}): Executing ${operation} on ${schemaName} (${data.length} records)`);
        
        try {
            switch (operation) {
                case 'create':
                    context.result = await this.bulkCreate(system, schemaName, data);
                    break;
                    
                case 'update':
                    context.result = await this.bulkUpdate(system, schemaName, data);
                    break;
                    
                case 'delete':
                    context.result = await this.bulkDelete(system, schemaName, data);
                    break;
                    
                case 'select':
                    context.result = await this.bulkSelect(system, schemaName, data);
                    break;
                    
                case 'revert':
                    context.result = await this.bulkRevert(system, schemaName, data);
                    break;
                    
                default:
                    throw new SystemError(`Unsupported SQL operation: ${operation}`);
            }
            
            console.debug(`✅ SQL operation completed: ${operation} on ${schemaName} (${context.result?.length || 0} results)`);
            
        } catch (error) {
            console.error(`❌ SQL operation failed: ${operation} on ${schemaName}`, error);
            throw new SystemError(`SQL operation failed: ${error}`, error instanceof Error ? error : undefined);
        }
    }

    /**
     * Bulk create operation - direct SQL execution
     * Handles array of records with optimized bulk INSERT operations
     * 
     * 🚨 CRITICAL TODO: This is a simplified implementation that MISSING key features:
     * - Schema protection (system schema checks) 
     * - Schema validation (validateOrThrow)
     * - Proper parameterized queries (SQL injection protection)
     * - UUID array handling for access_* fields (access_read, access_edit, etc.)
     * - Complex field processing and transformation logic
     * See Issue #101 for complete migration requirements
     */
    private async bulkCreate(system: any, schema: string, records: any[]): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        console.debug(`🔨 SqlObserver: Bulk creating ${records.length} records in schema ${schema}`);
        console.warn('USING SIMPLIFIED SQL IMPLEMENTATION - See Issue #101 for complete feature parity');
        
        // SIMPLIFIED implementation - missing critical features
        const results = [];
        
        for (const recordData of records) {
            // Generate record with base fields (simplified version)
            const record = {
                id: this.generateId(),
                tenant: recordData.tenant || null,
                access_read: recordData.access_read || [],
                access_edit: recordData.access_edit || [],
                access_full: recordData.access_full || [],
                access_deny: recordData.access_deny || [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...recordData
            };
            
            // Build INSERT query
            const fields = Object.keys(record);
            const values = Object.values(record);
            const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
            
            const query = `INSERT INTO "${schema}" (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;
            const result = await system.dtx.query(query, values);
            
            results.push(result.rows[0]);
        }
        
        return results;
    }
    
    /**
     * Bulk update operation - direct SQL execution
     * 
     * 🚨 CRITICAL TODO: Simplified implementation missing original Database.updateAll() features:
     * - Complex merge logic and validation
     * - Proper transaction handling
     * - System schema protection
     * - Advanced field processing
     * See Issue #101 for complete migration requirements
     */
    private async bulkUpdate(system: any, schema: string, records: any[]): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        console.debug(`🔨 SqlObserver: Bulk updating ${records.length} records in schema ${schema}`);
        
        const results = [];
        
        for (const record of records) {
            if (!record.id) {
                throw new SystemError('Record must have id for update operation');
            }
            
            const { id, ...updateFields } = record;
            updateFields.updated_at = new Date().toISOString();
            
            const fields = Object.keys(updateFields);
            const values = Object.values(updateFields);
            
            if (fields.length === 0) {
                throw new SystemError('No fields to update');
            }
            
            const setClause = fields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');
            
            // Use FilterWhere for consistent WHERE clause generation
            const { whereClause, params: whereParams } = FilterWhere.generate(
                { id },  // WHERE conditions
                fields.length  // Start WHERE parameters after SET parameters
            );
            
            const query = `UPDATE "${schema}" SET ${setClause} WHERE ${whereClause} RETURNING *`;
            const allParams = [...values, ...whereParams];
            
            const result = await system.dtx.query(query, allParams);
            if (result.rows.length === 0) {
                throw new SystemError(`Record not found or already deleted: ${id}`);
            }
            
            results.push(result.rows[0]);
        }
        
        return results;
    }
    
    /**
     * Bulk delete operation - direct SQL execution (soft delete)
     */
    private async bulkDelete(system: any, schema: string, records: any[]): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        console.debug(`🔨 SqlObserver: Bulk deleting ${records.length} records in schema ${schema}`);
        
        const ids = records.map(record => record.id).filter(id => id);
        if (ids.length === 0) {
            throw new SystemError('Records must have ids for delete operation');
        }
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids }  // Convert ANY($1) to proper IN operation
        });
        
        const query = `UPDATE "${schema}" SET trashed_at = NOW(), updated_at = NOW() WHERE ${whereClause} RETURNING *`;
        const result = await system.dtx.query(query, params);
        
        return result.rows;
    }
    
    /**
     * Bulk select operation - direct SQL execution
     */
    private async bulkSelect(system: any, schema: string, filters: any[]): Promise<any[]> {
        if (!filters || filters.length === 0) {
            return [];
        }
        
        console.debug(`🔨 SqlObserver: Bulk selecting from schema ${schema}`);
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({});  // No specific conditions, just default filtering
        
        const query = `SELECT * FROM "${schema}" WHERE ${whereClause} ORDER BY "created_at" DESC`;
        const result = await system.dtx.query(query, params);
        
        return result.rows;
    }
    
    /**
     * Bulk revert operation - direct SQL execution (undo soft deletes)
     */
    private async bulkRevert(system: any, schema: string, records: any[]): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        console.debug(`🔄 SqlObserver: Bulk reverting ${records.length} records in schema ${schema}`);
        
        const ids = records.map(record => record.id).filter(id => id);
        if (ids.length === 0) {
            throw new SystemError('Records must have ids for revert operation');
        }
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids }  // IDs to revert
        }, 0, {
            includeTrashed: true  // Need to include trashed records for revert
        });
        
        // Build revert query with additional trashed_at IS NOT NULL condition
        const fullWhereClause = `${whereClause} AND "trashed_at" IS NOT NULL`;
        const query = `UPDATE "${schema}" SET trashed_at = NULL, updated_at = NOW() WHERE ${fullWhereClause} RETURNING *`;
        const result = await system.dtx.query(query, params);
        
        return result.rows;
    }
    
    /**
     * Generate UUID for new records
     */
    private generateId(): string {
        return crypto.randomUUID();
    }
}