/**
 * Hidden fields that should be stripped from records unless show_hidden is true
 * 
 * Includes:
 * - All access_* ACL fields
 * - Timestamp fields (created_at, updated_at, trashed_at, deleted_at)
 * 
 * The 'id' field is intentionally excluded and will always be visible.
 */
const HIDDEN_FIELDS = [
    'access_read',
    'access_edit',
    'access_full',
    'access_deny',
    'created_at',
    'updated_at',
    'trashed_at',
    'deleted_at',
] as const;

/**
 * Check if a field should be hidden based on show_hidden option
 */
export function isHiddenField(fieldName: string): boolean {
    return HIDDEN_FIELDS.includes(fieldName as any);
}

/**
 * Filter record data based on show_hidden option
 * 
 * When show_hidden is false (default):
 * - Strips access_* ACL fields
 * - Strips timestamp fields (created_at, updated_at, trashed_at, deleted_at)
 * - Keeps the 'id' field
 * 
 * When show_hidden is true:
 * - Returns the full record unchanged
 * 
 * @param record - The record object to filter
 * @param showHidden - Whether to include hidden fields (default: false)
 * @returns Filtered record object
 */
export function filterRecordFields(record: Record<string, any>, showHidden: boolean = false): Record<string, any> {
    if (showHidden) {
        return record;
    }

    const filtered: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(record)) {
        if (!isHiddenField(key)) {
            filtered[key] = value;
        }
    }
    
    return filtered;
}

/**
 * Get list of visible field names from a record
 * 
 * Used for field listings and metadata calculations.
 * Always excludes system fields unless show_hidden is true.
 */
export function getVisibleFieldNames(record: Record<string, any>, showHidden: boolean = false): string[] {
    return Object.keys(record).filter(key => {
        // Always exclude system infrastructure fields from listings
        if (key === 'id') return false;
        
        // Hide timestamp and ACL fields unless requested
        if (!showHidden && isHiddenField(key)) {
            return false;
        }
        
        return true;
    });
}
