/**
 * System Schema Protector Observer
 *
 * Prevents data operations on schemas marked with status="system" to maintain
 * system integrity. System schemas should only be modified through the describe API,
 * not the data API.
 *
 * Uses the Schema object's isSystemSchema() method which checks the status field
 * from the schema table. No additional database calls needed since Schema object
 * is loaded by ObserverRunner before observers execute.
 *
 * Ring: 1 (Input Validation) - Schema: all - Operations: create, update, delete
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class SystemSchemaProtector extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { schema, operation, metadata } = context;
        const schemaName = schema.name;

        // Check if this is a system schema using Schema.isSystemSchema()
        if (schema.isSystemSchema()) {
            throw new ValidationError(
                `Cannot ${operation} records in system schema "${schemaName}" - use describe API for schema management`,
                undefined, // No specific field
                'SYSTEM_SCHEMA_PROTECTION'
            );
        }

        // Log protection check for audit
        metadata.set('system_schema_check', 'passed');
        metadata.set('schema_type', 'user_schema');

        logger.info('System schema protection check passed', {
            schemaName,
            operation,
            schemaType: 'user_schema'
        });
    }
}
