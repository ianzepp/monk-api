import { describe, it, expect, beforeAll } from 'bun:test';
import { mkdtempSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ModelBackedStorage } from '@src/lib/fs/storage.js';
import { FSError } from '@src/lib/fs/types.js';
import { runTransaction } from '@src/lib/transaction.js';
import { Infrastructure, ROOT_USER_ID } from '@src/lib/infrastructure.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { NamespaceCacheManager } from '@src/lib/namespace-cache.js';
import type { SystemInit } from '@src/lib/system.js';

/**
 * ModelBackedStorage Tests
 *
 * Tests the fs-backed storage in isolation using a temporary SQLite database.
 * FS initialization creates /, /home, /home/root, /tmp, /etc, /etc/motd.
 */

describe('ModelBackedStorage', () => {
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
                isSudo: false,
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
    async function withStorage<T>(fn: (storage: ModelBackedStorage) => Promise<T>): Promise<T> {
        // Ensure SQLITE_DATA_DIR is set for this operation
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            return await runTransaction(systemInit, async (system) => {
                const storage = new ModelBackedStorage(system);
                return fn(storage);
            });
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    }

    describe('initialization', () => {
        it('should have root directory', async () => {
            const entry = await withStorage(s => s.stat('/'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('/');
        });

        it('should have /home directory', async () => {
            const entry = await withStorage(s => s.stat('/home'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('home');
        });

        it('should have /home/root directory', async () => {
            const entry = await withStorage(s => s.stat('/home/root'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('root');
            expect(entry.mode).toBe(0o700); // Private
        });

        it('should have /tmp directory with sticky bit', async () => {
            const entry = await withStorage(s => s.stat('/tmp'));
            expect(entry.type).toBe('directory');
            expect(entry.mode).toBe(0o1777);
        });

        it('should have /etc directory', async () => {
            const entry = await withStorage(s => s.stat('/etc'));
            expect(entry.type).toBe('directory');
        });

        it('should have /etc/motd file', async () => {
            const entry = await withStorage(s => s.stat('/etc/motd'));
            expect(entry.type).toBe('file');
            expect(entry.size).toBeGreaterThan(0);
        });

        it('should read /etc/motd content', async () => {
            const content = await withStorage(s => s.read('/etc/motd'));
            expect(content.toString()).toBe('Welcome to Monk API\n');
        });
    });

    describe('readdir', () => {
        it('should list root contents', async () => {
            const entries = await withStorage(s => s.readdir('/'));
            const names = entries.map(e => e.name);

            expect(names).toContain('home');
            expect(names).toContain('tmp');
            expect(names).toContain('etc');
        });

        it('should list /etc contents', async () => {
            const entries = await withStorage(s => s.readdir('/etc'));
            const names = entries.map(e => e.name);

            expect(names).toContain('motd');
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
            try {
                await withStorage(s => s.readdir('/etc/motd'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTDIR');
            }
        });
    });

    describe('write and read', () => {
        it('should create new file', async () => {
            await withStorage(s => s.write('/tmp/test.txt', 'Hello World'));

            const content = await withStorage(s => s.read('/tmp/test.txt'));
            expect(content.toString()).toBe('Hello World');
        });

        it('should update existing file', async () => {
            await withStorage(s => s.write('/tmp/update.txt', 'Original'));
            await withStorage(s => s.write('/tmp/update.txt', 'Updated'));

            const content = await withStorage(s => s.read('/tmp/update.txt'));
            expect(content.toString()).toBe('Updated');
        });

        it('should write binary content', async () => {
            const binary = Buffer.from([0x00, 0x01, 0x02, 0xff]);
            await withStorage(s => s.write('/tmp/binary.bin', binary));

            const content = await withStorage(s => s.read('/tmp/binary.bin'));
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
            try {
                await withStorage(s => s.read('/tmp'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('mkdir', () => {
        it('should create directory', async () => {
            await withStorage(s => s.mkdir('/tmp/newdir'));

            const entry = await withStorage(s => s.stat('/tmp/newdir'));
            expect(entry.type).toBe('directory');
        });

        it('should create directory with custom mode', async () => {
            await withStorage(s => s.mkdir('/tmp/private', 0o700));

            const entry = await withStorage(s => s.stat('/tmp/private'));
            expect(entry.mode).toBe(0o700);
        });

        it('should throw EEXIST for existing path', async () => {
            await withStorage(s => s.mkdir('/tmp/existing'));

            try {
                await withStorage(s => s.mkdir('/tmp/existing'));
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
            await withStorage(s => s.write('/tmp/to-delete.txt', 'delete me'));
            await withStorage(s => s.unlink('/tmp/to-delete.txt'));

            try {
                await withStorage(s => s.stat('/tmp/to-delete.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOENT for non-existent file', async () => {
            try {
                await withStorage(s => s.unlink('/tmp/not-found'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw EISDIR for directory', async () => {
            try {
                await withStorage(s => s.unlink('/tmp'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('rmdir', () => {
        it('should delete empty directory', async () => {
            await withStorage(s => s.mkdir('/tmp/empty-dir'));
            await withStorage(s => s.rmdir('/tmp/empty-dir'));

            try {
                await withStorage(s => s.stat('/tmp/empty-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOTEMPTY for non-empty directory', async () => {
            await withStorage(s => s.mkdir('/tmp/full-dir'));
            await withStorage(s => s.write('/tmp/full-dir/file.txt', 'content'));

            try {
                await withStorage(s => s.rmdir('/tmp/full-dir'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTEMPTY');
            }
        });

        it('should throw ENOTDIR for file', async () => {
            await withStorage(s => s.write('/tmp/a-file.txt', 'content'));

            try {
                await withStorage(s => s.rmdir('/tmp/a-file.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTDIR');
            }
        });
    });

    describe('rename', () => {
        it('should rename file', async () => {
            await withStorage(s => s.write('/tmp/old-name.txt', 'content'));
            await withStorage(s => s.rename('/tmp/old-name.txt', '/tmp/new-name.txt'));

            const content = await withStorage(s => s.read('/tmp/new-name.txt'));
            expect(content.toString()).toBe('content');

            try {
                await withStorage(s => s.stat('/tmp/old-name.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should move file to different directory', async () => {
            await withStorage(s => s.mkdir('/tmp/dest'));
            await withStorage(s => s.write('/tmp/moveme.txt', 'moving'));
            await withStorage(s => s.rename('/tmp/moveme.txt', '/tmp/dest/moved.txt'));

            const content = await withStorage(s => s.read('/tmp/dest/moved.txt'));
            expect(content.toString()).toBe('moving');
        });

        it('should throw EEXIST if target exists', async () => {
            await withStorage(s => s.write('/tmp/src.txt', 'source'));
            await withStorage(s => s.write('/tmp/dst.txt', 'dest'));

            try {
                await withStorage(s => s.rename('/tmp/src.txt', '/tmp/dst.txt'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EEXIST');
            }
        });
    });

    describe('symlink', () => {
        it('should create symlink', async () => {
            await withStorage(s => s.write('/tmp/target.txt', 'target content'));
            await withStorage(s => s.symlink('/tmp/target.txt', '/tmp/link'));

            const entry = await withStorage(s => s.stat('/tmp/link'));
            expect(entry.type).toBe('symlink');
        });

        it('should read symlink target', async () => {
            await withStorage(s => s.write('/tmp/real.txt', 'real'));
            await withStorage(s => s.symlink('/tmp/real.txt', '/tmp/sym'));

            const target = await withStorage(s => s.readlink('/tmp/sym'));
            expect(target).toBe('/tmp/real.txt');
        });

        it('should follow symlink on read', async () => {
            await withStorage(s => s.write('/tmp/actual.txt', 'actual content'));
            await withStorage(s => s.symlink('/tmp/actual.txt', '/tmp/pointer'));

            const content = await withStorage(s => s.read('/tmp/pointer'));
            expect(content.toString()).toBe('actual content');
        });
    });

    describe('chmod', () => {
        it('should change file mode', async () => {
            await withStorage(s => s.write('/tmp/chmod-test.txt', 'test'));
            await withStorage(s => s.chmod('/tmp/chmod-test.txt', 0o600));

            const entry = await withStorage(s => s.stat('/tmp/chmod-test.txt'));
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

            await withStorage(s => s.write('/tmp/chown-test.txt', 'test'));
            await withStorage(s => s.chown('/tmp/chown-test.txt', newOwnerId));

            const entry = await withStorage(s => s.stat('/tmp/chown-test.txt'));
            expect(entry.uid).toBe(newOwnerId);
        });
    });
});
