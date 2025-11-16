/**
 * Type Unmapper Observer - Ring 7 Output Transformation
 *
 * Maps PostgreSQL column_type values back to user-facing type names
 * when columns are selected from the database.
 *
 * This ensures that internal code, observers, and API responses all see
 * user-friendly type names (e.g., "decimal") instead of PostgreSQL-specific
 * names (e.g., "numeric").
 *
 * Paired with Ring 1 type-mapper.ts which does the reverse mapping.
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';

/**
 * Map PostgreSQL column_type values back to user-facing type names
 */
const REVERSE_TYPE_MAPPING: Record<string, string> = {
    // Scalar types
    'text': 'text',
    'integer': 'integer',
    'numeric': 'decimal',      // PostgreSQL "numeric" maps back to user-facing "decimal"
    'boolean': 'boolean',
    'timestamp': 'timestamp',
    'date': 'date',
    'uuid': 'uuid',
    'jsonb': 'jsonb',

    // Array types
    'text[]': 'text[]',
    'integer[]': 'integer[]',
    'numeric[]': 'decimal[]',  // PostgreSQL "numeric[]" maps back to user-facing "decimal[]"
    'uuid[]': 'uuid[]',
} as const;

export default class TypeUnmapperObserver extends BaseObserver {
    readonly ring = ObserverRing.PostDatabase;  // Ring 6
    readonly operations = ['select'] as const;
    readonly priority = 80;  // Run after DDL observers (which are typically priority 10-50)

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (!record || !record.type) {
            return; // Skip if no type field
        }

        const pgType = record.type;
        const userType = REVERSE_TYPE_MAPPING[pgType];

        if (userType) {
            // Map PostgreSQL type back to user-facing type
            record.type = userType;
        } else {
            // Unknown type - log warning but don't fail
            logger.warn('Unknown PostgreSQL type encountered in type unmapping', {
                pgType,
                schemaName: context.schema.schema_name,
                columnName: record.column_name
            });
            // Keep original value
        }
    }
}
