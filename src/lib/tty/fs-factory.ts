/**
 * FS Factory
 *
 * Creates a fully configured FS instance with all standard mounts.
 * Used by TTY commands to access the virtual filesystem.
 */

import type { System } from '@src/lib/system.js';
import { FS, ModelBackedStorage } from '@src/lib/fs/index.js';
import { SystemMount } from '@src/lib/fs/mounts/system-mount.js';
import { DataMount } from '@src/lib/fs/mounts/data-mount.js';
import { DescribeMount } from '@src/lib/fs/mounts/describe-mount.js';
import { FindMount } from '@src/lib/fs/mounts/find-mount.js';
import { TrashedMount } from '@src/lib/fs/mounts/trashed-mount.js';

/**
 * Create a fully configured FS instance with all standard mounts.
 *
 * Mounts:
 * - /api/data - CRUD operations on model records
 * - /api/describe - Model schemas
 * - /api/find - Saved queries/filters
 * - /api/trashed - Soft-deleted records
 * - /system - System introspection (read-only)
 * - /* (fallback) - ModelBackedStorage for /home, /tmp, /etc
 *
 * @param system - Authenticated system context
 * @returns Configured FS instance
 */
export function createFS(system: System): FS {
    const fs = new FS(system);

    // API mounts
    fs.mount('/api/data', new DataMount(system));
    fs.mount('/api/describe', new DescribeMount(system));
    fs.mount('/api/find', new FindMount(system));
    fs.mount('/api/trashed', new TrashedMount(system));

    // System introspection (read-only)
    fs.mount('/system', new SystemMount(system));

    // Fallback to database-backed storage for /home, /tmp, /etc
    fs.setFallback(new ModelBackedStorage(system));

    return fs;
}
