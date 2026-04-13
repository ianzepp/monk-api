import { HttpErrors } from '@src/lib/errors/http-error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACL_FIELDS = ['access_read', 'access_edit', 'access_full', 'access_deny'] as const;

export type AclField = (typeof ACL_FIELDS)[number];

export function requireAclMutationAccess(system: { isSudo(): boolean }): void {
    if (!system.isSudo()) {
        throw HttpErrors.forbidden(
            'Modifying record ACLs requires sudo access',
            'SUDO_REQUIRED'
        );
    }
}

export function validateAclFieldValues(field: string, value: unknown): string[] {
    if (!Array.isArray(value)) {
        throw HttpErrors.badRequest(`${field} must be an array`, 'INVALID_ACL_FORMAT');
    }

    if (!value.every((userId: unknown) => typeof userId === 'string')) {
        throw HttpErrors.badRequest(`${field} must contain only string user IDs`, 'INVALID_USER_ID_FORMAT');
    }

    const invalidIds = value.filter((userId: string) => !UUID_REGEX.test(userId));
    if (invalidIds.length > 0) {
        throw HttpErrors.badRequest(
            `${field} must contain valid UUID user IDs`,
            'INVALID_USER_ID_FORMAT',
            { field, invalid_ids: invalidIds }
        );
    }

    return value;
}

export function getAclFields(): readonly AclField[] {
    return ACL_FIELDS;
}
