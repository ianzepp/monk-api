/**
 * Infrastructure Database Management
 *
 * Manages the core infrastructure (tenants registry) and tenant provisioning.
 * Supports both PostgreSQL and SQLite backends.
 *
 * Architecture:
 *   PostgreSQL: monk database, public schema (infra), ns_tenant_* schemas (tenants)
 *   SQLite: .data/monk/public.db (infra), .data/monk/ns_tenant_*.db (tenants)
 *
 * Usage:
 *   await Infrastructure.initialize();  // At startup
 *   const tenant = await Infrastructure.getTenant('acme');
 *   const result = await Infrastructure.createTenant({ name: 'newco' });
 */

import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import type { DatabaseAdapter, DatabaseType } from './database/adapter.js';

import INFRA_SCHEMA_POSTGRESQL from './sql/monk.pg.sql' with { type: 'text' };
import INFRA_SCHEMA_SQLITE from './sql/monk.sqlite.sql' with { type: 'text' };
import TENANT_SCHEMA_POSTGRESQL from './sql/tenant.pg.sql' with { type: 'text' };
import TENANT_SCHEMA_SQLITE from './sql/tenant.sqlite.sql' with { type: 'text' };
import { randomUUID } from 'crypto';

/**
 * Well-known UUID for root user in every tenant.
 * Using zero UUID is safe because each tenant has isolated database/schema.
 * Exported for use in tests and other modules that need to reference root user.
 */
export const ROOT_USER_ID = '00000000-0000-0000-0000-000000000000';

const MAX_TENANT_CREATE_ATTEMPTS = 4;

