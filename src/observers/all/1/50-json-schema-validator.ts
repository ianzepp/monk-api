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
        const { schema, operation, data, metadata } = context;
        const schemaName = schema.schema_name;

        let validatedCount = 0;
        let errorCount = 0;

        // Define system fields that should be excluded from JSON schema validation
        const systemFields = [
            'id', 'created_at', 'updated_at', 'deleted_at', 'trashed_at',
            'access_deny', 'access_edit', 'access_full', 'access_read'
        ];

        // Validate each record against the JSON Schema
        for (const record of data) {
            // Filter out system fields before validation - only validate user-provided fields
            const userRecord = Object.fromEntries(
                Object.entries(record).filter(([key]) => !systemFields.includes(key))
            );

            try {
                // Use Schema object's validation method on user fields only
                schema.validateOrThrow(userRecord);
                validatedCount++;

            } catch (error) {
                errorCount++;

                // Convert schema validation errors to observer ValidationError
                const validationMessage = error instanceof Error ? error.message : String(error);

                // Enhanced error reporting - show what fields are being validated vs schema
                const userRecordFields = Object.keys(userRecord).sort();
                const allRecordFields = Object.keys(record).sort();
                const filteredFields = systemFields.filter(field => record.hasOwnProperty(field)).sort();
                const schemaProperties = schema.definition?.properties ? Object.keys(schema.definition.properties).sort() : [];
                const additionalFields = userRecordFields.filter(field => !schemaProperties.includes(field));

                let enhancedMessage = `Schema validation failed for ${schemaName}: ${validationMessage}`;
                enhancedMessage += `\n  All record fields: [${allRecordFields.join(', ')}]`;
                enhancedMessage += `\n  System fields filtered out: [${filteredFields.join(', ')}]`;
                enhancedMessage += `\n  User fields validated: [${userRecordFields.join(', ')}]`;
                enhancedMessage += `\n  Schema allows: [${schemaProperties.join(', ')}]`;

                if (additionalFields.length > 0) {
                    enhancedMessage += `\n  Additional user fields found: [${additionalFields.join(', ')}]`;
                }

                throw new ValidationError(
                    enhancedMessage,
                    undefined, // No specific field
                    'JSON_SCHEMA_VALIDATION_FAILED'
                );
            }
        }

        // Log validation summary for audit

        logger.info('JSON Schema validation completed', {
            schemaName,
            operation,
            recordCount: data.length,
            validatedCount,
            errorCount
        });
    }
}
