/**
 * Required Fields Validator
 * 
 * Universal validator that checks for required fields based on schema metadata
 * Ring: 0 (Validation) - Schema: % (all schemas) - Operations: create, update
 */

import type { ObserverContext } from '@lib/observers/interfaces.js';
import { BaseObserver } from '@lib/observers/base-observer.js';
import { ObserverRing } from '@lib/observers/types.js';
import { ValidationError } from '@lib/observers/errors.js';

export default class RequiredFieldsValidator extends BaseObserver {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;

    // Common required fields by schema
    private readonly requiredFields: Record<string, string[]> = {
        users: ['email'],
        accounts: ['name', 'type'],
        // Add more schema-specific required fields as needed
    };

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (!record) {
            return; // Skip null/undefined records
        }

        const { operation, schema } = context;
        const requiredFields = this.getRequiredFields(schema, operation);

        for (const field of requiredFields) {
            if (!this.hasValue(record, field)) {
                throw new ValidationError(`Missing required field: ${field}`, field);
            }
        }
    }

    private getRequiredFields(schema: string, operation: string): string[] {
        const schemaFields = this.requiredFields[schema] || [];
        
        // For updates, we might be more lenient on some fields
        if (operation === 'update') {
            // Example: email might not be required for updates
            return schemaFields.filter(field => field !== 'email');
        }
        
        return schemaFields;
    }

    private hasValue(data: any, field: string): boolean {
        const value = data[field];
        
        // Check for null, undefined, empty string, or empty arrays
        if (value === null || value === undefined || value === '') {
            return false;
        }
        
        if (Array.isArray(value) && value.length === 0) {
            return false;
        }
        
        return true;
    }
}