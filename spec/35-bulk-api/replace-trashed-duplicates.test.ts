import { describe, beforeAll, it, expect } from 'bun:test';
import { TestHelpers, expectSuccess, type TestTenant } from '../test-helpers.js';
import { TEST_CONFIG } from '../test-config.js';
import { Database as SqliteDatabase } from 'bun:sqlite';

const MODEL_NAME = 'bulk_replace_issues';
const DUPLICATE_ID = '11111111-1111-4e89-9f5f-111111111111';

async function setupModel(tenant: TestTenant): Promise<void> {
    const modelResponse = await tenant.httpClient.post(`/api/describe/${MODEL_NAME}`, {
        model_name: MODEL_NAME,
        status: 'active',
    });
    expectSuccess(modelResponse);

    const fieldResponse = await tenant.httpClient.post(`/api/describe/${MODEL_NAME}/fields`, [
        {
            field_name: 'name',
            type: 'text',
            required: true,
        },
    ]);
    expectSuccess(fieldResponse);
}

function createImportBuffer(): Uint8Array {
    const db = new SqliteDatabase(':memory:');
    try {
        db.exec(`
            CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE "${MODEL_NAME}" (
                id TEXT PRIMARY KEY,
                access_read TEXT,
                access_edit TEXT,
                access_full TEXT,
                access_deny TEXT,
                created_at TEXT,
                updated_at TEXT,
                trashed_at TEXT,
                deleted_at TEXT,
                name TEXT
            );
        `);

        db.run(
            'INSERT INTO _meta (key, value) VALUES (?, ?)',
            [
                'export',
                JSON.stringify({
                    version: '1.0',
                    exported_at: new Date().toISOString(),
                    models: [MODEL_NAME],
                    include: ['data'],
                    record_counts: { [MODEL_NAME]: 1 },
                }),
            ]
        );

        db.run(
            `INSERT INTO "${MODEL_NAME}" (
                id, access_read, access_edit, access_full, access_deny,
                created_at, updated_at, trashed_at, deleted_at, name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                DUPLICATE_ID,
                '[]',
                '[]',
                '[]',
                '[]',
                new Date().toISOString(),
                new Date().toISOString(),
                null,
                null,
                'active-imported',
            ]
        );

        return db.serialize();
    } finally {
        db.close();
    }
}

async function importModelData(
    tenant: TestTenant,
    buffer: Uint8Array,
    strategy: 'replace' | 'upsert' | 'merge' | 'skip'
): Promise<any> {
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: 'application/x-sqlite3' }), 'tenant-export.sqlite');

    const response = await fetch(`${TEST_CONFIG.API_URL}/api/bulk/import?strategy=${strategy}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tenant.httpClient.getAuthToken()}`,
        },
        body: formData,
    });

    if (response.status !== 200) {
        throw new Error(`Import failed with ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    return payload;
}

describe('POST /api/bulk/import replace', () => {
    let target: TestTenant;

    beforeAll(async () => {
        target = await TestHelpers.createTestTenant('bulk-replace-target');

        await setupModel(target);
    });

    it('replace should hard-delete duplicate trashed IDs before creating imported rows', async () => {
        const seededTarget = await target.httpClient.post(`/api/data/${MODEL_NAME}`, [
            {
                id: DUPLICATE_ID,
                name: 'pre-import-trashed',
            },
        ]);
        expectSuccess(seededTarget);

        const trashedTarget = await target.httpClient.delete(`/api/data/${MODEL_NAME}/${DUPLICATE_ID}`);
        expectSuccess(trashedTarget);

        const trashedBeforeImport = await target.httpClient.get(`/api/trashed/${MODEL_NAME}`);
        expectSuccess(trashedBeforeImport);
        expect(trashedBeforeImport.data.some((record: any) => record.id === DUPLICATE_ID)).toBe(true);

        const importResponse = await importModelData(target, createImportBuffer(), 'replace');
        expectSuccess(importResponse);
        expect(importResponse.data.stats.records_created, JSON.stringify(importResponse, null, 2)).toBe(1);

        const activeRows = await target.httpClient.post(`/api/find/${MODEL_NAME}`, {
            where: {
                id: DUPLICATE_ID,
            },
        });
        expectSuccess(activeRows);
        expect(activeRows.data).toHaveLength(1);
        expect(activeRows.data[0].name).toBe('active-imported');

        const includeTrashedRows = await target.httpClient.post(`/api/find/${MODEL_NAME}`, {
            trashed: 'include',
            where: {
                id: DUPLICATE_ID,
            },
        });
        expectSuccess(includeTrashedRows);
        expect(includeTrashedRows.data).toHaveLength(1);
        expect(includeTrashedRows.data[0].trashed_at).toBeNull();

        const trashedAfterImport = await target.httpClient.get(`/api/trashed/${MODEL_NAME}`);
        expectSuccess(trashedAfterImport);
        expect(trashedAfterImport.data).toHaveLength(0);
    });
});
