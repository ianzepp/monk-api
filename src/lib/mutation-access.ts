import type { ModelRecord } from '@src/lib/model-record.js';
import { SecurityError } from '@src/lib/observers/errors.js';
import type { SystemContext } from '@src/lib/system-context-types.js';
import type { OperationType } from '@src/lib/observers/types.js';

const ACL_FIELDS = ['access_read', 'access_edit', 'access_full', 'access_deny'] as const;

type AclField = (typeof ACL_FIELDS)[number];

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function recordAclValues(record: ModelRecord, field: AclField): string[] {
    return asStringArray(record.old(field));
}

function isDenied(record: ModelRecord, userId: string): boolean {
    return recordAclValues(record, 'access_deny').includes(userId);
}

function canUpdate(record: ModelRecord, userId: string): boolean {
    return recordAclValues(record, 'access_edit').includes(userId) || recordAclValues(record, 'access_full').includes(userId);
}

function canDelete(record: ModelRecord, userId: string): boolean {
    return recordAclValues(record, 'access_full').includes(userId);
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

    if (isDenied(record, userId)) {
        throw new SecurityError('Record access denied', undefined, 'ACCESS_DENIED');
    }

    if (operation === 'update') {
        if (!canUpdate(record, userId)) {
            throw new SecurityError('Updating this record requires edit or full access', undefined, 'ACCESS_DENIED');
        }
        return;
    }

    if (!canDelete(record, userId)) {
        throw new SecurityError('Deleting this record requires full access', undefined, 'ACCESS_DENIED');
    }
}
