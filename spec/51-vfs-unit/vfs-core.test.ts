import { describe, it, expect, beforeEach } from 'bun:test';
import { VFS, VFSError } from '@src/lib/vfs/index.js';
import type { Mount, VFSEntry } from '@src/lib/vfs/types.js';

/**
 * VFS Core Unit Tests
 *
 * Tests the VFS class in isolation using mock mounts.
 * No database or System context required.
 */

/**
 * Create a mock mount for testing
 */
function createMockMount(options: {
    name: string;
    files?: Map<string, string>;
    dirs?: Set<string>;
    writable?: boolean;
}): Mount {
    const files = options.files || new Map();
    const dirs = options.dirs || new Set(['/']);
    const writable = options.writable ?? false;

    const mount: Mount = {
        async stat(path: string): Promise<VFSEntry> {
            if (dirs.has(path)) {
                return {
                    name: path.split('/').filter(Boolean).pop() || options.name,
                    type: 'directory',
                    size: 0,
                    mode: 0o755,
                };
            }
            if (files.has(path)) {
                const content = files.get(path)!;
                return {
                    name: path.split('/').filter(Boolean).pop() || '',
                    type: 'file',
                    size: content.length,
                    mode: 0o644,
                };
            }
            throw new VFSError('ENOENT', path);
        },

        async readdir(path: string): Promise<VFSEntry[]> {
            if (!dirs.has(path)) {
                throw new VFSError('ENOTDIR', path);
            }

            const entries: VFSEntry[] = [];

            // Find subdirectories
            for (const dir of dirs) {
                if (dir !== path && dir.startsWith(path)) {
                    const relative = dir.slice(path === '/' ? 1 : path.length + 1);
                    const firstPart = relative.split('/')[0];
                    if (firstPart && !relative.includes('/')) {
                        entries.push({
                            name: firstPart,
                            type: 'directory',
                            size: 0,
                            mode: 0o755,
                        });
                    }
                }
            }

            // Find files in this directory
            for (const [filePath, content] of files) {
                const parent = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
                if (parent === path) {
                    entries.push({
                        name: filePath.split('/').pop()!,
                        type: 'file',
                        size: content.length,
                        mode: 0o644,
                    });
                }
            }

            return entries;
        },

        async read(path: string): Promise<string> {
            if (dirs.has(path)) {
                throw new VFSError('EISDIR', path);
            }
            if (!files.has(path)) {
                throw new VFSError('ENOENT', path);
            }
            return files.get(path)!;
        },
    };

    if (writable) {
        mount.write = async (path: string, content: string | Buffer) => {
            files.set(path, content.toString());
        };

        mount.unlink = async (path: string) => {
            if (!files.has(path)) {
                throw new VFSError('ENOENT', path);
            }
            files.delete(path);
        };
    }

    return mount;
}

