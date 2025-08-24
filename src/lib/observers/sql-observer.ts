/**
 * SQL Observer - Ring 5 Database Transport Layer
 * 
 * Pure SQL execution layer that operates on pre-validated, pre-processed data from
 * earlier observer rings. Handles direct database operations using this.getDbContext(system).query()
 * with proper parameterized queries and bulk operations for optimal performance.
 * 
 * By Ring 5, data has already been:
 * ✅ Validated (Ring 0): Schema validation, system schema protection
 * ✅ Secured (Ring 1): Soft delete protection, access control
 * ✅ Processed (Ring 2): Existence validation, update merging
 * ✅ Enriched (Ring 4): UUID array processing, field transformations
 * 
 * This observer focuses solely on efficient SQL transport without business logic.
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
        const { system, operation, schemaName, schema, data, metadata } = context;
        
        // Check if any observer requested a transaction
        const needsTx = BaseObserver.isTransactionRequired(context);
        const reasons = BaseObserver.getTransactionReasons(context);
        
        system.info(`SQL transport layer executing ${operation}`, {
            schemaName,
            operation,
            recordCount: data?.length || 0,
            ring: this.ring,
            transactionRequired: needsTx,
            transactionReasons: reasons.length
        });
        
        // Start transaction if requested and not already in one
        if (needsTx && !system.tx) {
            system.tx = await system.db.connect();
            await system.tx.query('BEGIN');
            
            system.info('Transaction started for observer pipeline', {
                operation,
                schemaName,
                requestingObservers: reasons.length,
                reasons: reasons.map(r => `${r.observer}(Ring ${r.ring}): ${r.reason}`)
            });
        }
        
        try {
            let result: any[];
            
            switch (operation) {
                case 'create':
                    result = await this.bulkCreate(system, schema, data, metadata);
                    break;
                    
                case 'update':
                    result = await this.bulkUpdate(system, schema, data, metadata);
                    break;
                    
                case 'delete':
                    result = await this.bulkDelete(system, schema, data, metadata);
                    break;
                    
                case 'select':
                    result = await this.bulkSelect(system, schema, data, metadata);
                    break;
                    
                case 'revert':
                    result = await this.bulkRevert(system, schema, data, metadata);
                    break;
                    
                default:
                    throw new SystemError(`Unsupported SQL operation: ${operation}`);
            }
            
            context.result = result;
            
            system.info(`SQL transport completed successfully`, {
                schemaName,
                operation,
                inputRecords: data?.length || 0,
                outputRecords: result?.length || 0,
                executionTime: Date.now() - context.startTime,
                usedTransaction: !!system.tx
            });
            
        } catch (error) {
            system.warn(`SQL transport layer failed`, {
                schemaName,
                operation,
                recordCount: data?.length || 0,
                error: error instanceof Error ? error.message : String(error),
                usedTransaction: !!system.tx
            });
            throw new SystemError(
                `SQL transport failed for ${operation} on ${schemaName}`,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * Bulk create operation - direct SQL execution
     * 
     * Operates on pre-validated data from earlier observer rings.
     * Uses proper parameterized queries and handles PostgreSQL-specific data types.
     */
    private async bulkCreate(system: any, schema: any, records: any[], metadata: Map<string, any>): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        const results = [];
        const timestamp = new Date().toISOString();
        
        for (const recordData of records) {
            // Set up record with required system fields
            const record = {
                id: recordData.id || this.generateId(),
                created_at: recordData.created_at || timestamp,
                updated_at: recordData.updated_at || timestamp,
                ...recordData
            };
            
            // Process UUID arrays if flagged by UuidArrayProcessor
            const processedRecord = this.processUuidArrays(record, metadata);
            
            // Build parameterized INSERT query
            const fields = Object.keys(processedRecord);
            const values = Object.values(processedRecord);
            const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
            const fieldList = fields.map(field => `"${field}"`).join(', ');
            
            const query = `INSERT INTO "${schema.table}" (${fieldList}) VALUES (${placeholders}) RETURNING *`;
            const result = await this.getDbContext(system).query(query, values);
            
            if (result.rows.length === 0) {
                throw new SystemError(`Failed to create record in ${schema.name}`);
            }
            
            const convertedResult = this.convertPostgreSQLTypes(result.rows[0], schema);
            results.push(convertedResult);
        }
        
        return results;
    }
    
    /**
     * Bulk update operation - direct SQL execution
     * 
     * Operates on pre-merged data from UpdateMerger observer (Ring 0).
     * Data has already been merged with existing records and validated.
     */
    private async bulkUpdate(system: any, schema: any, records: any[], metadata: Map<string, any>): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        const results = [];
        
        for (const record of records) {
            if (!record.id) {
                throw new SystemError('Update record must have id field');
            }
            
            const { id, ...updateFields } = record;
            
            // Process UUID arrays if flagged by UuidArrayProcessor
            const processedFields = this.processUuidArrays(updateFields, metadata);
            
            const fields = Object.keys(processedFields);
            const values = Object.values(processedFields);
            
            if (fields.length === 0) {
                // No fields to update after processing - skip this record
                continue;
            }
            
            const setClause = fields.map((field, i) => `"${field}" = $${i + 1}`).join(', ');
            
            // Use FilterWhere for consistent WHERE clause generation
            const { whereClause, params: whereParams } = FilterWhere.generate(
                { id },  // WHERE conditions
                fields.length  // Start WHERE parameters after SET parameters
            );
            
            const query = `UPDATE "${schema.table}" SET ${setClause} WHERE ${whereClause} RETURNING *`;
            const allParams = [...values, ...whereParams];
            
            const result = await this.getDbContext(system).query(query, allParams);
            if (result.rows.length === 0) {
                throw new SystemError(`Update failed - record not found: ${id}`);
            }
            
            const convertedResult = this.convertPostgreSQLTypes(result.rows[0], schema);
            results.push(convertedResult);
        }
        
        return results;
    }
    
    /**
     * Bulk delete operation - direct SQL execution (soft delete)
     * 
     * Operates on pre-validated records from earlier observer rings.
     * All records have been confirmed to exist and be deletable.
     */
    private async bulkDelete(system: any, schema: any, records: any[], metadata: Map<string, any>): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        const ids = records.map(record => record.id).filter(id => id);
        if (ids.length === 0) {
            throw new SystemError('Delete records must have id fields');
        }
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids }
        });
        
        const query = `UPDATE "${schema.table}" SET trashed_at = NOW(), updated_at = NOW() WHERE ${whereClause} RETURNING *`;
        const result = await this.getDbContext(system).query(query, params);
        
        // Existence validation already confirmed these records exist
        if (result.rows.length !== ids.length) {
            throw new SystemError(`Delete operation affected ${result.rows.length} records, expected ${ids.length}`);
        }
        
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, schema));
    }
    
    /**
     * Bulk select operation - direct SQL execution
     * 
     * Executes SELECT queries with proper WHERE clause generation and ordering.
     */
    private async bulkSelect(system: any, schema: any, filters: any[], metadata: Map<string, any>): Promise<any[]> {
        if (!filters || filters.length === 0) {
            return [];
        }
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({});  // Default filtering for soft deletes
        
        const query = `SELECT * FROM "${schema.table}" WHERE ${whereClause} ORDER BY "created_at" DESC`;
        const result = await this.getDbContext(system).query(query, params);
        
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, schema));
    }
    
    /**
     * Bulk revert operation - direct SQL execution (undo soft deletes)
     * 
     * Operates on pre-validated trashed records from earlier observer rings.
     * Records have been confirmed to exist and be in trashed state.
     */
    private async bulkRevert(system: any, schema: any, records: any[], metadata: Map<string, any>): Promise<any[]> {
        if (!records || records.length === 0) {
            return [];
        }
        
        const ids = records.map(record => record.id || record).filter(id => id);
        if (ids.length === 0) {
            throw new SystemError('Revert records must have id fields');
        }
        
        // Use FilterWhere for consistent WHERE clause generation
        const { whereClause, params } = FilterWhere.generate({
            id: { $in: ids }
        }, 0, {
            includeTrashed: true  // Include trashed records for revert operation
        });
        
        // Build revert query - only revert actually trashed records
        const fullWhereClause = `${whereClause} AND "trashed_at" IS NOT NULL`;
        const query = `UPDATE "${schema.table}" SET trashed_at = NULL, updated_at = NOW() WHERE ${fullWhereClause} RETURNING *`;
        const result = await this.getDbContext(system).query(query, params);
        
        // ExistenceValidator already confirmed these are trashed records
        if (result.rows.length !== ids.length) {
            throw new SystemError(`Revert operation affected ${result.rows.length} records, expected ${ids.length}`);
        }
        
        return result.rows.map((row: any) => this.convertPostgreSQLTypes(row, schema));
    }
    
    /**
     * Convert PostgreSQL string results back to proper JSON types
     * 
     * PostgreSQL returns all values as strings by default. This method converts
     * them back to the correct JSON types based on the schema definition.
     */
    private convertPostgreSQLTypes(record: any, schema: any): any {
        if (!schema.definition?.properties) {
            return record;
        }
        
        const converted = { ...record };
        const properties = schema.definition.properties;
        
        for (const [fieldName, fieldDef] of Object.entries(properties)) {
            if (converted[fieldName] !== null && converted[fieldName] !== undefined) {
                const fieldDefinition = fieldDef as any;
                
                switch (fieldDefinition.type) {
                    case 'number':
                    case 'integer':
                        if (typeof converted[fieldName] === 'string') {
                            converted[fieldName] = Number(converted[fieldName]);
                        }
                        break;
                        
                    case 'boolean':
                        if (typeof converted[fieldName] === 'string') {
                            converted[fieldName] = converted[fieldName] === 'true';
                        }
                        break;
                        
                    // Arrays and objects should already be handled by PostgreSQL
                    // Strings and dates can remain as strings
                }
            }
        }
        
        return converted;
    }

    /**
     * Process UUID arrays for PostgreSQL compatibility
     * 
     * Converts JavaScript arrays to PostgreSQL array literals for UUID fields
     * based on metadata flags set by UuidArrayProcessor in Ring 4.
     */
    private processUuidArrays(record: any, metadata: Map<string, any>): any {
        const processed = { ...record };
        
        // Check each potential UUID array field
        const uuidFields = ['access_read', 'access_edit', 'access_full', 'access_deny'];
        
        for (const fieldName of uuidFields) {
            if (metadata.get(`${fieldName}_is_uuid_array`) && Array.isArray(processed[fieldName])) {
                // Convert JavaScript array to PostgreSQL array literal
                processed[fieldName] = `{${processed[fieldName].join(',')}}`;
            }
        }
        
        return processed;
    }
    
    /**
     * Get transaction-aware database context
     * Uses transaction if available, otherwise uses database connection
     */
    private getDbContext(system: any): any {
        return system.tx || system.db;
    }
    
    /**
     * Generate UUID for new records
     */
    private generateId(): string {
        return crypto.randomUUID();
    }
}