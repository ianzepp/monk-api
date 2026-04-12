/**
 * Local Filesystem Mount
 *
 * Mounts a directory from the host filesystem into the virtual filesystem.
 * Use cases:
 * - Mount plugin/observer directories for dynamic loading
 * - Mount user's local home directory to their virtual /home/{user}
 * - Expose workspace directories for import/export
 * - Bridge real files with virtual filesystem operations
 *
 * Security:
 * - All paths are resolved relative to basePath
 * - Path traversal attacks (../) are blocked
 * - Symlinks pointing outside basePath are rejected
 */

import { readFile, writeFile, readdir, stat, mkdir, unlink, rmdir, rename, symlink, readlink, chmod, lstat, realpath } from 'fs/promises';
import { mkdirSync, realpathSync } from 'fs';
import { join, resolve, basename, sep } from 'path';
import type { Mount, FSEntry } from '../types.js';
import { FSError } from '../types.js';

export interface LocalMountOptions {
    /** Allow write operations (default: true) */
    writable?: boolean;
    /** Follow symlinks (default: true, but validates they stay within basePath) */
    followSymlinks?: boolean;
    /** Create basePath if it doesn't exist (default: false) */
    createIfMissing?: boolean;
}

export class LocalMount implements Mount {
    private readonly basePath: string;
    private readonly basePathWithTrailingSeparator: string;
    private readonly writable: boolean;
    private readonly followSymlinks: boolean;

    constructor(basePath: string, options: LocalMountOptions = {}) {
        const resolvedBasePath = resolve(basePath);
        if (options.createIfMissing) {
            // Ensure base path exists (called at mount time)
            mkdirSync(resolvedBasePath, { recursive: true });
        }

        let canonicalBasePath = resolvedBasePath;
        try {
            canonicalBasePath = realpathSync(resolvedBasePath);
        } catch {
            canonicalBasePath = resolvedBasePath;
        }

        this.basePath = canonicalBasePath;
        this.basePathWithTrailingSeparator = this.basePath.endsWith(sep) ? this.basePath : `${this.basePath}${sep}`;
        this.writable = options.writable ?? true;
        this.followSymlinks = options.followSymlinks ?? true;
    }

    /**
     * Resolve a virtual path to a real filesystem path.
     * Throws FSError if path escapes basePath.
     */
    private resolvePath(virtualPath: string): string {
        // Normalize the virtual path
        const normalized = virtualPath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

        // Join with base path
        const realPath = join(this.basePath, normalized);

        // Resolve to absolute path
        const resolved = resolve(realPath);

        // Security check: ensure resolved path is within basePath
        if (!this.containsRealPath(resolved)) {
            throw new FSError('EACCES', virtualPath, 'Path traversal denied');
        }

        return resolved;
    }

