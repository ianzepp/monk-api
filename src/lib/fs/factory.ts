/**
 * FS Factory
 *
 * Creates a fully configured FS instance with all standard mounts.
 */

import type { System } from '@src/lib/system.js';
import { FS } from './index.js';
import { ModelBackedStorage } from './storage.js';
import { SystemMount } from './mounts/system-mount.js';
import { DataMount } from './mounts/data-mount.js';
import { DescribeMount } from './mounts/describe-mount.js';
import { FindMount } from './mounts/find-mount.js';
import { TrashedMount } from './mounts/trashed-mount.js';
import { ProcMount } from './mounts/proc-mount.js';

/**
 * Options for creating a FS instance
 */
export interface CreateFSOptions {
    /** Current session's PID for /proc/self symlink */
    sessionPid?: number | null;
}

/**
 * Create a fully configured FS instance with all standard mounts.
 *
 * Mounts:
 * - /api/data - CRUD operations on model records
 * - /api/describe - Model schemas
 * - /api/find - Saved queries/filters
 * - /api/trashed - Soft-deleted records
 * - /proc - Process table (read-only)
 * - /system - System introspection (read-only)
 * - /* (fallback) - ModelBackedStorage for /home, /tmp, /etc
 *
 * @param system - Authenticated system context
 * @param options - Optional configuration
 * @returns Configured FS instance
 */
export function createFS(system: System, options?: CreateFSOptions): FS {
    const fs = new FS(system);

    // API mounts
    fs.mount('/api/data', new DataMount(system));
    fs.mount('/api/describe', new DescribeMount(system));
    fs.mount('/api/find', new FindMount(system));
    fs.mount('/api/trashed', new TrashedMount(system));

    // Process table (read-only)
    fs.mount('/proc', new ProcMount(system.tenant, options?.sessionPid ?? null));

    // System introspection (read-only)
    fs.mount('/system', new SystemMount(system));

    // Fallback to database-backed storage for /home, /tmp, /etc
    fs.setFallback(new ModelBackedStorage(system));

    return fs;
}
