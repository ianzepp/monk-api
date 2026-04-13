import type { ModelRecord } from '@src/lib/model-record.js';
import { asStringArray, canDeleteRecord, canUpdateRecord, isDenied, type RecordAcl } from '@src/lib/acl-policy.js';
import { SecurityError } from '@src/lib/observers/errors.js';
import type { SystemContext } from '@src/lib/system-context-types.js';
import type { OperationType } from '@src/lib/observers/types.js';

function recordAcl(record: ModelRecord): RecordAcl {
    return {
        access_read: asStringArray(record.old('access_read')),
        access_edit: asStringArray(record.old('access_edit')),
        access_full: asStringArray(record.old('access_full')),
        access_deny: asStringArray(record.old('access_deny'))
    };
}

function canAccessMutation(system: SystemContext): boolean {
    return system.isSudo();
}

/**
 * Enforce record-level mutation authorization.
 *
 * Rules:
 * - sudo/root bypass all ACL checks
 * - access_deny always wins for non-sudo callers
 * - update requires access_edit or access_full
 * - delete/revert/expire require access_full
 * - access mutations require sudo
 */
export function authorizeRecordMutation(
    system: SystemContext,
    record: ModelRecord,
    operation: OperationType
): void {
    if (operation === 'access') {
        if (!canAccessMutation(system)) {
            throw new SecurityError('Modifying record ACLs requires sudo access', undefined, 'SUDO_REQUIRED');
        }
        return;
    }

    if (system.isSudo()) {
        return;
    }

    const userId = system.userId;
    const acl = recordAcl(record);

    if (isDenied(acl, userId)) {
        throw new SecurityError('Record access denied', undefined, 'ACCESS_DENIED');
    }

    if (operation === 'update') {
        if (!canUpdateRecord(acl, userId, system.access, system.isSudo())) {
            throw new SecurityError('Updating this record requires edit or full access', undefined, 'ACCESS_DENIED');
        }
        return;
    }

    if (!canDeleteRecord(acl, userId, system.access, system.isSudo())) {
        throw new SecurityError('Deleting this record requires full access', undefined, 'ACCESS_DENIED');
    }
}