    private async resolveRealPath(virtualPath: string, allowMissingTarget = false): Promise<string> {
        const resolved = this.resolvePath(virtualPath);

        try {
            const canonical = await realpath(resolved);
            if (!this.containsRealPath(canonical)) {
                throw new FSError('EACCES', virtualPath, 'Symlink target outside mount');
            }
            return allowMissingTarget ? resolved : canonical;
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                if (!allowMissingTarget) {
                    throw new FSError('ENOENT', virtualPath);
                }

                const parent = resolve(resolved, '..');
                const canonicalParent = await realpath(parent);
                if (!this.containsRealPath(canonicalParent)) {
                    throw new FSError('EACCES', virtualPath, 'Path traversal denied');
                }

                return resolved;
            }

            if (err instanceof FSError) {
                throw err;
            }

            throw new FSError('EIO', virtualPath, err.message);
        }
    }

    private containsRealPath(realPath: string): boolean {
        const resolved = resolve(realPath);
        return resolved === this.basePath || resolved.startsWith(this.basePathWithTrailingSeparator);
    }

    /**
     * Convert Node.js Stats to FSEntry
     */
    private statsToEntry(name: string, stats: import('fs').Stats, target?: string): FSEntry {
        let type: FSEntry['type'] = 'file';
        if (stats.isDirectory()) type = 'directory';
        else if (stats.isSymbolicLink()) type = 'symlink';

        return {
            name,
            type,
            size: stats.size,
            mode: stats.mode & 0o7777, // Extract permission bits
            mtime: stats.mtime,
            ctime: stats.ctime,
            target,
        };
    }

    async stat(path: string): Promise<FSEntry> {
        const lexicalPath = this.resolvePath(path);

        let realPath: string;
        try {
            realPath = await this.resolveRealPath(path);
        } catch (err: any) {
            if (err instanceof FSError) throw err;
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            throw new FSError('EIO', path, err.message);
        }

        try {
            const stats = await lstat(lexicalPath);
            const target = stats.isSymbolicLink() ? await readlink(lexicalPath) : undefined;
            const entryStats = stats.isSymbolicLink() ? await stat(realPath) : stats;
            const name = path === '/' ? basename(this.basePath) : basename(path);

            return this.statsToEntry(name, entryStats, target);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async readdir(path: string): Promise<FSEntry[]> {
        const realPath = await this.resolveRealPath(path);

        try {
            const entries = await readdir(realPath, { withFileTypes: true });
            const results: FSEntry[] = [];

            for (const entry of entries) {
                const entryPath = join(realPath, entry.name);
                try {
                    const stats = await lstat(entryPath);
                    let target: string | undefined;
                    if (entry.isSymbolicLink()) {
                        target = await readlink(entryPath);
                    }
                    results.push(this.statsToEntry(entry.name, stats, target));
                } catch {
                    // Skip entries we can't stat (permission denied, etc.)
                }
            }

            return results;
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            if (err.code === 'ENOTDIR') {
                throw new FSError('ENOTDIR', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async read(path: string): Promise<Buffer> {
        const lexicalPath = this.resolvePath(path);
        const realPath = await this.resolveRealPath(path);

        try {
            // Check if it's a directory
            const stats = await stat(realPath);
            if (stats.isDirectory()) {
                throw new FSError('EISDIR', path);
            }

            if (!this.followSymlinks) {
                const linkStats = await lstat(lexicalPath);
                if (linkStats.isSymbolicLink()) {
                    throw new FSError('EACCES', path, 'Symlink reads disabled');
                }
            }

            return await readFile(realPath);
        } catch (err: any) {
            if (err instanceof FSError) throw err;
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            if (err.code === 'EISDIR') {
                throw new FSError('EISDIR', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async write(path: string, content: string | Buffer): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', path, 'Mount is read-only');
        }

        const realPath = await this.resolveRealPath(path, true);
        const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

        try {
            await writeFile(realPath, buffer);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path, 'Parent directory does not exist');
            }
            if (err.code === 'EISDIR') {
                throw new FSError('EISDIR', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async mkdir(path: string, mode: number = 0o755): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', path, 'Mount is read-only');
        }

        const realPath = this.resolvePath(path);

        try {
            await mkdir(realPath, { mode });
        } catch (err: any) {
            if (err.code === 'EEXIST') {
                throw new FSError('EEXIST', path);
            }
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path, 'Parent directory does not exist');
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async unlink(path: string): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', path, 'Mount is read-only');
        }

        const realPath = this.resolvePath(path);

        try {
            const stats = await stat(realPath);
            if (stats.isDirectory()) {
                throw new FSError('EISDIR', path);
            }
            await unlink(realPath);
        } catch (err: any) {
            if (err instanceof FSError) throw err;
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async rmdir(path: string): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', path, 'Mount is read-only');
        }

        const realPath = this.resolvePath(path);

        try {
            await rmdir(realPath);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            if (err.code === 'ENOTDIR') {
                throw new FSError('ENOTDIR', path);
            }
            if (err.code === 'ENOTEMPTY') {
                throw new FSError('ENOTEMPTY', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', oldPath, 'Mount is read-only');
        }

        const realOldPath = this.resolvePath(oldPath);
        const realNewPath = this.resolvePath(newPath);

        try {
            await rename(realOldPath, realNewPath);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', oldPath);
            }
            throw new FSError('EIO', oldPath, err.message);
        }
    }

    async symlink(target: string, path: string): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', path, 'Mount is read-only');
        }

        const realPath = this.resolvePath(path);

        // Validate target stays within basePath if it's absolute
        if (target.startsWith('/')) {
            const resolvedTarget = resolve(target);
            if (!this.containsRealPath(resolvedTarget)) {
                throw new FSError('EACCES', path, 'Symlink target must be within mount');
            }
        }

        try {
            await symlink(target, realPath);
        } catch (err: any) {
            if (err.code === 'EEXIST') {
                throw new FSError('EEXIST', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async readlink(path: string): Promise<string> {
        const realPath = this.resolvePath(path);

        try {
            return await readlink(realPath);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            if (err.code === 'EINVAL') {
                throw new FSError('EINVAL', path, 'Not a symlink');
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    async chmod(path: string, mode: number): Promise<void> {
        if (!this.writable) {
            throw new FSError('EROFS', path, 'Mount is read-only');
        }

        const realPath = this.resolvePath(path);

        try {
            await chmod(realPath, mode);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    /**
     * Get disk usage for a path
     *
     * Recursively calculates total size of files in the path.
     * For files: returns the file size.
     * For directories: returns the sum of all descendant file sizes.
     *
     * This method is designed for efficient `du` (disk usage) operations.
     *
     * @param path - Path to calculate usage for
     * @returns Total size in bytes
     */
    async getUsage(path: string): Promise<number> {
        const realPath = this.resolvePath(path);

        try {
            const stats = await stat(realPath);

            if (!stats.isDirectory()) {
                return stats.size;
            }

            // Recursively sum directory contents
            return await this.calculateDirectorySize(realPath);
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                throw new FSError('ENOENT', path);
            }
            throw new FSError('EIO', path, err.message);
        }
    }

    /**
     * Recursively calculate directory size
     */
    private async calculateDirectorySize(dirPath: string): Promise<number> {
        let total = 0;
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = join(dirPath, entry.name);

            // Security check: ensure we stay within basePath
            if (!this.containsRealPath(entryPath)) {
                continue;
            }

            try {
                if (entry.isDirectory()) {
                    total += await this.calculateDirectorySize(entryPath);
                } else if (entry.isFile()) {
                    const stats = await stat(entryPath);
                    total += stats.size;
                }
                // Symlinks are not counted (to avoid double-counting or loops)
            } catch {
                // Skip entries we can't access
            }
        }

        return total;
    }

    /**
     * Get the real filesystem path for a virtual path.
     * Useful for operations that need direct access.
     */
    getRealPath(virtualPath: string): string {
        return this.resolvePath(virtualPath);
    }

}
