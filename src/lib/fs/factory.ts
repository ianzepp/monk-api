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
import { FilterMount } from './mounts/filter-mount.js';
import { TrashedMount } from './mounts/trashed-mount.js';
import { ProcMount } from './mounts/proc-mount.js';
import { BinMount } from './mounts/bin-mount.js';
import { MemoryMountRegistry } from './mounts/memory-mount.js';

/**
 * Options for creating a FS instance
 */
export interface CreateFSOptions {
    /** Current session's PID for /proc/self symlink */
    sessionPid?: number | null;
    /** Command names for /bin mount */
    commandNames?: string[];
    /** Username for home directory mount (e.g., "root" -> /home/root) */
    username?: string;
}

/**
 * Create a fully configured FS instance with all standard mounts.
 *
 * Mounts:
 * - /api/data - CRUD operations on model records
 * - /api/describe - Model schemas
 * - /api/find - Saved queries/filters
 * - /api/trashed - Soft-deleted records
 * - /bin - Built-in commands (read-only)
 * - /proc - Process table (read-only)
 * - /system - System introspection (read-only)
 * - /home/{username} - Persistent storage (database-backed)
 * - / (fallback) - In-memory storage (per-tenant, ephemeral)
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
    fs.mount('/api/find', new FilterMount(system));
    fs.mount('/api/trashed', new TrashedMount(system));

    // Command binaries (read-only)
    if (options?.commandNames?.length) {
        fs.mount('/bin', new BinMount(options.commandNames));
    }

    // Process table (read-only)
    fs.mount('/proc', new ProcMount(system.tenant, options?.sessionPid ?? null));

    // System introspection (read-only)
    fs.mount('/system', new SystemMount(system));

    // User home directory (database-backed, persistent)
    if (options?.username) {
        fs.mount(`/home/${options.username}`, new ModelBackedStorage(system));
    }

    // Fallback to in-memory storage (per-tenant, ephemeral)
    fs.setFallback(MemoryMountRegistry.get(system.tenant));

    return fs;
}
