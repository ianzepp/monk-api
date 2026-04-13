export const ACCESS_LEVELS = ['deny', 'read', 'edit', 'full', 'root'] as const;

export type AccessLevel = typeof ACCESS_LEVELS[number];

export interface ApiKeyPermissions {
    access?: AccessLevel;
    sudo?: boolean;
}

export interface ApiKeyOwnerAccess {
    access: string;
    access_read?: string[];
    access_edit?: string[];
    access_full?: string[];
}

export interface EffectiveApiKeyAccess {
    access: AccessLevel;
    access_read: string[];
    access_edit: string[];
    access_full: string[];
    is_sudo: boolean;
}

const ACCESS_RANK: Record<AccessLevel, number> = {
    deny: 0,
    read: 1,
    edit: 2,
    full: 3,
    root: 4,
};

export function validateApiKeyPermissions(input: unknown): ApiKeyPermissions | null {
    if (input == null) {
        return null;
    }

    if (typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('API key permissions must be an object');
    }

    const raw = input as Record<string, unknown>;
    const normalized: ApiKeyPermissions = {};

    if (raw.access !== undefined) {
        if (typeof raw.access !== 'string' || !isAccessLevel(raw.access)) {
            throw new Error('API key permissions.access must be one of deny, read, edit, full, root');
        }
        normalized.access = raw.access;
    }

    if (raw.sudo !== undefined) {
        if (typeof raw.sudo !== 'boolean') {
            throw new Error('API key permissions.sudo must be a boolean');
        }
        normalized.sudo = raw.sudo;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
}

export function parseStoredApiKeyPermissions(value: unknown): ApiKeyPermissions | null {
    if (value == null) {
        return null;
    }

    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return validateApiKeyPermissions(parsed);
    } catch {
        return null;
    }
}

export function computeEffectiveApiKeyAccess(
    owner: ApiKeyOwnerAccess,
    permissions: ApiKeyPermissions | null
): EffectiveApiKeyAccess {
    const ownerAccess = normalizeAccessLevel(owner.access);
    const allowsSudo = permissions?.sudo === true;
    const accessRead = normalizeAccessArray(owner.access_read);
    const accessEdit = normalizeAccessArray(owner.access_edit);
    const accessFull = normalizeAccessArray(owner.access_full);

    // Root-owned API keys are not automatically sudo. Without explicit sudo permission,
    // clamp the key to at most full access so System.isRoot() does not succeed.
    const defaultCap: AccessLevel = ownerAccess === 'root' && !allowsSudo ? 'full' : ownerAccess;
    const requestedAccess = permissions?.access || defaultCap;
    const effectiveAccess = minAccessLevel(defaultCap, requestedAccess);

    const effective: EffectiveApiKeyAccess = {
        access: effectiveAccess,
        access_read: effectiveAccess === 'deny' ? [] : accessRead,
        access_edit: ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.edit ? accessEdit : [],
        access_full: ACCESS_RANK[effectiveAccess] >= ACCESS_RANK.full ? accessFull : [],
        is_sudo: allowsSudo && (effectiveAccess === 'full' || effectiveAccess === 'root'),
    };

    return effective;
}

function isAccessLevel(value: string): value is AccessLevel {
    return ACCESS_LEVELS.includes(value as AccessLevel);
}

function normalizeAccessLevel(value: string): AccessLevel {
    return isAccessLevel(value) ? value : 'deny';
}

function minAccessLevel(a: AccessLevel, b: AccessLevel): AccessLevel {
    return ACCESS_RANK[a] <= ACCESS_RANK[b] ? a : b;
}

function normalizeAccessArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string');
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((item): item is string => typeof item === 'string');
            }
        } catch {
            return [];
        }
    }

    return [];
}
