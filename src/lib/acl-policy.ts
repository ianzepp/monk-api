export const ACL_FIELDS = ['access_read', 'access_edit', 'access_full', 'access_deny'] as const;

export type AclField = (typeof ACL_FIELDS)[number];
export type AccessLevel = 'deny' | 'read' | 'edit' | 'full' | 'root';

export interface RecordAcl {
    access_read?: unknown;
    access_edit?: unknown;
    access_full?: unknown;
    access_deny?: unknown;
}

const ACCESS_RANK: Record<AccessLevel, number> = {
    deny: 0,
    read: 1,
    edit: 2,
    full: 3,
    root: 4
};

export function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function normalizeAccessLevel(value: string | null | undefined): AccessLevel {
    switch (value) {
        case 'read':
        case 'edit':
        case 'full':
        case 'root':
            return value;
        case 'deny':
        default:
            return 'deny';
    }
}

export function roleAtLeast(access: string | null | undefined, minimum: AccessLevel): boolean {
    return ACCESS_RANK[normalizeAccessLevel(access)] >= ACCESS_RANK[minimum];
}

export function getAclValues(record: RecordAcl, field: AclField): string[] {
    return asStringArray(record[field]);
}

export function hasExplicitAcl(record: RecordAcl): boolean {
    return ACL_FIELDS.some(field => getAclValues(record, field).length > 0);
}

export function isDenied(record: RecordAcl, userId: string): boolean {
    return getAclValues(record, 'access_deny').includes(userId);
}

export function canReadRecord(record: RecordAcl, userId: string, access: string | null | undefined, isSudo: boolean = false): boolean {
    if (isSudo) {
        return true;
    }

    if (isDenied(record, userId)) {
        return false;
    }

    if (!hasExplicitAcl(record)) {
        return roleAtLeast(access, 'read');
    }

    return (
        getAclValues(record, 'access_read').includes(userId) ||
        getAclValues(record, 'access_edit').includes(userId) ||
        getAclValues(record, 'access_full').includes(userId)
    );
}

export function canUpdateRecord(record: RecordAcl, userId: string, access: string | null | undefined, isSudo: boolean = false): boolean {
    if (isSudo) {
        return true;
    }

    if (isDenied(record, userId)) {
        return false;
    }

    if (!hasExplicitAcl(record)) {
        return roleAtLeast(access, 'edit');
    }

    return getAclValues(record, 'access_edit').includes(userId) || getAclValues(record, 'access_full').includes(userId);
}

export function canDeleteRecord(record: RecordAcl, userId: string, access: string | null | undefined, isSudo: boolean = false): boolean {
    if (isSudo) {
        return true;
    }

    if (isDenied(record, userId)) {
        return false;
    }

    if (!hasExplicitAcl(record)) {
        return roleAtLeast(access, 'full');
    }

    return getAclValues(record, 'access_full').includes(userId);
}
