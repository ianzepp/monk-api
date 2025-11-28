import { describe, it, expect, beforeEach } from 'bun:test';
import { FS, FSError } from '@src/lib/fs/index.js';
import type { Mount, FSEntry } from '@src/lib/fs/types.js';

/**
 * FS Core Unit Tests
 *
 * Tests the FS class in isolation using mock mounts.
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
        async stat(path: string): Promise<FSEntry> {
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
            throw new FSError('ENOENT', path);
        },

        async readdir(path: string): Promise<FSEntry[]> {
            if (!dirs.has(path)) {
                throw new FSError('ENOTDIR', path);
            }

            const entries: FSEntry[] = [];

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
                throw new FSError('EISDIR', path);
            }
            if (!files.has(path)) {
                throw new FSError('ENOENT', path);
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
                throw new FSError('ENOENT', path);
            }
            files.delete(path);
        };
    }

    return mount;
}

describe('FS Core', () => {
    // Create a minimal System mock - FS only uses it for storage reference
    const mockSystem = {} as any;

    describe('path utilities', () => {
        let fs: FS;

        beforeEach(() => {
            fs = new FS(mockSystem);
        });

        describe('normalize()', () => {
            it('should normalize root path', () => {
                expect(fs.normalize('/')).toBe('/');
            });

            it('should remove trailing slashes', () => {
                expect(fs.normalize('/foo/')).toBe('/foo');
                expect(fs.normalize('/foo/bar/')).toBe('/foo/bar');
            });

            it('should collapse multiple slashes', () => {
                expect(fs.normalize('//foo//bar')).toBe('/foo/bar');
                expect(fs.normalize('/foo///bar')).toBe('/foo/bar');
            });

            it('should resolve . segments', () => {
                expect(fs.normalize('/foo/./bar')).toBe('/foo/bar');
                expect(fs.normalize('/./foo/./bar/.')).toBe('/foo/bar');
            });

            it('should resolve .. segments', () => {
                expect(fs.normalize('/foo/bar/..')).toBe('/foo');
                expect(fs.normalize('/foo/bar/../baz')).toBe('/foo/baz');
                expect(fs.normalize('/foo/bar/../../baz')).toBe('/baz');
            });

            it('should not go above root', () => {
                expect(fs.normalize('/..')).toBe('/');
                expect(fs.normalize('/foo/../..')).toBe('/');
                expect(fs.normalize('/../../../foo')).toBe('/foo');
            });

            it('should handle empty path', () => {
                expect(fs.normalize('')).toBe('/');
            });
        });

        describe('resolve()', () => {
            it('should resolve absolute paths', () => {
                expect(fs.resolve('/home', '/etc')).toBe('/etc');
                expect(fs.resolve('/home/user', '/var/log')).toBe('/var/log');
            });

            it('should resolve relative paths', () => {
                expect(fs.resolve('/home', 'user')).toBe('/home/user');
                expect(fs.resolve('/home/user', 'docs')).toBe('/home/user/docs');
            });

            it('should resolve multiple segments', () => {
                expect(fs.resolve('/home', 'user', 'docs')).toBe('/home/user/docs');
                expect(fs.resolve('/home', 'user', '/etc', 'config')).toBe('/etc/config');
            });

            it('should resolve with . and ..', () => {
                expect(fs.resolve('/home/user', '../other')).toBe('/home/other');
                expect(fs.resolve('/home/user', './docs')).toBe('/home/user/docs');
            });
        });

        describe('dirname()', () => {
            it('should return parent directory', () => {
                expect(fs.dirname('/foo/bar')).toBe('/foo');
                expect(fs.dirname('/foo/bar/baz')).toBe('/foo/bar');
            });

            it('should return root for top-level paths', () => {
                expect(fs.dirname('/foo')).toBe('/');
            });

            it('should handle root', () => {
                expect(fs.dirname('/')).toBe('/');
            });
        });

        describe('basename()', () => {
            it('should return filename', () => {
                expect(fs.basename('/foo/bar')).toBe('bar');
                expect(fs.basename('/foo/bar.txt')).toBe('bar.txt');
            });

            it('should return empty for root', () => {
                expect(fs.basename('/')).toBe('');
            });
        });

        describe('extname()', () => {
            it('should return file extension', () => {
                expect(fs.extname('/foo/bar.txt')).toBe('.txt');
                expect(fs.extname('/foo/bar.test.ts')).toBe('.ts');
            });

            it('should return empty for no extension', () => {
                expect(fs.extname('/foo/bar')).toBe('');
            });

            it('should handle dotfiles', () => {
                expect(fs.extname('/foo/.hidden')).toBe('');
                expect(fs.extname('/foo/.hidden.txt')).toBe('.txt');
            });
        });
    });

    describe('mount management', () => {
        let fs: FS;

        beforeEach(() => {
            fs = new FS(mockSystem);
        });

        it('should mount handlers', () => {
            const mount = createMockMount({ name: 'test' });
            fs.mount('/test', mount);

            const mounts = fs.getMounts();
            expect(mounts.size).toBe(1);
            expect(mounts.has('/test')).toBe(true);
        });

        it('should unmount handlers', () => {
            const mount = createMockMount({ name: 'test' });
            fs.mount('/test', mount);
            fs.unmount('/test');

            expect(fs.getMounts().size).toBe(0);
        });

        it('should normalize mount paths', () => {
            const mount = createMockMount({ name: 'test' });
            fs.mount('/test/', mount);

            const mounts = fs.getMounts();
            expect(mounts.has('/test')).toBe(true);
        });
    });

    describe('mount resolution', () => {
        let fs: FS;
        let systemMount: Mount;
        let dataMount: Mount;

        beforeEach(() => {
            fs = new FS(mockSystem);

            systemMount = createMockMount({
                name: 'system',
                files: new Map([['/version', '5.1.0']]),
            });

            dataMount = createMockMount({
                name: 'data',
                dirs: new Set(['/', '/users']),
                files: new Map([['/users/123', '{"id":"123"}']]),
            });

            fs.mount('/system', systemMount);
            fs.mount('/api/data', dataMount);
        });

        it('should resolve exact mount path', async () => {
            const entry = await fs.stat('/system');
            expect(entry.type).toBe('directory');
        });

        it('should resolve paths under mount', async () => {
            const content = await fs.read('/system/version');
            expect(content).toBe('5.1.0');
        });

        it('should resolve nested mounts by longest prefix', async () => {
            // /api/data should match before /api
            const entry = await fs.stat('/api/data/users');
            expect(entry.type).toBe('directory');
        });

        it('should throw ENOENT for unmatched paths without fallback', async () => {
            try {
                await fs.stat('/unknown');
                expect(true).toBe(false); // Should not reach here
            } catch (err) {
                expect(err).toBeInstanceOf(FSError);
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should use fallback for unmatched paths', async () => {
            const fallback = createMockMount({
                name: 'fallback',
                files: new Map([['/home/user/file', 'content']]),
                dirs: new Set(['/', '/home', '/home/user']),
            });
            fs.setFallback(fallback);

            const content = await fs.read('/home/user/file');
            expect(content).toBe('content');
        });
    });

    describe('directory listing with mount injection', () => {
        let fs: FS;
        let rootMount: Mount;

        beforeEach(() => {
            fs = new FS(mockSystem);

            // Root mount that lists nothing by default
            rootMount = createMockMount({
                name: 'root',
                dirs: new Set(['/', '/api']),
            });
            fs.setFallback(rootMount);

            // Add nested mounts
            fs.mount('/system', createMockMount({ name: 'system' }));
            fs.mount('/api/data', createMockMount({ name: 'data' }));
            fs.mount('/api/describe', createMockMount({ name: 'describe' }));
        });

        it('should inject top-level mount points', async () => {
            const entries = await fs.readdir('/');
            const names = entries.map(e => e.name);

            expect(names).toContain('system');
            expect(names).toContain('api');
        });

        it('should inject nested mount points', async () => {
            const entries = await fs.readdir('/api');
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

            fs.setFallback(customRoot);

            const entries = await fs.readdir('/');
            const systemEntries = entries.filter(e => e.name === 'system');
            expect(systemEntries.length).toBe(1);
        });
    });

    describe('filesystem operations', () => {
        let fs: FS;

        beforeEach(() => {
            fs = new FS(mockSystem);
            fs.mount('/data', createMockMount({
                name: 'data',
                files: new Map([
                    ['/file.txt', 'hello world'],
                    ['/docs/readme.md', '# README'],
                ]),
                dirs: new Set(['/', '/docs']),
                writable: true,
            }));

            fs.mount('/readonly', createMockMount({
                name: 'readonly',
                files: new Map([['/config', 'value']]),
                writable: false,
            }));
        });

        describe('read operations', () => {
            it('should read files', async () => {
                const content = await fs.read('/data/file.txt');
                expect(content).toBe('hello world');
            });

            it('should throw EISDIR for directories', async () => {
                try {
                    await fs.read('/data/docs');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(FSError);
                    expect((err as FSError).code).toBe('EISDIR');
                }
            });

            it('should throw ENOENT for missing files', async () => {
                try {
                    await fs.read('/data/missing.txt');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(FSError);
                    expect((err as FSError).code).toBe('ENOENT');
                }
            });
        });

        describe('write operations', () => {
            it('should write files', async () => {
                await fs.write('/data/new.txt', 'new content');
                const content = await fs.read('/data/new.txt');
                expect(content).toBe('new content');
            });

            it('should throw EROFS for read-only mounts', async () => {
                try {
                    await fs.write('/readonly/config', 'new value');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(FSError);
                    expect((err as FSError).code).toBe('EROFS');
                }
            });
        });

        describe('unlink operations', () => {
            it('should delete files', async () => {
                await fs.unlink('/data/file.txt');

                try {
                    await fs.read('/data/file.txt');
                    expect(true).toBe(false);
                } catch (err) {
                    expect((err as FSError).code).toBe('ENOENT');
                }
            });

            it('should throw EROFS for read-only mounts', async () => {
                try {
                    await fs.unlink('/readonly/config');
                    expect(true).toBe(false);
                } catch (err) {
                    expect((err as FSError).code).toBe('EROFS');
                }
            });
        });

        describe('cross-mount rename', () => {
            it('should reject cross-mount rename', async () => {
                // Add rename support to data mount
                const dataMount = fs.getMounts().get('/data')!;
                dataMount.rename = async () => {};

                try {
                    await fs.rename('/data/file.txt', '/readonly/moved.txt');
                    expect(true).toBe(false);
                } catch (err) {
                    expect(err).toBeInstanceOf(FSError);
                    expect((err as FSError).code).toBe('EINVAL');
                    expect((err as FSError).message).toContain('across mount points');
                }
            });
        });
    });

    describe('convenience methods', () => {
        let fs: FS;

        beforeEach(() => {
            fs = new FS(mockSystem);
            fs.mount('/data', createMockMount({
                name: 'data',
                files: new Map([['/file.txt', 'content']]),
                dirs: new Set(['/', '/subdir']),
            }));
        });

        describe('exists()', () => {
            it('should return true for existing files', async () => {
                expect(await fs.exists('/data/file.txt')).toBe(true);
            });

            it('should return true for existing directories', async () => {
                expect(await fs.exists('/data/subdir')).toBe(true);
            });

            it('should return false for missing paths', async () => {
                expect(await fs.exists('/data/missing')).toBe(false);
            });
        });

        describe('isFile()', () => {
            it('should return true for files', async () => {
                expect(await fs.isFile('/data/file.txt')).toBe(true);
            });

            it('should return false for directories', async () => {
                expect(await fs.isFile('/data/subdir')).toBe(false);
            });

            it('should return false for missing paths', async () => {
                expect(await fs.isFile('/data/missing')).toBe(false);
            });
        });

        describe('isDirectory()', () => {
            it('should return true for directories', async () => {
                expect(await fs.isDirectory('/data/subdir')).toBe(true);
            });

            it('should return false for files', async () => {
                expect(await fs.isDirectory('/data/file.txt')).toBe(false);
            });

            it('should return false for missing paths', async () => {
                expect(await fs.isDirectory('/data/missing')).toBe(false);
            });
        });
    });
});