// SQLite seed with static values only - no user input interpolation
// Root user customization happens via parameterized UPDATE after seed
const TENANT_SEED_SQLITE = `
-- Register core models
INSERT OR IGNORE INTO "models" (id, model_name, status, sudo, description) VALUES
    ('${randomUUID()}', 'models', 'system', 1, NULL),
    ('${randomUUID()}', 'fields', 'system', 1, NULL),
    ('${randomUUID()}', 'users', 'system', 1, NULL),
    ('${randomUUID()}', 'filters', 'system', 0, NULL),
    ('${randomUUID()}', 'credentials', 'system', 1, 'User authentication credentials'),
    ('${randomUUID()}', 'tracked', 'system', 1, 'Change tracking and audit trail'),
    ('${randomUUID()}', 'fs', 'system', 1, 'Filesystem nodes');

-- Fields for models
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, default_value, description) VALUES
    ('${randomUUID()}', 'models', 'model_name', 'text', 1, NULL, 'Unique name for the model'),
    ('${randomUUID()}', 'models', 'status', 'text', 0, 'active', 'Model status'),
    ('${randomUUID()}', 'models', 'description', 'text', 0, NULL, 'Human-readable description'),
    ('${randomUUID()}', 'models', 'sudo', 'boolean', 0, NULL, 'Whether model modifications require sudo'),
    ('${randomUUID()}', 'models', 'frozen', 'boolean', 0, NULL, 'Whether data changes are prevented'),
    ('${randomUUID()}', 'models', 'immutable', 'boolean', 0, NULL, 'Whether records are write-once'),
    ('${randomUUID()}', 'models', 'external', 'boolean', 0, NULL, 'Whether model is managed externally');

-- Fields for fields
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'fields', 'model_name', 'text', 1, 'Name of the model'),
    ('${randomUUID()}', 'fields', 'field_name', 'text', 1, 'Name of the field'),
    ('${randomUUID()}', 'fields', 'type', 'text', 1, 'Data type'),
    ('${randomUUID()}', 'fields', 'required', 'boolean', 0, 'Whether required'),
    ('${randomUUID()}', 'fields', 'default_value', 'text', 0, 'Default value'),
    ('${randomUUID()}', 'fields', 'description', 'text', 0, 'Description'),
    ('${randomUUID()}', 'fields', 'relationship_type', 'text', 0, 'Relationship type'),
    ('${randomUUID()}', 'fields', 'related_model', 'text', 0, 'Related model'),
    ('${randomUUID()}', 'fields', 'related_field', 'text', 0, 'Related field'),
    ('${randomUUID()}', 'fields', 'relationship_name', 'text', 0, 'Relationship name'),
    ('${randomUUID()}', 'fields', 'cascade_delete', 'boolean', 0, 'Cascade delete'),
    ('${randomUUID()}', 'fields', 'required_relationship', 'boolean', 0, 'Required relationship'),
    ('${randomUUID()}', 'fields', 'minimum', 'numeric', 0, 'Minimum value'),
    ('${randomUUID()}', 'fields', 'maximum', 'numeric', 0, 'Maximum value'),
    ('${randomUUID()}', 'fields', 'pattern', 'text', 0, 'Regex pattern'),
    ('${randomUUID()}', 'fields', 'enum_values', 'text[]', 0, 'Enum values'),
    ('${randomUUID()}', 'fields', 'is_array', 'boolean', 0, 'Is array'),
    ('${randomUUID()}', 'fields', 'immutable', 'boolean', 0, 'Immutable'),
    ('${randomUUID()}', 'fields', 'sudo', 'boolean', 0, 'Requires sudo'),
    ('${randomUUID()}', 'fields', 'unique', 'boolean', 0, 'Must be unique'),
    ('${randomUUID()}', 'fields', 'index', 'boolean', 0, 'Create index'),
    ('${randomUUID()}', 'fields', 'tracked', 'boolean', 0, 'Track changes'),
    ('${randomUUID()}', 'fields', 'searchable', 'boolean', 0, 'Full-text search'),
    ('${randomUUID()}', 'fields', 'transform', 'text', 0, 'Auto-transform');

-- Fields for users
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'users', 'name', 'text', 1, 'User display name'),
    ('${randomUUID()}', 'users', 'auth', 'text', 1, 'Authentication identifier'),
    ('${randomUUID()}', 'users', 'access', 'text', 1, 'User access level');

-- Fields for filters
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'filters', 'name', 'text', 1, 'Filter name'),
    ('${randomUUID()}', 'filters', 'model_name', 'text', 1, 'Target model'),
    ('${randomUUID()}', 'filters', 'description', 'text', 0, 'Description'),
    ('${randomUUID()}', 'filters', 'select', 'jsonb', 0, 'Fields to return'),
    ('${randomUUID()}', 'filters', 'where', 'jsonb', 0, 'Filter conditions'),
    ('${randomUUID()}', 'filters', 'order', 'jsonb', 0, 'Sort order'),
    ('${randomUUID()}', 'filters', 'limit', 'integer', 0, 'Max records'),
    ('${randomUUID()}', 'filters', 'offset', 'integer', 0, 'Records to skip');

-- Fields for credentials
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'credentials', 'user_id', 'uuid', 1, 'Reference to the user'),
    ('${randomUUID()}', 'credentials', 'type', 'text', 1, 'Credential type: password, api_key'),
    ('${randomUUID()}', 'credentials', 'identifier', 'text', 0, 'Public identifier (API key prefix)'),
    ('${randomUUID()}', 'credentials', 'secret', 'text', 1, 'Hashed secret value'),
    ('${randomUUID()}', 'credentials', 'algorithm', 'text', 0, 'Hashing algorithm used'),
    ('${randomUUID()}', 'credentials', 'permissions', 'text', 0, 'JSON permissions for API keys'),
    ('${randomUUID()}', 'credentials', 'name', 'text', 0, 'Friendly name for the credential'),
    ('${randomUUID()}', 'credentials', 'expires_at', 'timestamp', 0, 'Expiration timestamp'),
    ('${randomUUID()}', 'credentials', 'last_used_at', 'timestamp', 0, 'Last usage timestamp');

-- Fields for tracked
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'tracked', 'change_id', 'bigserial', 1, 'Auto-incrementing change identifier'),
    ('${randomUUID()}', 'tracked', 'model_name', 'text', 1, 'Model where the change occurred'),
    ('${randomUUID()}', 'tracked', 'record_id', 'uuid', 1, 'ID of the changed record'),
    ('${randomUUID()}', 'tracked', 'operation', 'text', 1, 'Operation type: create, update, delete'),
    ('${randomUUID()}', 'tracked', 'changes', 'jsonb', 1, 'Field-level changes with old/new values'),
    ('${randomUUID()}', 'tracked', 'created_by', 'uuid', 0, 'ID of the user who made the change'),
    ('${randomUUID()}', 'tracked', 'request_id', 'text', 0, 'Request correlation ID'),
    ('${randomUUID()}', 'tracked', 'metadata', 'jsonb', 0, 'Additional context');

-- Fields for fs
INSERT OR IGNORE INTO "fields" (id, model_name, field_name, type, required, description) VALUES
    ('${randomUUID()}', 'fs', 'parent_id', 'uuid', 0, 'Parent directory'),
    ('${randomUUID()}', 'fs', 'name', 'text', 1, 'File or directory name'),
    ('${randomUUID()}', 'fs', 'path', 'text', 1, 'Full absolute path'),
    ('${randomUUID()}', 'fs', 'node_type', 'text', 1, 'Node type: file, directory, symlink'),
    ('${randomUUID()}', 'fs', 'content', 'binary', 0, 'File content'),
    ('${randomUUID()}', 'fs', 'target', 'text', 0, 'Symlink target path'),
    ('${randomUUID()}', 'fs', 'mode', 'integer', 0, 'Unix permission bits'),
    ('${randomUUID()}', 'fs', 'size', 'integer', 0, 'Content size in bytes'),
    ('${randomUUID()}', 'fs', 'owner_id', 'uuid', 0, 'Owner user ID');

-- Root user with well-known ID (customized via parameterized UPDATE if needed)
INSERT OR IGNORE INTO "users" (id, name, auth, access) VALUES
    ('${ROOT_USER_ID}', 'Root User', 'root', 'root');
`;

