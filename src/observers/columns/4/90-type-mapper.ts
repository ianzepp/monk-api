/**
 * Type Mapper Observer - Ring 4 Enrichment
 *
 * Maps user-facing type names to PostgreSQL column_type enum values just before
 * database operations (Ring 5). This ensures that:
 *
 * - Rings 1-3 (validation, security, business logic) work with user-friendly types
 * - Ring 4 transforms data for database storage
 * - Ring 5 database operations see PostgreSQL types
 * - Ring 6 DDL observers receive PostgreSQL types (no mapping needed)
 * - Ring 6 type unmapper converts back to user types for API responses
 *
 * Type conversion is bidirectional:
 * - User → PG: Ring 4 type-mapper (this observer)
 * - PG → User: Ring 6 type-unmapper (runs on all operations that return data)
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
    readonly ring = ObserverRing.Enrichment;  // Ring 4
    readonly operations = ['create', 'update'] as const;
    readonly priority = 90;  // Run late in Ring 4, just before database (Ring 5)

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
