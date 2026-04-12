import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { randomUUID } from 'crypto';

process.env.DATABASE_URL = 'sqlite:monk';
process.env.SQLITE_DATA_DIR = join(process.cwd(), '.tmp', 'monk-api-cs006');

import { Infrastructure } from '../../src/lib/infrastructure.js';

const TEMP_DATA_DIR = process.env.SQLITE_DATA_DIR as string;
const TENANT_PREFIX = 'cs006_tenant';

describe('Infrastructure.createTenant', () => {
    beforeAll(async () => {
        mkdirSync(TEMP_DATA_DIR, { recursive: true });
        rmSync(join(TEMP_DATA_DIR, 'monk', 'public.db'), { force: true });
        await Infrastructure.initialize();
    });

    afterEach(async () => {
        cleanupTenantDatabases(TENANT_PREFIX);
    });

    it('keeps duplicate concurrent creates conflict-safe with no active duplicates', async () => {
        const tenantName = `${TENANT_PREFIX}_${Date.now()}_${randomUUID().slice(0, 6)}`;
        const createA = Infrastructure.createTenant({
            name: tenantName,
            db_type: 'sqlite',
        });
        const createB = Infrastructure.createTenant({
            name: tenantName,
            db_type: 'sqlite',
        });

        const results = await Promise.allSettled([createA, createB]);
        const ok = results.filter((result) => result.status === 'fulfilled');
        const failed = results.filter((result) => result.status === 'rejected');

        expect(ok).toHaveLength(1);
        expect(failed).toHaveLength(1);
        expect(String((failed[0] as PromiseRejectedResult).reason)).toContain('already exists');

        const tenantRecord = await Infrastructure.getTenant(tenantName);
        expect(tenantRecord).not.toBeNull();
        expect(tenantRecord?.is_active).toBe(true);
        expect(tenantRecord?.name).toBe(tenantName);
    }, 15000);

    it('deletes provisioned sqlite state and tenant row when registration fails', async () => {
        const tenantName = `${TENANT_PREFIX}_cleanup_${Date.now()}_${randomUUID().slice(0, 6)}`;
        const schemaName = `ns_tenant_${tenantName}`;
        const tenantDbPath = join(TEMP_DATA_DIR, 'monk', `${schemaName}.db`);

        const original = Infrastructure['deployTenantSchema'];
        Infrastructure['deployTenantSchema'] = (async () => {
            throw new Error('simulated registration failure');
        }) as typeof Infrastructure.deployTenantSchema;

        let failure: unknown;
        try {
            await Infrastructure.createTenant({
                name: tenantName,
                db_type: 'sqlite',
            });
        } catch (error) {
            failure = error;
        } finally {
            Infrastructure['deployTenantSchema'] = original;
        }

        expect(failure).toBeDefined();
        const tenantRecord = await Infrastructure.getTenant(tenantName);
        expect(tenantRecord).toBeNull();
        expect(existsSync(tenantDbPath)).toBe(false);
    }, 15000);
});

function cleanupTenantDatabases(prefix: string): void {
    const publicDbPath = join(TEMP_DATA_DIR, 'monk', 'public.db');
    if (!existsSync(publicDbPath)) {
        return;
    }

    const tenantDbFiles = readdirSync(join(TEMP_DATA_DIR, 'monk'));
    const prefixFiles = tenantDbFiles.filter((name) => name.startsWith(`ns_tenant_${prefix}`));
    for (const tenantDbFile of prefixFiles) {
        const dbFilePath = join(TEMP_DATA_DIR, 'monk', tenantDbFile);
        rmSync(dbFilePath, { force: true });
        rmSync(`${dbFilePath}-shm`, { force: true });
        rmSync(`${dbFilePath}-wal`, { force: true });
    }
}
