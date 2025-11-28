import { describe, it, expect, beforeAll } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataMount } from '@src/lib/fs/mounts/data-mount.js';
import { FSError } from '@src/lib/fs/types.js';
import { runTransaction } from '@src/lib/transaction.js';
import { Infrastructure, ROOT_USER_ID } from '@src/lib/infrastructure.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { NamespaceCacheManager } from '@src/lib/namespace-cache.js';
import type { SystemInit } from '@src/lib/system.js';

/**
 * DataMount Unit Tests
 *
 * Tests the DataMount in isolation using a temporary SQLite database.
 * No HTTP layer, no server required - direct mount testing.
 */

describe('DataMount - Unit', () => {
    let tempDir: string;
    let systemInit: SystemInit;

    beforeAll(async () => {
        // Preload observers (required for runTransaction)
        ObserverLoader.preloadObservers();

        // Create temp directory for SQLite database
        tempDir = mkdtempSync(join(tmpdir(), 'monk-test-'));

        // Set SQLITE_DATA_DIR for this test
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            // Deploy a tenant schema to the temp database
            const tenantName = 'test_mount';
            const schemaName = `ns_tenant_${tenantName}`;

            // Manually create directory (provisionTenantDatabase is private)
            const dbDir = join(tempDir, 'monk');
            mkdirSync(dbDir, { recursive: true });

            // Deploy schema with root user
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

            // Seed test data using direct SQL (bypass observers for unit test)
            await runTransaction(systemInit, async (system) => {
                const adapter = system.adapter!;

                // Register test model in models table
                await adapter.query(`
                    INSERT INTO "models" (id, model_name, status, created_at, updated_at)
                    VALUES ('test-model-id', 'products', 'active', datetime('now'), datetime('now'))
                `);

                // Register fields for the model
                await adapter.query(`
                    INSERT INTO "fields" (id, model_name, field_name, type, required, created_at, updated_at)
                    VALUES
                        ('field-1', 'products', 'name', 'text', 1, datetime('now'), datetime('now')),
                        ('field-2', 'products', 'price', 'numeric', 0, datetime('now'), datetime('now'))
                `);

                // Create the products table (DDL)
                await adapter.query(`
                    CREATE TABLE IF NOT EXISTS "products" (
                        "id" TEXT PRIMARY KEY NOT NULL,
                        "access_read" TEXT DEFAULT '[]',
                        "access_edit" TEXT DEFAULT '[]',
                        "access_full" TEXT DEFAULT '[]',
                        "access_deny" TEXT DEFAULT '[]',
                        "created_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        "updated_at" TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        "trashed_at" TEXT,
                        "deleted_at" TEXT,
                        "name" TEXT,
                        "price" REAL
                    )
                `);

                // Seed test records
                await adapter.query(`
                    INSERT INTO "products" (id, name, price, created_at, updated_at)
                    VALUES
                        ('prod-001', 'Widget', 9.99, datetime('now'), datetime('now')),
                        ('prod-002', 'Gadget', 19.99, datetime('now'), datetime('now'))
                `);
            });

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
     * Helper to run mount operations within a transaction
     */
    async function withMount<T>(fn: (mount: DataMount) => Promise<T>): Promise<T> {
        // Ensure SQLITE_DATA_DIR is set for this operation
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            return await runTransaction(systemInit, async (system) => {
                const mount = new DataMount(system);
                return fn(mount);
            });
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    }

    describe('stat', () => {
        it('should return directory for root', async () => {
            const entry = await withMount(m => m.stat('/'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('data');
            expect(entry.mode).toBe(0o755);
        });

        it('should return directory for existing model', async () => {
            const entry = await withMount(m => m.stat('/products'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('products');
        });

        it('should return file for existing record', async () => {
            const entry = await withMount(m => m.stat('/products/prod-001'));
            expect(entry.type).toBe('file');
            expect(entry.name).toBe('prod-001');
            expect(entry.size).toBeGreaterThan(0);
            expect(entry.mode).toBe(0o644);
        });

        it('should throw ENOENT for non-existent model', async () => {
            try {
                await withMount(m => m.stat('/nonexistent'));
                expect(true).toBe(false); // Should not reach
            } catch (err) {
                expect(err).toBeInstanceOf(FSError);
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOENT for non-existent record', async () => {
            try {
                await withMount(m => m.stat('/products/not-found'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw ENOENT for too-deep path', async () => {
            try {
                await withMount(m => m.stat('/products/prod-001/extra/path'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });

    describe('readdir', () => {
        it('should list all models at root', async () => {
            const entries = await withMount(m => m.readdir('/'));
            const names = entries.map(e => e.name);

            expect(names).toContain('products');
            // System models should also be listed
            expect(names).toContain('models');
            expect(names).toContain('fields');
            expect(names).toContain('users');
        });

        it('should list records in model directory', async () => {
            const entries = await withMount(m => m.readdir('/products'));

            expect(entries.length).toBe(2);
            const names = entries.map(e => e.name);
            expect(names).toContain('prod-001');
            expect(names).toContain('prod-002');

            // All entries should be files
            for (const entry of entries) {
                expect(entry.type).toBe('file');
            }
        });

        it('should throw ENOTDIR for record path', async () => {
            try {
                await withMount(m => m.readdir('/products/prod-001'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOTDIR');
            }
        });

        it('should throw ENOENT for non-existent model', async () => {
            try {
                await withMount(m => m.readdir('/nonexistent'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });

    describe('read', () => {
        it('should return JSON for record', async () => {
            const content = await withMount(m => m.read('/products/prod-001'));
            const data = JSON.parse(content as string);

            expect(data.id).toBe('prod-001');
            expect(data.name).toBe('Widget');
            expect(data.price).toBe(9.99);
        });

        it('should throw EISDIR for root', async () => {
            try {
                await withMount(m => m.read('/'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });

        it('should throw EISDIR for model directory', async () => {
            try {
                await withMount(m => m.read('/products'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });

        it('should throw ENOENT for non-existent record', async () => {
            try {
                await withMount(m => m.read('/products/not-found'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });

    describe('write', () => {
        it('should create new record', async () => {
            await withMount(m => m.write(
                '/products/prod-new',
                JSON.stringify({ name: 'New Product', price: 5.99 })
            ));

            // Verify creation
            const content = await withMount(m => m.read('/products/prod-new'));
            const data = JSON.parse(content as string);
            expect(data.id).toBe('prod-new');
            expect(data.name).toBe('New Product');
        });

        it('should update existing record', async () => {
            await withMount(m => m.write(
                '/products/prod-002',
                JSON.stringify({ name: 'Updated Gadget', price: 29.99 })
            ));

            // Verify update
            const content = await withMount(m => m.read('/products/prod-002'));
            const data = JSON.parse(content as string);
            expect(data.name).toBe('Updated Gadget');
            expect(data.price).toBe(29.99);
        });

        it('should throw EISDIR for model path', async () => {
            try {
                await withMount(m => m.write('/products', '{}'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });
    });

    describe('unlink', () => {
        it('should delete record', async () => {
            // Create a record to delete
            await withMount(m => m.write(
                '/products/to-delete',
                JSON.stringify({ name: 'Delete Me' })
            ));

            // Delete it
            await withMount(m => m.unlink('/products/to-delete'));

            // Verify deletion
            try {
                await withMount(m => m.stat('/products/to-delete'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });

        it('should throw EISDIR for root', async () => {
            try {
                await withMount(m => m.unlink('/'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });

        it('should throw EISDIR for model directory', async () => {
            try {
                await withMount(m => m.unlink('/products'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('EISDIR');
            }
        });

        it('should throw ENOENT for non-existent record', async () => {
            try {
                await withMount(m => m.unlink('/products/not-found'));
                expect(true).toBe(false);
            } catch (err) {
                expect((err as FSError).code).toBe('ENOENT');
            }
        });
    });

    describe('path parsing edge cases', () => {
        it('should handle trailing slashes', async () => {
            const entry = await withMount(m => m.stat('/products/'));
            expect(entry.type).toBe('directory');
            expect(entry.name).toBe('products');
        });

        it('should handle multiple slashes', async () => {
            const entry = await withMount(m => m.stat('//products//prod-001'));
            expect(entry.type).toBe('file');
        });

        it('should handle empty segments', async () => {
            const entries = await withMount(m => m.readdir('/products/'));
            expect(entries.length).toBeGreaterThanOrEqual(2);
        });
    });
});
