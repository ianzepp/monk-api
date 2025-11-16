/**
 * Sudo Access Validator - Generic Schema Security Observer
 *
 * Ensures that operations on schemas marked with sudo=true require explicit sudo token.
 * Even users with access='root' must escalate via POST /api/auth/sudo
 * to get a short-lived sudo token before managing protected schemas.
 *
 * This provides:
 * - Data-driven schema protection (checks schemas.sudo column)
 * - Audit trail for protected schema operations
 * - Time-limited access (15 minute sudo tokens)
 * - Explicit intent requirement for dangerous operations
 *
 * Ring 1 (Input Validation) - Early security check before any processing
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SudoValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema } = context;

        // Use cached schema data - the schema object comes from SchemaCache via Database.toSchema()
        // This avoids redundant database queries since the schema is already loaded and cached
        const requiresSudo = schema.sudo ?? false;

        if (!requiresSudo) {
            // Schema doesn't require sudo - allow normal processing
            return;
        }

        logger.info('Validating sudo access for protected schema', {
            operation: context.operation,
            schemaName: schema.schema_name
        });

        // Get JWT payload from system context
        const jwtPayload = system.context.get('jwtPayload');

        // Verify user has sudo token (not just root access)
        if (!jwtPayload?.is_sudo) {
            throw new SystemError(
                `Schema '${schema.schema_name}' requires sudo access. Use POST /api/auth/sudo to get short-lived sudo token.`
            );
        }

        logger.info('Sudo access validated for protected schema', {
            operation: context.operation,
            schemaName: schema.schema_name,
            userId: system.getUser?.()?.id,
            elevation_reason: jwtPayload.elevation_reason
        });
    }
}
