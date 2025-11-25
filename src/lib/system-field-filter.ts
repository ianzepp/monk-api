/**
 * System Field Filter
 *
 * Fast, minimal filtering of system metadata fields (timestamps, ACLs).
 * Uses the delete-based approach for performance (O(n) spread + O(1) deletes).
 *
 * System fields:
 * - **Stat fields**: created_at, updated_at, trashed_at, deleted_at
 * - **Access fields**: access_read, access_edit, access_full, access_deny
 *
 * Usage:
 * ```typescript
 * const cleaned = filterSystemFields(record, true, false);  // Keep stat, remove access
 * const cleaned = filterSystemFields(records, false, false); // Remove both
 * ```
 */

/**
 * Filter system fields from data
 *
 * Performance: O(n) for object spread + O(1) for deletes
 * Handles objects, arrays, and primitives
 *
 * @param data - Data to filter (object, array, or primitive)
 * @param includeStat - Whether to include stat fields (created_at, updated_at, etc.)
 * @param includeAccess - Whether to include access fields (access_read, access_edit, etc.)
 * @returns Filtered data (non-mutating - returns new object/array)
 */
export function filterSystemFields(
    data: any,
    includeStat: boolean = true,
    includeAccess: boolean = true
): any {
    if (data === null || data === undefined) {
        return data;
    }

    // Handle arrays - recursively filter each item
    if (Array.isArray(data)) {
        return data.map(item => filterSystemFields(item, includeStat, includeAccess));
    }

    // Handle objects - filter system fields
    if (typeof data === 'object') {
        const filtered = { ...data };

        if (!includeStat) {
            delete filtered.created_at;
            delete filtered.updated_at;
            delete filtered.trashed_at;
            delete filtered.deleted_at;
        }

        if (!includeAccess) {
            delete filtered.access_read;
            delete filtered.access_edit;
            delete filtered.access_full;
            delete filtered.access_deny;
        }

        return filtered;
    }

    // Primitives pass through unchanged
    return data;
}

/**
 * System stat fields (timestamps)
 */
export const STAT_FIELDS = [
    'created_at',
    'updated_at',
    'trashed_at',
    'deleted_at',
] as const;

/**
 * System access fields (ACLs)
 */
export const ACCESS_FIELDS = [
    'access_read',
    'access_edit',
    'access_full',
    'access_deny',
] as const;

/**
 * Check if a field is a system stat field (O(1) check)
 */
export function isStatField(fieldName: string): boolean {
    return (
        fieldName === 'created_at' ||
        fieldName === 'updated_at' ||
        fieldName === 'trashed_at' ||
        fieldName === 'deleted_at'
    );
}

/**
 * Check if a field is a system access field (O(1) check)
 */
export function isAccessField(fieldName: string): boolean {
    return (
        fieldName === 'access_read' ||
        fieldName === 'access_edit' ||
        fieldName === 'access_full' ||
        fieldName === 'access_deny'
    );
}

/**
 * Check if a field is any system field (O(1) check)
 */
export function isSystemField(fieldName: string): boolean {
    return isStatField(fieldName) || isAccessField(fieldName);
}

/**
 * Get visible field names from a record (excludes 'id' and filtered system fields)
 *
 * Used by File API for field listings and metadata.
 * Performance: O(n) where n = number of fields
 *
 * @param record - Record object to analyze
 * @param includeStat - Whether to include stat fields
 * @param includeAccess - Whether to include access fields
 * @returns Array of field names that should be visible
 */
export function getVisibleFieldNames(
    record: Record<string, any>,
    includeStat: boolean = true,
    includeAccess: boolean = true
): string[] {
    if (!record || typeof record !== 'object') {
        return [];
    }

    const fields: string[] = [];

    for (const key of Object.keys(record)) {
        // Always exclude 'id' from field listings (system identifier)
        if (key === 'id') {
            continue;
        }

        // Exclude stat fields if not included
        if (!includeStat && isStatField(key)) {
            continue;
        }

        // Exclude access fields if not included
        if (!includeAccess && isAccessField(key)) {
            continue;
        }

        fields.push(key);
    }

    return fields;
}
