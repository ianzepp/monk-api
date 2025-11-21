/**
 * Schema Sudo Access Validator - Schema-Level Security Observer
 *
 * Ensures that operations on schemas marked with sudo=true require sudo access.
 * Sudo access is granted via:
 * - access='root' (automatic sudo, like Linux root user)
 * - is_sudo=true (explicit sudo token from POST /api/user/sudo)
 * - as_sudo=true (temporary self-service sudo flag)
 *
 * This provides:
 * - Data-driven schema protection (checks schemas.sudo column)
 * - Audit trail for protected schema operations
 * - Automatic sudo for root users (no extra step needed)
 * - Optional explicit elevation for audit trail
 *
 * Ring 1 (Input Validation) - Priority 20 (schema-level security)
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class SchemaSudoValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;
    readonly priority = 20;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema } = context;

        // Don't apply sudo checks to schema metadata operations (operations on the 'schemas' table itself)
        // The sudo flag protects DATA operations, not metadata operations
        // Schema metadata operations already require root/admin privileges
        if (schema.schema_name === 'schemas') {
            return;
        }

        // Use cached schema data - the schema object comes from SchemaCache via Database.toSchema()
        // This avoids redundant database queries since the schema is already loaded and cached
        const requiresSudo = schema.sudo ?? false;

        if (!requiresSudo) {
            // Schema doesn't require sudo - allow normal processing
            return;
        }

        console.info('Validating sudo access for protected schema', {
            operation: context.operation,
            schemaName: schema.schema_name
        });

        // Use isSudo() helper which checks: root user, is_sudo flag, or as_sudo flag
        const isSudo = system.context.get('isSudo') as (() => boolean);

        if (!isSudo || !isSudo()) {
            throw new SystemError(
                `Schema '${schema.schema_name}' requires sudo access. Root users have automatic access, others must use POST /api/user/sudo.`
            );
        }

        const jwtPayload = system.context.get('jwtPayload');
        console.info('Sudo access validated for protected schema', {
            operation: context.operation,
            schemaName: schema.schema_name,
            userId: system.getUser?.()?.id,
            elevation_reason: jwtPayload?.elevation_reason
        });
    }
}
