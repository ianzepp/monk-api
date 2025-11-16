/**
 * Type Mapper Observer - Ring 1 Input Validation
 *
 * Maps user-facing type names to PostgreSQL column_type enum values.
 * Handles multiple entry points (Describe API, Bulk API, migrations) by
 * normalizing types before they reach the database layer.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { ValidationError } from '@src/lib/observers/errors.js';

/**
 * Map user-facing type names to PostgreSQL column_type enum values
 */
const TYPE_MAPPING: Record<string, string> = {
    // Scalar types
    'text': 'text',
    'integer': 'integer',
    'decimal': 'numeric',      // User-facing "decimal" maps to PostgreSQL "numeric"
    'boolean': 'boolean',
    'timestamp': 'timestamp',
    'date': 'date',
    'uuid': 'uuid',
    'jsonb': 'jsonb',

    // Array types
    'text[]': 'text[]',
    'integer[]': 'integer[]',
    'decimal[]': 'numeric[]',  // User-facing "decimal[]" maps to PostgreSQL "numeric[]"
    'uuid[]': 'uuid[]',
} as const;

const VALID_USER_TYPES = Object.keys(TYPE_MAPPING);

export default class TypeMapperObserver extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;  // Ring 1
    readonly operations = ['create', 'update'] as const;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (!record || !record.type) {
            return; // Skip if no type field
        }

        const userType = record.type;
        const pgType = TYPE_MAPPING[userType];

        if (!pgType) {
            throw new ValidationError(
                `Invalid type '${userType}'. Valid types: ${VALID_USER_TYPES.join(', ')}`,
                'type'
            );
        }

        // Map user-facing type to PostgreSQL type
        record.type = pgType;
    }
}
