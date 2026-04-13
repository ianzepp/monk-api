import { BaseObserver } from '@src/lib/observers/base-observer.js';
import { ObserverRing } from '@src/lib/observers/types.js';
import type { ObserverContext } from '@src/lib/observers/interfaces.js';
import { authorizeRecordMutation } from '@src/lib/mutation-access.js';

/**
 * Record Mutation Authorizer
 *
 * Enforces record-level ACL checks before any mutation reaches ring 5.
 *
 * Rules:
 * - sudo/root callers bypass record ACL checks
 * - access_deny always wins for non-sudo callers
 * - update requires access_edit or access_full
 * - delete/revert/expire require access_full
 * - access mutations require sudo
 */
export default class RecordMutationAuthorizer extends BaseObserver {
    readonly ring = ObserverRing.Security;
    readonly operations = ['update', 'delete', 'revert', 'expire', 'access'] as const;
    readonly priority = 60;

    async execute(context: ObserverContext): Promise<void> {
        authorizeRecordMutation(context.system, context.record, context.operation);
    }
}
