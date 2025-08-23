/**
 * Email Validation Observer
 * 
 * Validates email format for user operations
 * Ring: 0 (Validation) - Schema: users - Operations: create, update
 */

import type { Observer, ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

export default class EmailValidator implements Observer {
    ring = ObserverRing.Validation;
    operations = ['create', 'update'] as const;
    name = 'EmailValidator';

    async execute(context: ObserverContext): Promise<void> {
        const { data } = context;
        
        if (!data || !data.email) {
            return; // No email to validate
        }

        if (!this.isValidEmail(data.email)) {
            context.errors.push({
                message: 'Invalid email format',
                field: 'email',
                code: 'INVALID_EMAIL_FORMAT',
                ring: this.ring,
                observer: this.name
            });
        }

        // Normalize email to lowercase
        data.email = data.email.toLowerCase().trim();
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return typeof email === 'string' && emailRegex.test(email);
    }
}