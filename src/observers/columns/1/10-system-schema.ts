/**
 * System Schema Validator - On "columns"
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
import type { SchemaRecord } from '@src/lib/schema-record.js';

export default class SystemSchemaValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 10;

    async executeOne(record: SchemaRecord, context: ObserverContext): Promise<void> {
        const { schema_name, column_name } = record;

        if (SYSTEM_SCHEMAS.has(schema_name) === false) {
            return;
        }

        throw new SystemError(
            `Column "${column_name}" is on schema "${schema_name}", which is restricted and cannot be created, updated, or deleted`        );
    }
}