export interface InfraConfig {
    dbType: DatabaseType;
    database: string;
    schema: string;
}

let cachedConfig: InfraConfig | null = null;

/**
 * Parse DATABASE_URL and determine infrastructure configuration.
 */
export function parseInfraConfig(): InfraConfig {
    if (cachedConfig) {
        return cachedConfig;
    }

    const databaseUrl = process.env.DATABASE_URL || '';
    if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
        const url = new URL(databaseUrl);
        const database = url.pathname.slice(1) || 'monk';
        cachedConfig = { dbType: 'postgresql', database, schema: 'public' };
    } else {
        const database = databaseUrl.startsWith('sqlite:') ? databaseUrl.slice(7) || 'monk' : 'monk';
        cachedConfig = { dbType: 'sqlite', database, schema: 'public' };
    }
    return cachedConfig;
}

export function resetInfraConfigForTests(): void {
    cachedConfig = null;
}

export interface TenantRecord {
    id: string;
    name: string;
    db_type: DatabaseType;
    database: string;
    schema: string;
    owner_id: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface UserRecord {
    id: string;
    name: string;
    auth: string;
    access: string;
}

export interface CreateTenantResult {
    tenant: TenantRecord;
    user: UserRecord;
}

export class Infrastructure {
    private static infraAdapter: DatabaseAdapter | null = null;

    static async resetForTests(): Promise<void> {
        if (this.infraAdapter?.isConnected()) {
            await this.infraAdapter.disconnect();
        }
        this.infraAdapter = null;
        resetInfraConfigForTests();
    }

    static async getAdapter(): Promise<DatabaseAdapter> {
        if (this.infraAdapter) {
            return this.infraAdapter;
        }

        const config = parseInfraConfig();
        const { createAdapterFrom } = await import('./database/index.js');
        if (config.dbType === 'sqlite') {
            const dataDir = process.env.SQLITE_DATA_DIR || '.data';
            const dbDir = join(dataDir, config.database);
            if (!existsSync(dbDir)) {
                mkdirSync(dbDir, { recursive: true });
            }
        }
        this.infraAdapter = createAdapterFrom(config.dbType, config.database, config.schema);
        return this.infraAdapter;
    }

    static async initialize(): Promise<void> {
        const config = parseInfraConfig();
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            const schema = config.dbType === 'sqlite' ? INFRA_SCHEMA_SQLITE : INFRA_SCHEMA_POSTGRESQL;
            if (config.dbType === 'sqlite') {
                const db = adapter.getRawConnection() as { exec: (sql: string) => void };
                db.exec(schema);
            } else {
                await adapter.query(schema);
            }
        } finally {
            await adapter.disconnect();
        }
    }

