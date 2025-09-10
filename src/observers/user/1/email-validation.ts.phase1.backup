/**
 * Email Validation Observer
 * 
 * Validates email format for user operations
 * Ring: 0 (Validation) - Schema: users - Operations: create, update
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';

export default class EmailValidator extends BaseObserver {
    ring = ObserverRing.InputValidation;
    operations = ['create', 'update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (!record || !record.email) {
            return; // No email to validate
        }

        if (!this.isValidEmail(record.email)) {
            throw new ValidationError('Invalid email format', 'email');
        }

        // Normalize email to lowercase
        record.email = record.email.toLowerCase().trim();
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return typeof email === 'string' && emailRegex.test(email);
    }
}