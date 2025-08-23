/**
 * Email Validation Observer
 * 
 * Validates email format for user operations
 * Ring: 0 (Validation) - Schema: users - Operations: create, update
 */

import type { Observer, ObserverContext } from '../../../lib/observers/interfaces.js';
import { ObserverRing } from '../../../lib/observers/types.js';

export default class EmailValidator implements Observer {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;
    name = 'EmailValidator';

    async execute(context: ObserverContext): Promise<void> {
        const { data } = context;
        
        // Process each record in the array
        for (const [index, record] of data.entries()) {
            if (!record || !record.email) {
                continue; // No email to validate
            }

            if (!this.isValidEmail(record.email)) {
                context.errors.push({
                    message: `Invalid email format for record ${index}`,
                    field: 'email',
                    code: 'INVALID_EMAIL_FORMAT',
                    ring: this.ring,
                    observer: this.name
                });
            } else {
                // Normalize email to lowercase
                record.email = record.email.toLowerCase().trim();
            }
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return typeof email === 'string' && emailRegex.test(email);
    }
}