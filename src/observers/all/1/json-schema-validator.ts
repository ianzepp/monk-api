/**
 * JSON Schema Validator Observer
 * 
 * Validates incoming data against the schema's JSON Schema definition using
 * the Schema object's validateOrThrow() method. Ensures all data conforms
 * to the defined schema structure before database operations.
 * 
 * For create operations: validates raw input data
 * For update operations: validates merged data from UpdateMerger (also Ring 0)
 * 
 * Uses the Schema object loaded by ObserverRunner - no additional database
 * calls needed since Schema object contains validation capabilities.
 * 
 * Ring: 1 (Input Validation) - Schema: all - Operations: create, update
 */

import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ValidationError } from '@src/lib/observers/errors.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';

export default class JsonSchemaValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema, schemaName, operation, data, metadata } = context;
        
        let validatedCount = 0;
        let errorCount = 0;
        
        // Validate each record against the JSON Schema
        for (const record of data) {
            try {
                // Use Schema object's validation method
                schema.validateOrThrow(record);
                validatedCount++;
                
            } catch (error) {
                errorCount++;
                
                // Convert schema validation errors to observer ValidationError
                const validationMessage = error instanceof Error ? error.message : String(error);
                throw new ValidationError(
                    `Schema validation failed for ${schemaName}: ${validationMessage}`,
                    undefined, // No specific field
                    'JSON_SCHEMA_VALIDATION_FAILED'
                );
            }
        }
        
        // Log validation summary for audit
        metadata.set('json_schema_validation', 'passed');
        metadata.set('validated_record_count', validatedCount);
        
        logger.info('JSON Schema validation completed', {
            schemaName,
            operation,
            recordCount: data.length,
            validatedCount,
            errorCount
        });
    }
}