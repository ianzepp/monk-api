/**
 * External Schema Guard Observer - Ring 0 PreValidation
 *
 * Rejects any create/update/delete/select operations on external schemas.
 * External schemas are documented in the system but managed by specialized APIs.
 * This runs in Ring 0 to protect ALL code paths (API and internal).
 */
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { UserError } from '@src/lib/observers/errors.js';

export default class ExternalSchemaGuard extends BaseObserver {
    readonly ring = ObserverRing.DataPreparation; // Ring 0
    readonly operations = ['select', 'create', 'update', 'delete'] as const;
    readonly priority = 5; // Early execution, before most validation

    async execute(context: ObserverContext): Promise<void> {
        const { schema } = context;
        const schemaName = schema.schema_name;

        // Check if schema is external
        if (schema.external === true) {
            throw new UserError(
                `Schema '${schemaName}' is externally managed and cannot be modified via Data API. Use the appropriate specialized API instead.`,
                'SCHEMA_EXTERNAL'
            );
        }

        // Schema is internal, allow operation to continue
    }
}
