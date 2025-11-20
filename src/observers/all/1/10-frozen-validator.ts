/**
 * Freeze Validator - Schema-Level Data Protection Observer
 *
 * Prevents all data operations (create, update, delete) on schemas marked with frozen=true.
 * This provides emergency "circuit breaker" functionality to temporarily lock down schemas
 * during incidents or maintenance windows.
 *
 * Performance:
 * - Zero database queries: uses Schema.isFrozen() which reads from cached schema metadata
 * - O(1) check: single boolean flag check per operation
 *
 * Use cases:
 * - Emergency data protection during security incidents
 * - Maintenance windows requiring read-only access
 * - Regulatory compliance freeze periods
 * - Preventing modifications during audits
 *
 * Ring 1 (Input Validation) - Priority 10 (highest - first security check)
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SecurityError } from '@src/lib/observers/errors.js';

export default class FrozenValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 10;

    async execute(context: ObserverContext): Promise<void> {
        const { schema, operation, data } = context;

        // Use cached schema metadata - zero DB queries
        if (schema.isFrozen()) {
            const schemaName = schema.schema_name;

            logger.warn(`Blocked ${operation} on frozen schema`, {
                schemaName,
                operation,
                recordCount: data.length,
                frozen: true
            });

            throw new SecurityError(
                `Schema '${schemaName}' is frozen. All data operations are temporarily disabled. ` +
                `Contact your administrator to unfreeze this schema.`,
                undefined, // No specific field
                'SCHEMA_FROZEN'
            );
        }

        // Schema not frozen - allow operation to continue
    }
}
