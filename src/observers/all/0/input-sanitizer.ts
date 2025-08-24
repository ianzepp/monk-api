/**
 * Input Sanitization Observer
 * 
 * Universal sanitizer that cleans input data for security
 * Ring: 0 (Validation) - Schema: all - Operations: create, update
 */

import { BaseObserver } from '@lib/observers/base-observer.js';
import { ValidationError } from '@lib/observers/errors.js';
import type { ObserverContext } from '@lib/observers/interfaces.js';
import { ObserverRing } from '@lib/observers/types.js';

export default class InputSanitizer extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation;
    readonly operations = ['create', 'update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (record && typeof record === 'object') {
            this.sanitizeObject(record);
        }
    }

    private sanitizeObject(obj: any): void {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                obj[key] = this.sanitizeString(value);
            } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'string') {
                        value[index] = this.sanitizeString(item);
                    } else if (typeof item === 'object' && item !== null) {
                        this.sanitizeObject(item);
                    }
                });
            } else if (typeof value === 'object' && value !== null) {
                this.sanitizeObject(value);
            }
        }
    }

    private sanitizeString(input: string): string {
        if (!input) return input;
        
        return input
            // Trim whitespace
            .trim()
            // Remove null bytes
            .replace(/\0/g, '')
            // Basic HTML entity encoding for dangerous characters
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }
}