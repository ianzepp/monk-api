/**
 * Email Validation Pipeline
 *
 * Validates email format for user operations
 * Ring: 0 (Validation) - Schema: users - Operations: create, update
 */

import type { PipelineContext } from '@src/lib/pipeline/interfaces.js';
import { BaseObserver } from '@src/lib/pipeline/base-observer.js';
import { PipelineRing } from '@src/lib/pipeline/types.js';
import { ValidationError } from '@src/lib/pipeline/errors.js';

export default class EmailValidator extends BaseObserver {
    ring = PipelineRing.InputValidation;
    operations = ['create', 'update'] as const;

    async executeOne(record: any, context: PipelineContext): Promise<void> {
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
