/**
 * Required Fields Validator
 * 
 * Universal validator that checks for required fields based on schema metadata
 * Ring: 0 (Validation) - Schema: % (all schemas) - Operations: create, update
 */

import type { Observer, ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

export default class RequiredFieldsValidator implements Observer {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;
    name = 'RequiredFieldsValidator';

    // Common required fields by schema
    private readonly requiredFields: Record<string, string[]> = {
        users: ['email'],
        accounts: ['name', 'type'],
        // Add more schema-specific required fields as needed
    };

    async execute(context: ObserverContext): Promise<void> {
        const { data, operation, schema } = context;
        
        if (!data) {
            return; // No data to validate
        }

        const requiredFields = this.getRequiredFields(schema, operation);
        
        for (const field of requiredFields) {
            if (!this.hasValue(data, field)) {
                context.errors.push({
                    message: `Missing required field: ${field}`,
                    field: field,
                    code: 'REQUIRED_FIELD_MISSING',
                    ring: this.ring,
                    observer: this.name
                });
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