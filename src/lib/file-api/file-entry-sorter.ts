import type { FileEntry } from '@src/lib/file-api/file-types.js';

/**
 * Sort file entries based on specified criteria
 * 
 * Supports sorting by:
 * - name: Alphabetical by entry name
 * - size: By file size in bytes
 * - time: By modification timestamp
 * - type: Directories first, then files
 */

type SortBy = 'name' | 'size' | 'time' | 'type';
type SortOrder = 'asc' | 'desc';

/**
 * Sort file entries in-place
 */
export function sortFileEntries(
    entries: FileEntry[],
    sortBy: SortBy = 'name',
    sortOrder: SortOrder = 'asc'
): FileEntry[] {
    // Create a comparison function based on sort criteria
    const compareFn = createComparator(sortBy);
    
    // Sort entries
    entries.sort((a, b) => {
        const result = compareFn(a, b);
        // Reverse if descending order
        return sortOrder === 'desc' ? -result : result;
    });
    
    return entries;
}

/**
 * Create a comparator function for the specified sort field
 */
function createComparator(sortBy: SortBy): (a: FileEntry, b: FileEntry) => number {
    switch (sortBy) {
        case 'name':
            return compareByName;
        case 'size':
            return compareBySize;
        case 'time':
            return compareByTime;
        case 'type':
            return compareByType;
        default:
            return compareByName;
    }
}

/**
 * Compare entries by name (case-insensitive alphabetical)
 */
function compareByName(a: FileEntry, b: FileEntry): number {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Compare entries by file size
 * Directories are considered size 0
 */
function compareBySize(a: FileEntry, b: FileEntry): number {
    const sizeA = a.file_size;
    const sizeB = b.file_size;
    
    if (sizeA === sizeB) {
        // Fall back to name for stable sorting
        return compareByName(a, b);
    }
    
    return sizeA - sizeB;
}

/**
 * Compare entries by modification time
 * Uses file_modified timestamp (YYYYMMDDHHMMSS format)
 */
function compareByTime(a: FileEntry, b: FileEntry): number {
    const timeA = a.file_modified;
    const timeB = b.file_modified;
    
    if (timeA === timeB) {
        // Fall back to name for stable sorting
        return compareByName(a, b);
    }
    
    // String comparison works for YYYYMMDDHHMMSS format
    return timeA.localeCompare(timeB);
}

/**
 * Compare entries by type
 * Order: directories first (d), then files (f), then links (l)
 * Within same type, sort by name
 */
function compareByType(a: FileEntry, b: FileEntry): number {
    const typeOrder: Record<string, number> = {
        'd': 0, // directories
        'f': 1, // files
        'l': 2, // links
    };
    
    const orderA = typeOrder[a.file_type] ?? 999;
    const orderB = typeOrder[b.file_type] ?? 999;
    
    if (orderA === orderB) {
        // Same type, sort by name
        return compareByName(a, b);
    }
    
    return orderA - orderB;
}
