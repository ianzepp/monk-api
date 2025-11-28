/**
 * VFS HTTP Routes
 *
 * Minimal HTTP interface to the Virtual Filesystem.
 * Uses only auth + context middleware (no body parsing, format detection, or response transformation).
 *
 * Routes:
 * - GET /vfs/*    → read (file) or readdir (directory), with ?stat for metadata only
 * - PUT /vfs/*    → write
 * - DELETE /vfs/* → unlink
 */

import type { Context } from 'hono';
import type { System, SystemInit } from '@src/lib/system.js';
import { runTransaction } from '@src/lib/transaction.js';
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

/** Result types for VFS operations */
type VfsResult =
    | { type: 'stat'; data: object }
    | { type: 'directory'; data: object }
    | { type: 'file'; content: string; contentType: string }
    | { type: 'binary'; content: Uint8Array }
    | { type: 'success'; path: string }
    | { type: 'error'; error: VFSError };

/**
 * GET /vfs/* - Read file or list directory
 *
 * Query params:
 * - ?stat=true - Return metadata only (like HEAD but as JSON)
 */
export async function VfsGet(c: Context) {
    const systemInit = c.get('systemInit') as SystemInit;
    const path = extractPath(c);
    const statOnly = c.req.query('stat') === 'true';

    try {
        const result = await runTransaction(systemInit, async (system): Promise<VfsResult> => {
            const vfs = createVFS(system);

            try {
                const entry = await vfs.stat(path);

                // If stat-only mode, return metadata
                if (statOnly) {
                    return {
                        type: 'stat',
                        data: {
                            name: entry.name,
                            type: entry.type,
                            size: entry.size,
                            mode: entry.mode.toString(8),
                            mtime: entry.mtime?.toISOString(),
                            ctime: entry.ctime?.toISOString(),
                        },
                    };
                }

                if (entry.type === 'directory') {
                    // List directory
                    const entries = await vfs.readdir(path);
                    return {
                        type: 'directory',
                        data: {
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
                        },
                    };
                }

                // Read file
                const content = await vfs.read(path);

                if (typeof content === 'string') {
                    // Detect content type
                    let contentType = 'text/plain';
                    if (content.startsWith('{') || content.startsWith('[')) {
                        contentType = 'application/json';
                    } else if (content.includes(': ') || content.startsWith('---')) {
                        contentType = 'text/yaml';
                    }
                    return { type: 'file', content, contentType };
                }

                // Binary content
                return { type: 'binary', content: new Uint8Array(content) };

            } catch (err) {
                if (err instanceof VFSError) {
                    return { type: 'error', error: err };
                }
                throw err;
            }
        });

        // Build response based on result type
        switch (result.type) {
            case 'stat':
            case 'directory':
                return c.json(result.data);
            case 'file':
                c.header('Content-Type', result.contentType);
                return c.body(result.content);
            case 'binary':
                c.header('Content-Type', 'application/octet-stream');
                return new Response(result.content, {
                    headers: { 'Content-Type': 'application/octet-stream' },
                });
            case 'error':
                return c.json(
                    { error: result.error.code, path: result.error.path, message: result.error.message },
                    errorToStatus(result.error) as any
                );
        }
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
    const systemInit = c.get('systemInit') as SystemInit;
    const path = extractPath(c);
    const content = await c.req.text();

    try {
        const result = await runTransaction(systemInit, async (system): Promise<VfsResult> => {
            const vfs = createVFS(system);

            try {
                await vfs.write(path, content);
                return { type: 'success', path };
            } catch (err) {
                if (err instanceof VFSError) {
                    return { type: 'error', error: err };
                }
                throw err;
            }
        });

        if (result.type === 'error') {
            return c.json(
                { error: result.error.code, path: result.error.path, message: result.error.message },
                errorToStatus(result.error) as any
            );
        }

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
    const systemInit = c.get('systemInit') as SystemInit;
    const path = extractPath(c);

    try {
        const result = await runTransaction(systemInit, async (system): Promise<VfsResult> => {
            const vfs = createVFS(system);

            try {
                await vfs.unlink(path);
                return { type: 'success', path };
            } catch (err) {
                if (err instanceof VFSError) {
                    return { type: 'error', error: err };
                }
                throw err;
            }
        });

        if (result.type === 'error') {
            return c.json(
                { error: result.error.code, path: result.error.path, message: result.error.message },
                errorToStatus(result.error) as any
            );
        }

        return c.json({ success: true, path });
    } catch (err) {
        if (err instanceof VFSError) {
            return c.json({ error: err.code, path: err.path, message: err.message }, errorToStatus(err) as any);
        }
        throw err;
    }
}
