import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalMount } from '@src/lib/fs/mounts/local-mount.js';
import { FSError } from '@src/lib/fs/types.js';

/**
 * LocalMount Tests
 *
 * Tests the host filesystem mount in isolation using a temporary directory.
 */

describe('LocalMount', () => {
    let tempDir: string;
    let mount: LocalMount;

    beforeAll(() => {
        // Create temp directory for tests
        tempDir = mkdtempSync(join(tmpdir(), 'monk-local-mount-test-'));

        // Create test file structure
        writeFileSync(join(tempDir, 'test.txt'), 'Hello World');
        writeFileSync(join(tempDir, 'data.json'), '{"key": "value"}');
        mkdirSync(join(tempDir, 'subdir'));
        writeFileSync(join(tempDir, 'subdir', 'nested.txt'), 'Nested content');
        mkdirSync(join(tempDir, 'empty-dir'));

        // Create symlink
        symlinkSync(join(tempDir, 'test.txt'), join(tempDir, 'link-to-test'));

        // Create mount
        mount = new LocalMount(tempDir);
    });

    afterAll(() => {
        // Cleanup temp directory
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe('stat', () => {
        it('should stat a file', async () => {
            const entry = await mount.stat('/test.txt');
            expect(entry.name).toBe('test.txt');
            expect(entry.type).toBe('file');
            expect(entry.size).toBe(11); // "Hello World"
        });

        it('should stat a directory', async () => {
            const entry = await mount.stat('/subdir');
            expect(entry.name).toBe('subdir');
            expect(entry.type).toBe('directory');
        });

        it('should stat root directory', async () => {
            const entry = await mount.stat('/');
            expect(entry.type).toBe('directory');
        });

        it('should throw ENOENT for non-existent path', async () => {
            try {
                await mount.stat('/nonexistent');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });

    describe('readdir', () => {
        it('should list root directory', async () => {
            const entries = await mount.readdir('/');
            const names = entries.map(e => e.name);

            expect(names).toContain('test.txt');
            expect(names).toContain('data.json');
            expect(names).toContain('subdir');
            expect(names).toContain('empty-dir');
        });

        it('should list subdirectory', async () => {
            const entries = await mount.readdir('/subdir');
            const names = entries.map(e => e.name);

            expect(names).toContain('nested.txt');
        });

        it('should return empty array for empty directory', async () => {
            const entries = await mount.readdir('/empty-dir');
            expect(entries.length).toBe(0);
        });

        it('should throw ENOENT for non-existent directory', async () => {
            try {
                await mount.readdir('/nonexistent');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOTDIR for file', async () => {
            try {
                await mount.readdir('/test.txt');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTDIR');
            }
        });
    });

    describe('read', () => {
        it('should read file content', async () => {
            const content = await mount.read('/test.txt');
            expect(content.toString()).toBe('Hello World');
        });

        it('should read nested file', async () => {
            const content = await mount.read('/subdir/nested.txt');
            expect(content.toString()).toBe('Nested content');
        });

        it('should read JSON file', async () => {
            const content = await mount.read('/data.json');
            const data = JSON.parse(content.toString());
            expect(data.key).toBe('value');
        });

        it('should throw ENOENT for non-existent file', async () => {
            try {
                await mount.read('/nonexistent');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw EISDIR for directory', async () => {
            try {
                await mount.read('/subdir');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('write', () => {
        it('should create new file', async () => {
            await mount.write('/new-file.txt', 'New content');

            const content = await mount.read('/new-file.txt');
            expect(content.toString()).toBe('New content');
        });

        it('should overwrite existing file', async () => {
            await mount.write('/overwrite.txt', 'Original');
            await mount.write('/overwrite.txt', 'Updated');

            const content = await mount.read('/overwrite.txt');
            expect(content.toString()).toBe('Updated');
        });

        it('should write binary content', async () => {
            const binary = Buffer.from([0x00, 0x01, 0x02, 0xff]);
            await mount.write('/binary.bin', binary);

            const content = await mount.read('/binary.bin');
            expect(Buffer.isBuffer(content)).toBe(true);
            expect(content).toEqual(binary);
        });
    });

    describe('mkdir', () => {
        it('should create directory', async () => {
            await mount.mkdir('/new-dir');

            const entry = await mount.stat('/new-dir');
            expect(entry.type).toBe('directory');
        });

        it('should throw EEXIST for existing path', async () => {
            await mount.mkdir('/existing-dir');

            try {
                await mount.mkdir('/existing-dir');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EEXIST');
            }
        });
    });

    describe('unlink', () => {
        it('should delete file', async () => {
            await mount.write('/to-delete.txt', 'delete me');
            await mount.unlink('/to-delete.txt');

            try {
                await mount.stat('/to-delete.txt');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw EISDIR for directory', async () => {
            try {
                await mount.unlink('/subdir');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('rmdir', () => {
        it('should delete empty directory', async () => {
            await mount.mkdir('/dir-to-remove');
            await mount.rmdir('/dir-to-remove');

            try {
                await mount.stat('/dir-to-remove');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOTEMPTY for non-empty directory', async () => {
            await mount.mkdir('/non-empty');
            await mount.write('/non-empty/file.txt', 'content');

            try {
                await mount.rmdir('/non-empty');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTEMPTY');
            }
        });
    });

    describe('rename', () => {
        it('should rename file', async () => {
            await mount.write('/old-name.txt', 'content');
            await mount.rename('/old-name.txt', '/new-name.txt');

            const content = await mount.read('/new-name.txt');
            expect(content.toString()).toBe('content');

            try {
                await mount.stat('/old-name.txt');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should move file to different directory', async () => {
            await mount.mkdir('/move-dest');
            await mount.write('/to-move.txt', 'moving');
            await mount.rename('/to-move.txt', '/move-dest/moved.txt');

            const content = await mount.read('/move-dest/moved.txt');
            expect(content.toString()).toBe('moving');
        });
    });

    describe('path traversal protection', () => {
        it('should block ../ traversal', async () => {
            try {
                await mount.read('/../../../etc/passwd');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EACCES');
            }
        });

        it('should block encoded traversal', async () => {
            try {
                await mount.read('/subdir/../../etc/passwd');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EACCES');
            }
        });
    });

    describe('read-only mode', () => {
        let readOnlyMount: LocalMount;

        beforeAll(() => {
            readOnlyMount = new LocalMount(tempDir, { writable: false });
        });

        it('should allow read operations', async () => {
            const content = await readOnlyMount.read('/test.txt');
            expect(content.toString()).toBe('Hello World');
        });

        it('should block write operations', async () => {
            try {
                await readOnlyMount.write('/blocked.txt', 'content');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EROFS');
            }
        });

        it('should block mkdir operations', async () => {
            try {
                await readOnlyMount.mkdir('/blocked-dir');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EROFS');
            }
        });

        it('should block unlink operations', async () => {
            try {
                await readOnlyMount.unlink('/test.txt');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EROFS');
            }
        });
    });

    describe('getRealPath', () => {
        it('should return real path for virtual path', () => {
            const realPath = mount.getRealPath('/test.txt');
            expect(realPath).toBe(join(tempDir, 'test.txt'));
        });

        it('should return real path for nested path', () => {
            const realPath = mount.getRealPath('/subdir/nested.txt');
            expect(realPath).toBe(join(tempDir, 'subdir', 'nested.txt'));
        });
    });

    describe('getUsage', () => {
        it('should return file size for a file', async () => {
            const usage = await mount.getUsage('/test.txt');
            expect(usage).toBe(11); // "Hello World"
        });

        it('should return 0 for empty directory', async () => {
            const usage = await mount.getUsage('/empty-dir');
            expect(usage).toBe(0);
        });

        it('should return sum of file sizes for directory', async () => {
            const usage = await mount.getUsage('/subdir');
            expect(usage).toBe(14); // "Nested content"
        });

        it('should return sum of all files for root', async () => {
            // test.txt (11) + data.json (16) + subdir/nested.txt (14) = 41
            // Plus any files created by other tests
            const usage = await mount.getUsage('/');
            expect(usage).toBeGreaterThanOrEqual(41);
        });

        it('should throw ENOENT for non-existent path', async () => {
            try {
                await mount.getUsage('/nonexistent');
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });
});
