import { describe, it, expect, beforeAll } from 'bun:test';
import { mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DatabaseMount } from '@src/lib/fs/mounts/database-mount.js';
import { FSError } from '@src/lib/fs/types.js';
import { runTransaction } from '@src/lib/transaction.js';
import { Infrastructure, ROOT_USER_ID } from '@src/lib/infrastructure.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { NamespaceCacheManager } from '@src/lib/namespace-cache.js';
import type { SystemInit } from '@src/lib/system.js';

/**
 * DatabaseMount Tests
 *
 * Tests the database-backed storage in isolation using a temporary SQLite database.
 *
 * Architecture: DatabaseMount is used for user home directories. When mounted at
 * /home/{username}, the mount root (path='/') becomes that user's home directory.
 * FS initialization creates just the user home directory root (name='root', path='/').
 */

describe('DatabaseMount', () => {
    let tempDir: string;
    let systemInit: SystemInit;

    beforeAll(async () => {
        // Preload observers (required for runTransaction)
        ObserverLoader.preloadObservers();

        // Create temp directory for SQLite database
        tempDir = mkdtempSync(join(tmpdir(), 'monk-storage-test-'));

        // Set SQLITE_DATA_DIR for this test
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            // Deploy a tenant schema to the temp database
            const tenantName = 'test_storage';
            const schemaName = `ns_tenant_${tenantName}`;

            // Manually create directory (provisionTenantDatabase is private)
            const dbDir = join(tempDir, 'monk');
            mkdirSync(dbDir, { recursive: true });

            // Deploy schema with root user - this also initializes FS
            await Infrastructure.deployTenantSchema('sqlite', 'monk', schemaName, 'root');

            // Create SystemInit pointing to this database
            systemInit = {
                userId: ROOT_USER_ID,
                tenant: tenantName,
                dbType: 'sqlite',
                dbName: 'monk',
                nsName: schemaName,
                access: 'root',
                isSudoToken: false,
            };

            // Clear namespace cache so subsequent transactions reload fresh
            NamespaceCacheManager.getInstance().clearAll();
        } finally {
            // Restore original SQLITE_DATA_DIR
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    });

    /**
     * Helper to run storage operations within a transaction
     */
    async function withStorage<T>(fn: (storage: DatabaseMount) => Promise<T>): Promise<T> {
        // Ensure SQLITE_DATA_DIR is set for this operation
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            return await runTransaction(systemInit, async (system) => {
                const storage = new DatabaseMount(system);
                return fn(storage);
            });
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    }

    describe('initialization', () => {
        it('should have user home directory root', async () => {
            // The root entry represents the user's home directory
            // name='root' (username), path='/' (mount root)
            const entry = await withStorage(s => s.stat('/'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('root'); // username, not '/'
            expect(entry.mode).toBe(0o700); // Private home directory
        });

        it('should have empty home directory initially', async () => {
            const entries = await withStorage(s => s.readdir('/'));
            expect(entries.length).toBe(0);
        });
    });

    describe('readdir', () => {
        it('should list created directories', async () => {
            await withStorage(s => s.mkdir('/docs'));
            await withStorage(s => s.mkdir('/projects'));

            const entries = await withStorage(s => s.readdir('/'));
            const names = entries.map(e => e.name);

            expect(names).toContain('docs');
            expect(names).toContain('projects');
        });

        it('should list directory contents after creating files', async () => {
            await withStorage(s => s.mkdir('/config'));
            await withStorage(s => s.write('/config/settings.json', '{}'));

            const entries = await withStorage(s => s.readdir('/config'));
            const names = entries.map(e => e.name);

            expect(names).toContain('settings.json');
        });

        it('should throw ENOENT for non-existent directory', async () => {
            try {
                await withStorage(s => s.readdir('/nonexistent'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOTDIR for file', async () => {
            await withStorage(s => s.write('/testfile.txt', 'content'));

            try {
                await withStorage(s => s.readdir('/testfile.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTDIR');
            }
        });
    });

    describe('write and read', () => {
        it('should create new file in home directory', async () => {
            await withStorage(s => s.write('/test.txt', 'Hello World'));

            const content = await withStorage(s => s.read('/test.txt'));
            expect(content.toString()).toBe('Hello World');
        });

        it('should update existing file', async () => {
            await withStorage(s => s.write('/update.txt', 'Original'));
            await withStorage(s => s.write('/update.txt', 'Updated'));

            const content = await withStorage(s => s.read('/update.txt'));
            expect(content.toString()).toBe('Updated');
        });

        it('should write binary content', async () => {
            const binary = Buffer.from([0x00, 0x01, 0x02, 0xff]);
            await withStorage(s => s.write('/binary.bin', binary));

            const content = await withStorage(s => s.read('/binary.bin'));
            expect(Buffer.isBuffer(content)).toBe(true);
            expect(content).toEqual(binary);
        });

        it('should throw ENOENT when parent does not exist', async () => {
            try {
                await withStorage(s => s.write('/nonexistent/file.txt', 'content'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw EISDIR when reading directory', async () => {
            await withStorage(s => s.mkdir('/readable-dir'));

            try {
                await withStorage(s => s.read('/readable-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('mkdir', () => {
        it('should create directory', async () => {
            await withStorage(s => s.mkdir('/newdir'));

            const entry = await withStorage(s => s.stat('/newdir'));
            expect(entry.type).toBe('directory');
        });

        it('should create directory with custom mode', async () => {
            await withStorage(s => s.mkdir('/private-dir', 0o700));

            const entry = await withStorage(s => s.stat('/private-dir'));
            expect(entry.mode).toBe(0o700);
        });

        it('should throw EEXIST for existing path', async () => {
            await withStorage(s => s.mkdir('/existing-dir'));

            try {
                await withStorage(s => s.mkdir('/existing-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EEXIST');
            }
        });

        it('should throw ENOENT when parent does not exist', async () => {
            try {
                await withStorage(s => s.mkdir('/nonexistent/dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });

    describe('unlink', () => {
        it('should delete file', async () => {
            await withStorage(s => s.write('/to-delete.txt', 'delete me'));
            await withStorage(s => s.unlink('/to-delete.txt'));

            try {
                await withStorage(s => s.stat('/to-delete.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOENT for non-existent file', async () => {
            try {
                await withStorage(s => s.unlink('/not-found'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw EISDIR for directory', async () => {
            await withStorage(s => s.mkdir('/unlink-dir'));

            try {
                await withStorage(s => s.unlink('/unlink-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('rmdir', () => {
        it('should delete empty directory', async () => {
            await withStorage(s => s.mkdir('/empty-dir'));
            await withStorage(s => s.rmdir('/empty-dir'));

            try {
                await withStorage(s => s.stat('/empty-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOTEMPTY for non-empty directory', async () => {
            await withStorage(s => s.mkdir('/full-dir'));
            await withStorage(s => s.write('/full-dir/file.txt', 'content'));

            try {
                await withStorage(s => s.rmdir('/full-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTEMPTY');
            }
        });

        it('should throw ENOTDIR for file', async () => {
            await withStorage(s => s.write('/a-file.txt', 'content'));

            try {
                await withStorage(s => s.rmdir('/a-file.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTDIR');
            }
        });
    });

    describe('rename', () => {
        it('should rename file', async () => {
            await withStorage(s => s.write('/old-name.txt', 'content'));
            await withStorage(s => s.rename('/old-name.txt', '/new-name.txt'));

            const content = await withStorage(s => s.read('/new-name.txt'));
            expect(content.toString()).toBe('content');

            try {
                await withStorage(s => s.stat('/old-name.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should move file to different directory', async () => {
            await withStorage(s => s.mkdir('/dest'));
            await withStorage(s => s.write('/moveme.txt', 'moving'));
            await withStorage(s => s.rename('/moveme.txt', '/dest/moved.txt'));

            const content = await withStorage(s => s.read('/dest/moved.txt'));
            expect(content.toString()).toBe('moving');
        });

        it('should throw EEXIST if target exists', async () => {
            await withStorage(s => s.write('/src.txt', 'source'));
            await withStorage(s => s.write('/dst.txt', 'dest'));

            try {
                await withStorage(s => s.rename('/src.txt', '/dst.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EEXIST');
            }
        });
    });

    describe('symlink', () => {
        it('should create symlink', async () => {
            await withStorage(s => s.write('/target.txt', 'target content'));
            await withStorage(s => s.symlink('/target.txt', '/link'));

            const entry = await withStorage(s => s.stat('/link'));
            expect(entry.type).toBe('symlink');
        });

        it('should read symlink target', async () => {
            await withStorage(s => s.write('/real.txt', 'real'));
            await withStorage(s => s.symlink('/real.txt', '/sym'));

            const target = await withStorage(s => s.readlink('/sym'));
            expect(target).toBe('/real.txt');
        });

        it('should follow symlink on read', async () => {
            await withStorage(s => s.write('/actual.txt', 'actual content'));
            await withStorage(s => s.symlink('/actual.txt', '/pointer'));

            const content = await withStorage(s => s.read('/pointer'));
            expect(content.toString()).toBe('actual content');
        });
    });

    describe('chmod', () => {
        it('should change file mode', async () => {
            await withStorage(s => s.write('/chmod-test.txt', 'test'));
            await withStorage(s => s.chmod('/chmod-test.txt', 0o600));

            const entry = await withStorage(s => s.stat('/chmod-test.txt'));
            expect(entry.mode).toBe(0o600);
        });
    });

    describe('chown', () => {
        it('should change file owner', async () => {
            // First create a test user (owner_id has FK to users.id)
            const newOwnerId = '11111111-1111-1111-1111-111111111111';

            // Ensure SQLITE_DATA_DIR is set for the user creation
            const originalDataDir = process.env.SQLITE_DATA_DIR;
            process.env.SQLITE_DATA_DIR = tempDir;
            try {
                await runTransaction(systemInit, async (system) => {
                    await system.database.createOne('users', {
                        id: newOwnerId,
                        name: 'Test User',
                        auth: 'test:chown-test',
                        access: 'read',
                    });
                });
            } finally {
                if (originalDataDir) {
                    process.env.SQLITE_DATA_DIR = originalDataDir;
                }
            }

            await withStorage(s => s.write('/chown-test.txt', 'test'));
            await withStorage(s => s.chown('/chown-test.txt', newOwnerId));

            const entry = await withStorage(s => s.stat('/chown-test.txt'));
            expect(entry.uid).toBe(newOwnerId);
        });
    });

    describe('getUsage', () => {
        it('should return file size for a file', async () => {
            await withStorage(s => s.write('/size-test.txt', 'Hello World')); // 11 bytes

            const usage = await withStorage(s => s.getUsage('/size-test.txt'));
            expect(usage).toBe(11);
        });

        it('should return 0 for empty directory', async () => {
            await withStorage(s => s.mkdir('/empty-usage'));

            const usage = await withStorage(s => s.getUsage('/empty-usage'));
            expect(usage).toBe(0);
        });

        it('should return sum of file sizes for directory', async () => {
            await withStorage(s => s.mkdir('/usage-dir'));
            await withStorage(s => s.write('/usage-dir/a.txt', '12345')); // 5 bytes
            await withStorage(s => s.write('/usage-dir/b.txt', '1234567890')); // 10 bytes

            const usage = await withStorage(s => s.getUsage('/usage-dir'));
            expect(usage).toBe(15);
        });

        it('should include nested directory sizes', async () => {
            await withStorage(s => s.mkdir('/nested-usage'));
            await withStorage(s => s.write('/nested-usage/file.txt', '12345')); // 5 bytes
            await withStorage(s => s.mkdir('/nested-usage/subdir'));
            await withStorage(s => s.write('/nested-usage/subdir/deep.txt', '1234567890')); // 10 bytes

            const usage = await withStorage(s => s.getUsage('/nested-usage'));
            expect(usage).toBe(15);
        });

        it('should throw ENOENT for non-existent path', async () => {
            try {
                await withStorage(s => s.getUsage('/nonexistent'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });
});
