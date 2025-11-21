/**
 * System Schema Validator - On "schemas"
 *
 * TODO: Add description of what this observer does
 *
 * Performance:
 * - TODO: Document performance characteristics
 *
 * Use cases:
 * - TODO: Document use cases
 *
 * Ring 1 (Input Validation) - Priority 10
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';
import { SYSTEM_SCHEMAS } from '@src/lib/schema.js';

export default class SystemSchemaValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 10;

    async executeOne(record: any, context: ObserverContext): Promise<void> {
        if (SYSTEM_SCHEMAS.has(record.schema_name) === false) {
            return;
        }

        throw new SystemError(
            `Schema "${record.schema_name}" is restricted and cannot be created, updated, or deleted`
        );
    }
}
