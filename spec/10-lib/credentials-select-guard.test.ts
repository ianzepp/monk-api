import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { runTransaction } from '@src/lib/transaction.js';
import { Infrastructure, ROOT_USER_ID } from '@src/lib/infrastructure.js';
import { NamespaceCacheManager } from '@src/lib/namespace-cache.js';
import { HttpError } from '@src/lib/errors/http-error.js';
import type { SystemInit } from '@src/lib/system.js';

describe('credentials model read guard', () => {
    let tempDir: string;
    let systemInit: SystemInit;

    beforeAll(async () => {
        tempDir = mkdtempSync(join(tmpdir(), 'monk-credentials-guard-'));

        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            const tenantName = 'test_credentials_guard';
            const schemaName = `ns_tenant_${tenantName}`;
            const dbDir = join(tempDir, 'monk');
            mkdirSync(dbDir, { recursive: true });

            await Infrastructure.deployTenantSchema('sqlite', 'monk', schemaName, 'root');

            systemInit = {
                userId: ROOT_USER_ID,
                tenant: tenantName,
                dbType: 'sqlite',
                dbName: 'monk',
                nsName: schemaName,
                access: 'root',
                isSudoToken: false,
            };

            await runTransaction(systemInit, async (system) => {
                await system.adapter!.query(
                    `INSERT INTO "credentials"
                        (id, user_id, type, identifier, secret, algorithm, name, created_at, updated_at)
                     VALUES ($1, $2, 'api_key', $3, $4, $5, $6, datetime('now'), datetime('now'))`,
                    [randomUUID(), ROOT_USER_ID, 'mk_test_guard000', 'hashed-secret', 'sha256', 'guard-test-key']
                );
            });

            NamespaceCacheManager.getInstance().clearAll();
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    });

    afterAll(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('rejects generic select access to credentials unless context=system', async () => {
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            await expect(runTransaction(systemInit, async (system) => {
                await system.database.selectAny('credentials');
            })).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'MODEL_NOT_FOUND',
            } satisfies Partial<HttpError>);

            const rows = await runTransaction(systemInit, async (system) => {
                return await system.database.selectAny('credentials', {}, { context: 'system' });
            });

            expect(rows).toHaveLength(1);
            expect(rows[0].identifier).toBe('mk_test_guard000');
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    });

    it('rejects generic stream access to credentials unless context=system', async () => {
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            await expect(runTransaction(systemInit, async (system) => {
                const rows = [];
                for await (const row of system.database.streamAny('credentials')) {
                    rows.push(row);
                }
            })).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'MODEL_NOT_FOUND',
            } satisfies Partial<HttpError>);

            const streamed = await runTransaction(systemInit, async (system) => {
                const rows = [];
                for await (const row of system.database.streamAny('credentials', {}, { context: 'system' })) {
                    rows.push(row);
                }
                return rows;
            });

            expect(streamed).toHaveLength(1);
            expect(streamed[0].identifier).toBe('mk_test_guard000');
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    });

    it('rejects generic count and aggregate access to credentials unless context=system', async () => {
        const originalDataDir = process.env.SQLITE_DATA_DIR;
        process.env.SQLITE_DATA_DIR = tempDir;

        try {
            await expect(runTransaction(systemInit, async (system) => {
                await system.database.count('credentials');
            })).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'MODEL_NOT_FOUND',
            } satisfies Partial<HttpError>);

            await expect(runTransaction(systemInit, async (system) => {
                await system.database.aggregate('credentials', {
                    aggregate: { count: '*' },
                });
            })).rejects.toMatchObject({
                statusCode: 404,
                errorCode: 'MODEL_NOT_FOUND',
            } satisfies Partial<HttpError>);
        } finally {
            if (originalDataDir) {
                process.env.SQLITE_DATA_DIR = originalDataDir;
            }
        }
    });

});
