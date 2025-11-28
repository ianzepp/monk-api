/**
 * VFS HTTP Routes
 *
 * Minimal HTTP interface to the Virtual Filesystem.
 * Uses only JWT + context middleware (no body parsing, format detection, or response transformation).
 *
 * Routes:
 * - GET /vfs/*    → read (file) or readdir (directory), with ?stat for metadata only
 * - PUT /vfs/*    → write
 * - DELETE /vfs/* → unlink
 */

import type { Context } from 'hono';
import type { System } from '@src/lib/system.js';
import { VFS, VFSError } from '@src/lib/vfs/index.js';
import { SystemMount } from '@src/lib/vfs/mounts/system-mount.js';
import { DescribeMount } from '@src/lib/vfs/mounts/describe-mount.js';
import { DataMount } from '@src/lib/vfs/mounts/data-mount.js';
import { FindMount } from '@src/lib/vfs/mounts/find-mount.js';
import { TrashedMount } from '@src/lib/vfs/mounts/trashed-mount.js';

/**
 * Create VFS instance with all mounts configured
 */
function createVFS(system: System): VFS {
    const vfs = new VFS(system);

    // Mount API endpoints
    vfs.mount('/system', new SystemMount(system));
    vfs.mount('/api/describe', new DescribeMount(system));
    vfs.mount('/api/data', new DataMount(system));
    vfs.mount('/api/find', new FindMount(system));
    vfs.mount('/api/trashed', new TrashedMount(system));

    return vfs;
}

/**
 * Extract VFS path from request URL
 * /vfs/api/data/users → /api/data/users
 */
function extractPath(c: Context): string {
    const url = new URL(c.req.url);
    const fullPath = url.pathname;
    // Remove /vfs prefix
    return fullPath.replace(/^\/vfs/, '') || '/';
}

/**
 * Map VFSError to HTTP status code
 */
function errorToStatus(err: VFSError): number {
    switch (err.code) {
        case 'ENOENT':
            return 404;
        case 'EEXIST':
            return 409;
        case 'EISDIR':
        case 'ENOTDIR':
        case 'EINVAL':
            return 400;
        case 'EACCES':
            return 403;
        case 'EROFS':
            return 405;
        case 'ENOTEMPTY':
            return 409;
        default:
            return 500;
    }
}

/**
 * GET /vfs/* - Read file or list directory
 *
 * Query params:
 * - ?stat=true - Return metadata only (like HEAD but as JSON)
 */
export async function VfsGet(c: Context) {
    const system = c.get('system') as System;
    const vfs = createVFS(system);
    const path = extractPath(c);
    const statOnly = c.req.query('stat') === 'true';

    try {
        const entry = await vfs.stat(path);

        // If stat-only mode, return metadata as JSON
        if (statOnly) {
            return c.json({
                name: entry.name,
                type: entry.type,
                size: entry.size,
                mode: entry.mode.toString(8),
                mtime: entry.mtime?.toISOString(),
                ctime: entry.ctime?.toISOString(),
            });
        }

        if (entry.type === 'directory') {
            // List directory
            const entries = await vfs.readdir(path);
            return c.json({
                type: 'directory',
                path,
                entries: entries.map(e => ({
                    name: e.name,
                    type: e.type,
                    size: e.size,
                    mode: e.mode.toString(8),
                    mtime: e.mtime?.toISOString(),
                    ctime: e.ctime?.toISOString(),
                })),
            });
        }

        // Read file
        const content = await vfs.read(path);

        // Detect content type and return
        if (typeof content === 'string') {
            // Check if it's JSON
            if (content.startsWith('{') || content.startsWith('[')) {
                c.header('Content-Type', 'application/json');
            } else if (content.includes(': ') || content.startsWith('---')) {
                c.header('Content-Type', 'text/yaml');
            } else {
                c.header('Content-Type', 'text/plain');
            }
            return c.body(content);
        }

        // Binary content - convert Buffer to ArrayBuffer for Hono
        c.header('Content-Type', 'application/octet-stream');
        return c.body(new Uint8Array(content));
    } catch (err) {
        if (err instanceof VFSError) {
            return c.json({ error: err.code, path: err.path, message: err.message }, errorToStatus(err) as any);
        }
        throw err;
    }
}

/**
 * PUT /vfs/* - Write file
 */
export async function VfsPut(c: Context) {
    const system = c.get('system') as System;
    const vfs = createVFS(system);
    const path = extractPath(c);

    try {
        const content = await c.req.text();
        await vfs.write(path, content);
        return c.json({ success: true, path });
    } catch (err) {
        if (err instanceof VFSError) {
            return c.json({ error: err.code, path: err.path, message: err.message }, errorToStatus(err) as any);
        }
        throw err;
    }
}

/**
 * DELETE /vfs/* - Delete file
 */
export async function VfsDelete(c: Context) {
    const system = c.get('system') as System;
    const vfs = createVFS(system);
    const path = extractPath(c);

    try {
        await vfs.unlink(path);
        return c.json({ success: true, path });
    } catch (err) {
        if (err instanceof VFSError) {
            return c.json({ error: err.code, path: err.path, message: err.message }, errorToStatus(err) as any);
        }
        throw err;
    }
}
