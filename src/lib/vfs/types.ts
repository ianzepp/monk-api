/**
 * VFS Type Definitions
 *
 * Core interfaces for the Virtual Filesystem abstraction layer.
 * Provides a unified filesystem interface over database-backed storage and API mounts.
 */

/**
 * Filesystem entry metadata
 */
export interface VFSEntry {
    name: string;
    type: 'file' | 'directory' | 'symlink';
    size: number;
    mode: number;
    uid?: string;
    gid?: string;
    atime?: Date;
    mtime?: Date;
    ctime?: Date;
    target?: string;
}

/**
 * VFS error codes following POSIX conventions
 */
export type VFSErrorCode =
    | 'ENOENT'    // No such file or directory
    | 'EEXIST'    // File exists
    | 'EISDIR'    // Is a directory (can't read as file)
    | 'ENOTDIR'   // Not a directory (can't list)
    | 'EACCES'    // Permission denied
    | 'ENOTEMPTY' // Directory not empty
    | 'EROFS'     // Read-only filesystem
    | 'EINVAL';   // Invalid argument

/**
 * VFS-specific error class
 */
export class VFSError extends Error {
    constructor(
        public code: VFSErrorCode,
        public path: string,
        message?: string
    ) {
        super(message || `${code}: ${path}`);
        this.name = 'VFSError';
    }
}

/**
 * Mount interface - implemented by each filesystem backend
 *
 * All paths passed to mount methods are relative to the mount point.
 * For example, if mounted at "/api/data", a request for "/api/data/users/123.json"
 * will call the mount with path "/users/123.json".
 */
export interface Mount {
    /**
     * Get metadata for a file or directory
     */
    stat(path: string): Promise<VFSEntry>;

    /**
     * List directory contents
     */
    readdir(path: string): Promise<VFSEntry[]>;

    /**
     * Read file contents
     */
    read(path: string): Promise<string | Buffer>;

    /**
     * Write file contents (optional - omit for read-only mounts)
     */
    write?(path: string, content: string | Buffer): Promise<void>;

    /**
     * Append to file (optional)
     */
    append?(path: string, content: string | Buffer): Promise<void>;

    /**
     * Truncate file to size (optional)
     */
    truncate?(path: string, size: number): Promise<void>;

    /**
     * Delete a file (optional)
     */
    unlink?(path: string): Promise<void>;

    /**
     * Create a directory (optional)
     */
    mkdir?(path: string, mode?: number): Promise<void>;

    /**
     * Remove a directory (optional)
     */
    rmdir?(path: string): Promise<void>;

    /**
     * Rename/move a file or directory (optional)
     */
    rename?(oldPath: string, newPath: string): Promise<void>;

    /**
     * Change permissions (optional)
     */
    chmod?(path: string, mode: number): Promise<void>;

    /**
     * Change ownership (optional)
     */
    chown?(path: string, uid: string, gid?: string): Promise<void>;

    /**
     * Create a symbolic link (optional)
     */
    symlink?(target: string, path: string): Promise<void>;

    /**
     * Read symbolic link target (optional)
     */
    readlink?(path: string): Promise<string>;
}

/**
 * Result of resolving a path to its mount handler
 */
export interface ResolvedPath {
    handler: Mount;
    relativePath: string;
    mountPath: string;
}