    static async isInitialized(): Promise<boolean> {
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            const config = parseInfraConfig();
            const sql = config.dbType === 'sqlite'
                ? `SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'`
                : `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants'`;
            const result = await adapter.query<{ name?: string; table_name?: string }>(sql);
            return result.rows.length > 0;
        } catch {
            return false;
        } finally {
            await adapter.disconnect();
        }
    }

    static async getTenant(tenantName: string): Promise<TenantRecord | null> {
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            const result = await adapter.query<TenantRecord>(
                `SELECT id, name, db_type, database, schema, owner_id, is_active, created_at, updated_at
                 FROM tenants
                 WHERE name = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL`,
                [tenantName]
            );
            if (result.rows.length === 0) {
                return null;
            }
            const row = result.rows[0];
            return { ...row, is_active: Boolean(row.is_active) };
        } finally {
            await adapter.disconnect();
        }
    }

    static async getTenantById(tenantId: string): Promise<TenantRecord | null> {
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            const result = await adapter.query<TenantRecord>(
                `SELECT id, name, db_type, database, schema, owner_id, is_active, created_at, updated_at
                 FROM tenants
                 WHERE id = $1 AND is_active = true AND trashed_at IS NULL AND deleted_at IS NULL`,
                [tenantId]
            );
            if (result.rows.length === 0) {
                return null;
            }
            const row = result.rows[0];
            return { ...row, is_active: Boolean(row.is_active) };
        } finally {
            await adapter.disconnect();
        }
    }

    static async createTenant(options: {
        name: string;
        db_type?: DatabaseType;
        owner_username?: string;
        description?: string;
    }): Promise<CreateTenantResult> {
        const config = parseInfraConfig();
        const dbType = options.db_type || config.dbType;
        const ownerUsername = options.owner_username || 'root';
        const tenantName = options.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (!tenantName || tenantName.length < 2) {
            throw new Error('Tenant name must be at least 2 characters');
        }

        const params = {
            dbType,
            tenantName,
            ownerUsername,
            ownerUserId: ownerUsername === 'root' ? ROOT_USER_ID : randomUUID(),
            schemaName: `ns_tenant_${tenantName}`,
            database: config.database,
            description: options.description || null,
        };

        let attempt = 0;
        let lastError: unknown;
        while (attempt < (dbType === 'sqlite' ? MAX_TENANT_CREATE_ATTEMPTS : 1)) {
            attempt += 1;
            try {
                return await this.createTenantTransactional(params);
            } catch (error) {
                lastError = error;
                if (this.shouldRetryTenantCreate(error, dbType)) {
                    await new Promise(resolve => setTimeout(resolve, 40 * attempt));
                    continue;
                }
                throw error;
            }
        }

        throw lastError ?? new Error('Unable to create tenant');
    }

    private static shouldRetryTenantCreate(error: unknown, dbType: DatabaseType): boolean {
        if (dbType !== 'sqlite' || !error) return false;
        const message = String((error as Error).message ?? error).toLowerCase();
        const code = String((error as { code?: string }).code ?? '').toLowerCase();
        return code === 'sqlite_busy'
            || code === 'sqlite_locked'
            || message.includes('database is locked')
            || message.includes('database is busy');
    }

    private static async createTenantTransactional(params: {
        dbType: DatabaseType;
        tenantName: string;
        ownerUsername: string;
        ownerUserId: string;
        schemaName: string;
        database: string;
        description: string | null;
    }): Promise<CreateTenantResult> {
        const { createAdapterFrom } = await import('./database/index.js');
        const infraAdapter = createAdapterFrom(params.dbType, params.database, 'public');
        const tenantId = randomUUID();
        let registered = false;
        let provisioned = false;

        await infraAdapter.connect();
        try {
            if (params.dbType === 'sqlite') {
                await infraAdapter.query('PRAGMA busy_timeout = 5000');
                await infraAdapter.query('BEGIN IMMEDIATE');
            } else {
                await infraAdapter.beginTransaction();
            }

            const timestamp = new Date().toISOString();
            try {
                await infraAdapter.query(
                    `INSERT INTO tenants (id, name, db_type, database, schema, owner_id, is_active, description, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        tenantId,
                        params.tenantName,
                        params.dbType,
                        params.database,
                        params.schemaName,
                        params.ownerUserId,
                        false,
                        params.description,
                        timestamp,
                        timestamp,
                    ]
                );
                registered = true;
            } catch (error) {
                if (this.isTenantDuplicateError(error)) {
                    throw new Error(`Tenant '${params.tenantName}' already exists`);
                }
                throw error;
            }

            await this.provisionTenantDatabase(params.dbType, params.database, params.schemaName);
            provisioned = true;
            const deployedOwnerUserId = await this.deployTenantSchema(
                params.dbType,
                params.database,
                params.schemaName,
                params.ownerUsername
            );

            await infraAdapter.query(
                `UPDATE tenants
                 SET is_active = true,
                     owner_id = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [deployedOwnerUserId, tenantId]
            );

            if (params.dbType === 'sqlite') {
                await infraAdapter.query('COMMIT');
            } else {
                await infraAdapter.commit();
            }

            return {
                tenant: {
                    id: tenantId,
                    name: params.tenantName,
                    db_type: params.dbType,
                    database: params.database,
                    schema: params.schemaName,
                    owner_id: deployedOwnerUserId,
                    is_active: true,
                    created_at: timestamp,
                    updated_at: new Date().toISOString(),
                },
                user: {
                    id: deployedOwnerUserId,
                    name: params.ownerUsername === 'root' ? 'Root User' : params.ownerUsername,
                    auth: params.ownerUsername,
                    access: 'root',
                },
            };
        } catch (error) {
            if (params.dbType === 'sqlite') {
                try {
                    await infraAdapter.query('ROLLBACK');
                } catch {
                    // best-effort cleanup
                }
            } else {
                try {
                    await infraAdapter.rollback();
                } catch {
                    // best-effort cleanup
                }
            }

            if (provisioned) {
                await this.cleanupTenantProvisioning(params.dbType, params.database, params.schemaName);
            }
            if (registered) {
                try {
                    await infraAdapter.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
                } catch {
                    // best-effort cleanup
                }
            }
            throw error;
        } finally {
            await infraAdapter.disconnect();
        }
    }

    private static isTenantDuplicateError(error: unknown): boolean {
        if (!error) {
            return false;
        }
        const message = String((error as Error).message ?? error).toLowerCase();
        return message.includes('duplicate key value violates unique constraint')
            || message.includes('unique constraint')
            || message.includes('already exists')
            || message.includes('sqlite_constraint')
            || message.includes('unique constraint failed');
    }

    static async deleteTenant(tenantName: string): Promise<boolean> {
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            const timestamp = new Date().toISOString();
            const result = await adapter.query(
                `UPDATE tenants
                 SET deleted_at = $1, is_active = false, updated_at = $1
                 WHERE name = $2 AND deleted_at IS NULL`,
                [timestamp, tenantName]
            );
            return result.rowCount > 0;
        } finally {
            await adapter.disconnect();
        }
    }

    static async listTenants(): Promise<TenantRecord[]> {
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            const result = await adapter.query<TenantRecord>(
                `SELECT id, name, db_type, database, schema, owner_id, is_active, created_at, updated_at
                 FROM tenants
                 WHERE is_active = true AND trashed_at IS NULL AND deleted_at IS NULL
                 ORDER BY created_at DESC`
            );
            return result.rows.map(row => ({ ...row, is_active: Boolean(row.is_active) }));
        } finally {
            await adapter.disconnect();
        }
    }

    static async recordFixtureDeployment(tenantId: string, fixtureName: string): Promise<void> {
        const adapter = await this.getAdapter();
        await adapter.connect();
        try {
            await adapter.query(
                `INSERT INTO tenant_fixtures (tenant_id, fixture_name, deployed_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (tenant_id, fixture_name) DO NOTHING`,
                [tenantId, fixtureName]
            );
        } finally {
            await adapter.disconnect();
        }
    }

    private static async provisionTenantDatabase(
        dbType: DatabaseType,
        database: string,
        schemaName: string
    ): Promise<void> {
        const { createAdapterFrom } = await import('./database/index.js');

        if (dbType === 'sqlite') {
            const dataDir = process.env.SQLITE_DATA_DIR || '.data';
            const dbPath = join(dataDir, database, `${schemaName}.db`);
            const dirPath = dirname(dbPath);
            if (!existsSync(dirPath)) {
                mkdirSync(dirPath, { recursive: true });
            }
            const adapter = createAdapterFrom('sqlite', database, schemaName);
            await adapter.connect();
            await adapter.disconnect();
        } else {
            const adapter = createAdapterFrom('postgresql', database, 'public');
            await adapter.connect();
            try {
                await adapter.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
            } finally {
                await adapter.disconnect();
            }
        }
    }

    static async deployTenantSchema(
        dbType: DatabaseType,
        database: string,
        schemaName: string,
        ownerUsername: string
    ): Promise<string> {
        const { createAdapterFrom } = await import('./database/index.js');
        const adapter = createAdapterFrom(dbType, database, schemaName);
        const ownerUserId = ownerUsername === 'root' ? ROOT_USER_ID : randomUUID();
        await adapter.connect();
        try {
            if (dbType === 'sqlite') {
                const db = adapter.getRawConnection() as { exec: (sql: string) => void };
                await adapter.query(`PRAGMA busy_timeout = 5000`);
                db.exec('BEGIN');
                try {
                    db.exec(TENANT_SCHEMA_SQLITE);
                    db.exec(TENANT_SEED_SQLITE);
                    if (ownerUsername !== 'root') {
                        await adapter.query(
                            `INSERT INTO users (id, name, auth, access) VALUES ($1, $2, $3, 'root')`,
                            [ownerUserId, ownerUsername, ownerUsername]
                        );
                    }
                    const { initializeFS } = await import('./fs/init.js');
                    await initializeFS(adapter, ROOT_USER_ID);
                    db.exec('COMMIT');
                } catch (error) {
                    db.exec('ROLLBACK');
                    throw error;
                }
            } else {
                await adapter.beginTransaction();
                try {
                    await adapter.query(TENANT_SCHEMA_POSTGRESQL);
                    await adapter.query(
                        `INSERT INTO users (id, name, auth, access)
                         VALUES ($1, 'Root User', 'root', 'root')
                         ON CONFLICT (auth) DO NOTHING`,
                        [ROOT_USER_ID]
                    );
                    if (ownerUsername !== 'root') {
                        await adapter.query(
                            `INSERT INTO users (id, name, auth, access)
                             VALUES ($1, $2, $3, 'root')
                             ON CONFLICT (auth) DO NOTHING`,
                            [ownerUserId, ownerUsername, ownerUsername]
                        );
                    }
                    const { initializeFS } = await import('./fs/init.js');
                    await initializeFS(adapter, ROOT_USER_ID);
                    await adapter.commit();
                } catch (error) {
                    await adapter.rollback();
                    throw error;
                }
            }
        } finally {
            await adapter.disconnect();
        }
        return ownerUserId;
    }

    private static async cleanupTenantProvisioning(
        dbType: DatabaseType,
        database: string,
        schemaName: string
    ): Promise<void> {
        if (dbType === 'sqlite') {
            await this.cleanupSqliteTenantDatabase(database, schemaName);
            return;
        }

        const { createAdapterFrom } = await import('./database/index.js');
        const adapter = createAdapterFrom('postgresql', database, 'public');
        await adapter.connect();
        try {
            await adapter.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        } finally {
            await adapter.disconnect();
        }
    }

    private static async cleanupSqliteTenantDatabase(database: string, schemaName: string): Promise<void> {
        const dataDir = process.env.SQLITE_DATA_DIR || '.data';
        const tenantDbPath = join(dataDir, database, `${schemaName}.db`);
        for (const target of [tenantDbPath, `${tenantDbPath}-shm`, `${tenantDbPath}-wal`]) {
            if (existsSync(target)) {
                rmSync(target, { force: true });
            }
        }
    }
}
