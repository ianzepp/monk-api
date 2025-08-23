/**
 * Email Validation Observer
 * 
 * Validates email format for user operations
 * Ring: 0 (Validation) - Schema: users - Operations: create, update
 */

import type { ObserverContext } from '@lib/observers/interfaces.js';
import { BaseObserver } from '@lib/observers/base-observer.js';
import { ObserverRing } from '@lib/observers/types.js';
import { ValidationError } from '@lib/observers/errors.js';

export default class EmailValidator extends BaseObserver {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { data } = context;
        
        // Process each record in the array
        for (const record of data) {
            if (!record || !record.email) {
                continue; // No email to validate
            }

            if (!this.isValidEmail(record.email)) {
                throw new ValidationError('Invalid email format', 'email');
            }

            // Normalize email to lowercase
            record.email = record.email.toLowerCase().trim();
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return typeof email === 'string' && emailRegex.test(email);
    }
}