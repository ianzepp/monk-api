/**
 * Sudo Access Validator - User Schema Security Observer
 *
 * Ensures that user management operations require explicit sudo token.
 * Even users with access='root' must escalate via POST /api/auth/sudo
 * to get a short-lived sudo token before managing users.
 *
 * This provides:
 * - Audit trail for user management operations
 * - Time-limited access (15 minute sudo tokens)
 * - Explicit intent requirement for dangerous operations
 *
 * Ring 1 (Input Validation) - Early security check before any processing
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SudoAccessValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema } = context;

        // Only apply to user schema operations
        if (schema.schema_name !== 'users') {
            return;
        }

        logger.info('Validating sudo access for user management', {
            operation: context.operation,
            schemaName: schema.schema_name
        });

        // Get JWT payload from system context
        const jwtPayload = system.context.get('jwtPayload');

        // Verify user has sudo token (not just root access)
        if (!jwtPayload?.is_sudo) {
            throw new SystemError(
                `User management requires sudo token. Use POST /api/auth/sudo to get short-lived sudo access.`
            );
        }

        logger.info('Sudo access validated for user management', {
            operation: context.operation,
            userId: system.getUser?.()?.id,
            elevation_reason: jwtPayload.elevation_reason
        });
    }
}