describe('VFS Core', () => {
    // Create a minimal System mock - VFS only uses it for storage reference
    const mockSystem = {} as any;

    describe('path utilities', () => {
        let vfs: VFS;

        beforeEach(() => {
            vfs = new VFS(mockSystem);
        });

        describe('normalize()', () => {
            it('should normalize root path', () => {
                expect(vfs.normalize('/')).toBe('/');
            });

            it('should remove trailing slashes', () => {
                expect(vfs.normalize('/foo/')).toBe('/foo');
                expect(vfs.normalize('/foo/bar/')).toBe('/foo/bar');
            });

            it('should collapse multiple slashes', () => {
                expect(vfs.normalize('//foo//bar')).toBe('/foo/bar');
                expect(vfs.normalize('/foo///bar')).toBe('/foo/bar');
            });

            it('should resolve . segments', () => {
                expect(vfs.normalize('/foo/./bar')).toBe('/foo/bar');
                expect(vfs.normalize('/./foo/./bar/.')).toBe('/foo/bar');
            });

            it('should resolve .. segments', () => {
                expect(vfs.normalize('/foo/bar/..')).toBe('/foo');
                expect(vfs.normalize('/foo/bar/../baz')).toBe('/foo/baz');
                expect(vfs.normalize('/foo/bar/../../baz')).toBe('/baz');
            });

            it('should not go above root', () => {
                expect(vfs.normalize('/..')).toBe('/');
                expect(vfs.normalize('/foo/../..')).toBe('/');
                expect(vfs.normalize('/../../../foo')).toBe('/foo');
            });

            it('should handle empty path', () => {
                expect(vfs.normalize('')).toBe('/');
            });
        });

        describe('resolve()', () => {
            it('should resolve absolute paths', () => {
                expect(vfs.resolve('/home', '/etc')).toBe('/etc');
                expect(vfs.resolve('/home/user', '/var/log')).toBe('/var/log');
            });

            it('should resolve relative paths', () => {
                expect(vfs.resolve('/home', 'user')).toBe('/home/user');
                expect(vfs.resolve('/home/user', 'docs')).toBe('/home/user/docs');
            });

            it('should resolve multiple segments', () => {
                expect(vfs.resolve('/home', 'user', 'docs')).toBe('/home/user/docs');
                expect(vfs.resolve('/home', 'user', '/etc', 'config')).toBe('/etc/config');
            });

            it('should resolve with . and ..', () => {
                expect(vfs.resolve('/home/user', '../other')).toBe('/home/other');
                expect(vfs.resolve('/home/user', './docs')).toBe('/home/user/docs');
            });
        });

        describe('dirname()', () => {
            it('should return parent directory', () => {
                expect(vfs.dirname('/foo/bar')).toBe('/foo');
                expect(vfs.dirname('/foo/bar/baz')).toBe('/foo/bar');
            });

            it('should return root for top-level paths', () => {
                expect(vfs.dirname('/foo')).toBe('/');
            });

            it('should handle root', () => {
                expect(vfs.dirname('/')).toBe('/');
            });
        });

        describe('basename()', () => {
            it('should return filename', () => {
                expect(vfs.basename('/foo/bar')).toBe('bar');
                expect(vfs.basename('/foo/bar.txt')).toBe('bar.txt');
            });

            it('should return empty for root', () => {
                expect(vfs.basename('/')).toBe('');
            });
        });

        describe('extname()', () => {
            it('should return file extension', () => {
                expect(vfs.extname('/foo/bar.txt')).toBe('.txt');
                expect(vfs.extname('/foo/bar.test.ts')).toBe('.ts');
            });

            it('should return empty for no extension', () => {
                expect(vfs.extname('/foo/bar')).toBe('');
            });

            it('should handle dotfiles', () => {
                expect(vfs.extname('/foo/.hidden')).toBe('');
                expect(vfs.extname('/foo/.hidden.txt')).toBe('.txt');
            });
        });
    });

    describe('mount management', () => {
        let vfs: VFS;

        beforeEach(() => {
            vfs = new VFS(mockSystem);
        });

        it('should mount handlers', () => {
            const mount = createMockMount({ name: 'test' });
            vfs.mount('/test', mount);

            const mounts = vfs.getMounts();
            expect(mounts.size).toBe(1);
            expect(mounts.has('/test')).toBe(true);
        });

        it('should unmount handlers', () => {
            const mount = createMockMount({ name: 'test' });
            vfs.mount('/test', mount);
            vfs.unmount('/test');

            expect(vfs.getMounts().size).toBe(0);
        });

        it('should normalize mount paths', () => {
            const mount = createMockMount({ name: 'test' });
            vfs.mount('/test/', mount);

            const mounts = vfs.getMounts();
            expect(mounts.has('/test')).toBe(true);
        });
    });

    describe('mount resolution', () => {
        let vfs: VFS;
        let systemMount: Mount;
        let dataMount: Mount;

        beforeEach(() => {
            vfs = new VFS(mockSystem);

            systemMount = createMockMount({
                name: 'system',
                files: new Map([['/version', '5.1.0']]),
            });

            dataMount = createMockMount({
                name: 'data',
                dirs: new Set(['/', '/users']),
                files: new Map([['/users/123', '{"id":"123"}']]),
            });

            vfs.mount('/system', systemMount);
            vfs.mount('/api/data', dataMount);
        });

        it('should resolve exact mount path', async () => {
            const entry = await vfs.stat('/system');
            expect(entry.type).toBe('directory');
        });

        it('should resolve paths under mount', async () => {
            const content = await vfs.read('/system/version');
            expect(content).toBe('5.1.0');
        });

        it('should resolve nested mounts by longest prefix', async () => {
            // /api/data should match before /api
            const entry = await vfs.stat('/api/data/users');
            expect(entry.type).toBe('directory');
        });

        it('should throw ENOENT for unmatched paths without fallback', async () => {
            try {
                await vfs.stat('/unknown');
                expect(true).toBe(false); // Should not reach here
            } catch (err) {
                expect(err).toBeInstanceOf(VFSError);
                expect((err as VFSError).code).toBe('ENOENT');
            }
        });

        it('should use fallback for unmatched paths', async () => {
            const fallback = createMockMount({
                name: 'fallback',
                files: new Map([['/home/user/file', 'content']]),
                dirs: new Set(['/', '/home', '/home/user']),
            });
            vfs.setFallback(fallback);

            const content = await vfs.read('/home/user/file');
            expect(content).toBe('content');
        });
    });

    describe('directory listing with mount injection', () => {
        let vfs: VFS;
        let rootMount: Mount;

        beforeEach(() => {
            vfs = new VFS(mockSystem);

            // Root mount that lists nothing by default
            rootMount = createMockMount({
                name: 'root',
                dirs: new Set(['/', '/api']),
            });
            vfs.setFallback(rootMount);

            // Add nested mounts
            vfs.mount('/system', createMockMount({ name: 'system' }));
            vfs.mount('/api/data', createMockMount({ name: 'data' }));
            vfs.mount('/api/describe', createMockMount({ name: 'describe' }));
        });

        it('should inject top-level mount points', async () => {
            const entries = await vfs.readdir('/');
            const names = entries.map(e => e.name);

            expect(names).toContain('system');
            expect(names).toContain('api');
        });

        it('should inject nested mount points', async () => {
            const entries = await vfs.readdir('/api');
            const names = entries.map(e => e.name);

            expect(names).toContain('data');
            expect(names).toContain('describe');
        });

        it('should not duplicate entries', async () => {
            // Add a mount that already lists 'system'
            const customRoot = createMockMount({
                name: 'root',
                dirs: new Set(['/']),
            });
            // Manually add system to the mock's readdir
            const originalReaddir = customRoot.readdir;
            customRoot.readdir = async (path: string) => {
                const entries = await originalReaddir(path);
                if (path === '/') {
                    entries.push({
                        name: 'system',
                        type: 'directory',
                        size: 0,
                        mode: 0o755,
                    });
                }
                return entries;
            };

            vfs.setFallback(customRoot);

            const entries = await vfs.readdir('/');
            const systemEntries = entries.filter(e => e.name === 'system');
            expect(systemEntries.length).toBe(1);
        });
    });

    describe('filesystem operations', () => {
        let vfs: VFS;

        beforeEach(() => {
            vfs = new VFS(mockSystem);
            vfs.mount('/data', createMockMount({
                name: 'data',
                files: new Map([
                    ['/file.txt', 'hello world'],
                    ['/docs/readme.md', '# README'],
                ]),
                dirs: new Set(['/', '/docs']),
                writable: true,
            }));

            vfs.mount('/readonly', createMockMount({
                name: 'readonly',
                files: new Map([['/config', 'value']]),
                writable: false,
            }));
        });

        describe('read operations', () => {
            it('should read files', async () => {
                const content = await vfs.read('/data/file.txt');
                expect(content).toBe('hello world');
            });

            it('should throw EISDIR for directories', async () => {
                try {
                    await vfs.read('/data/docs');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(VFSError);
                    expect((err as VFSError).code).toBe('EISDIR');
                }
            });

            it('should throw ENOENT for missing files', async () => {
                try {
                    await vfs.read('/data/missing.txt');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(VFSError);
                    expect((err as VFSError).code).toBe('ENOENT');
                }
            });
        });

        describe('write operations', () => {
            it('should write files', async () => {
                await vfs.write('/data/new.txt', 'new content');
                const content = await vfs.read('/data/new.txt');
                expect(content).toBe('new content');
            });

            it('should throw EROFS for read-only mounts', async () => {
                try {
                    await vfs.write('/readonly/config', 'new value');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(VFSError);
                    expect((err as VFSError).code).toBe('EROFS');
                }
            });
        });

        describe('unlink operations', () => {
            it('should delete files', async () => {
                await vfs.unlink('/data/file.txt');

                try {
                    await vfs.read('/data/file.txt');
                    expect(true).toBe(false);
                } catch (err) {
                    expect((err as VFSError).code).toBe('ENOENT');
                }
            });

            it('should throw EROFS for read-only mounts', async () => {
                try {
                    await vfs.unlink('/readonly/config');
                    expect(true).toBe(false);
                } catch (err) {
                    expect((err as VFSError).code).toBe('EROFS');
                }
            });
        });

        describe('cross-mount rename', () => {
            it('should reject cross-mount rename', async () => {
                // Add rename support to data mount
                const dataMount = vfs.getMounts().get('/data')!;
                dataMount.rename = async () => {};

                try {
                    await vfs.rename('/data/file.txt', '/readonly/moved.txt');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(VFSError);
                    expect((err as VFSError).code).toBe('EINVAL');
                    expect((err as VFSError).message).toContain('across mount points');
                }
            });
        });
    });

    describe('convenience methods', () => {
        let vfs: VFS;

        beforeEach(() => {
            vfs = new VFS(mockSystem);
            vfs.mount('/data', createMockMount({
                name: 'data',
                files: new Map([['/file.txt', 'content']]),
                dirs: new Set(['/', '/subdir']),
            }));
        });

        describe('exists()', () => {
            it('should return true for existing files', async () => {
                expect(await vfs.exists('/data/file.txt')).toBe(true);
            });

            it('should return true for existing directories', async () => {
                expect(await vfs.exists('/data/subdir')).toBe(true);
            });

            it('should return false for missing paths', async () => {
                expect(await vfs.exists('/data/missing')).toBe(false);
            });
        });

        describe('isFile()', () => {
            it('should return true for files', async () => {
                expect(await vfs.isFile('/data/file.txt')).toBe(true);
            });

            it('should return false for directories', async () => {
                expect(await vfs.isFile('/data/subdir')).toBe(false);
            });

            it('should return false for missing paths', async () => {
                expect(await vfs.isFile('/data/missing')).toBe(false);
            });
        });

        describe('isDirectory()', () => {
            it('should return true for directories', async () => {
                expect(await vfs.isDirectory('/data/subdir')).toBe(true);
            });

            it('should return false for files', async () => {
                expect(await vfs.isDirectory('/data/file.txt')).toBe(false);
            });

            it('should return false for missing paths', async () => {
                expect(await vfs.isDirectory('/data/missing')).toBe(false);
            });
        });
    });
});
