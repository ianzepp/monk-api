/**
 * Root Access Validator - User Schema Security Observer
 * 
 * Ensures that only users with 'root' access can perform user management operations.
 * This prevents privilege escalation and maintains tenant security boundaries.
 * 
 * Ring 1 (Input Validation) - Early security check before any processing
 */

import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import { SystemError } from '@src/lib/observers/errors.js';

export default class RootAccessValidator extends BaseObserver {
    readonly ring = ObserverRing.InputValidation;
    readonly operations = ['create', 'update', 'delete'] as const;

    async execute(context: ObserverContext): Promise<void> {
        const { system, schema } = context;
        
        // Only apply to user schema operations
        if (schema.name !== 'user') {
            return;
        }
        
        logger.info('Validating root access for user management', {
            operation: context.operation,
            schemaName: schema.name
        });
        
        // Verify user has root access using system method
        if (!system.isRoot()) {
            const currentUser = system.getUser?.() || null;
            throw new SystemError(
                `User management requires 'root' access. Current role: '${currentUser?.role || 'unknown'}'`
            );
        }
        
        logger.info('Root access validated for user management', {
            operation: context.operation,
            userId: system.getUser?.()?.id
        });
    }
}