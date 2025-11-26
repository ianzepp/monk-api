/**
 * Standalone Mode Configuration
 *
 * Enables running Monk API with a single SQLite tenant, no PostgreSQL required.
 *
 * Activated by DATABASE_URL=sqlite:<tenant-name>
 * Example: DATABASE_URL=sqlite:root
 *
 * This mode:
 * - Bypasses the PostgreSQL tenant registry
 * - Auto-creates SQLite database on first startup
 * - Deploys 'system' fixture automatically
 * - Creates root user with root/root credentials
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Standalone mode configuration
 */
export interface StandaloneConfig {
    enabled: boolean;
    tenant: string;
    dbType: 'sqlite';
    dbName: string;
    nsName: string;
}

/**
 * Parsed standalone configuration (null if not in standalone mode)
 */
let standaloneConfig: StandaloneConfig | null = null;
let initialized = false;

/**
 * Parse DATABASE_URL for standalone mode
 *
 * Format: sqlite:<tenant-name>
 * Example: sqlite:root → tenant "root", db "db_main", ns "root"
 */
export function parseStandaloneConfig(): StandaloneConfig | null {
    const databaseUrl = process.env.DATABASE_URL || '';

    if (!databaseUrl.startsWith('sqlite:')) {
        return null;
    }

    // Extract tenant name after sqlite:
    const tenant = databaseUrl.slice(7) || 'root';

    return {
        enabled: true,
        tenant,
        dbType: 'sqlite',
        dbName: 'db_main',
        nsName: tenant, // Use tenant name directly as namespace
    };
}

/**
 * Check if running in standalone mode
 */
export function isStandaloneMode(): boolean {
    if (standaloneConfig === null && !initialized) {
        standaloneConfig = parseStandaloneConfig();
        initialized = true;
    }
    return standaloneConfig !== null;
}

/**
 * Get standalone configuration
 * @throws Error if not in standalone mode
 */
export function getStandaloneConfig(): StandaloneConfig {
    if (!isStandaloneMode() || !standaloneConfig) {
        throw new Error('Not in standalone mode. Check isStandaloneMode() first.');
    }
    return standaloneConfig;
}

/**
 * Get tenant info for standalone mode (used by auth/login)
 */
export function getStandaloneTenant(tenantName: string): {
    name: string;
    db_type: 'sqlite';
    database: string;
    schema: string;
    allowed_ips: null;
} | null {
    if (!isStandaloneMode() || !standaloneConfig) {
        return null;
    }

    // Only return config if tenant name matches
    if (tenantName !== standaloneConfig.tenant) {
        return null;
    }

    return {
        name: standaloneConfig.tenant,
        db_type: 'sqlite',
        database: standaloneConfig.dbName,
        schema: standaloneConfig.nsName,
        allowed_ips: null,
    };
}

/**
 * Initialize standalone SQLite database if it doesn't exist
 *
 * Creates the database directory and deploys system fixture.
 * Called during startup when DATABASE_URL=sqlite:tenant
 */
export async function initializeStandaloneDatabase(): Promise<void> {
    if (!isStandaloneMode() || !standaloneConfig) {
        return;
    }

    const dataDir = process.env.SQLITE_DATA_DIR || '.data';
    const dbDir = join(dataDir, standaloneConfig.dbName);
    const dbPath = join(dbDir, `${standaloneConfig.nsName}.db`);

    console.info('Standalone mode detected', {
        tenant: standaloneConfig.tenant,
        database: dbPath,
    });

    // Preload the correct SQLite adapter for this runtime (Bun vs Node)
    const { preloadSqliteAdapter, createAdapterFrom } = await import('./database/index.js');
    await preloadSqliteAdapter();

    // Check if database already exists
    if (existsSync(dbPath)) {
        console.info('Standalone database exists, skipping initialization');
        return;
    }

    console.info('Initializing standalone database...');

    // Create directory structure
    mkdirSync(dbDir, { recursive: true });

    // Create adapter and connect
    const adapter = createAdapterFrom('sqlite', standaloneConfig.dbName, standaloneConfig.nsName);
    await adapter.connect();

    try {
        // Deploy system fixture
        // We need to run the SQLite deploy script
        const { FixtureDeployer } = await import('./fixtures/deployer.js');

        await FixtureDeployer.deploy('system', {
            dbType: 'sqlite',
            dbName: standaloneConfig.dbName,
            nsName: standaloneConfig.nsName,
        });

        // Verify root user exists (created by system fixture)
        const userCheck = await adapter.query<{ id: string; auth: string }>(
            'SELECT id, auth FROM users WHERE auth = $1',
            ['root']
        );

        if (userCheck.rows.length === 0) {
            // Create root user if not in fixture
            const userId = randomUUID();
            const timestamp = new Date().toISOString();

            await adapter.query(
                `INSERT INTO users (id, name, auth, access, access_read, access_edit, access_full, access_deny, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [userId, 'Root User', 'root', 'root', '[]', '[]', '[]', '[]', timestamp, timestamp]
            );

            console.info('Created root user', { userId });
        } else {
            console.info('Root user exists', { userId: userCheck.rows[0].id });
        }

        console.info('Standalone database initialized successfully');
    } finally {
        await adapter.disconnect();
    }
}

/**
 * Log standalone mode status
 */
export function logStandaloneStatus(): void {
    if (isStandaloneMode() && standaloneConfig) {
        console.info('='.repeat(50));
        console.info('STANDALONE MODE ACTIVE');
        console.info('='.repeat(50));
        console.info(`Tenant: ${standaloneConfig.tenant}`);
        console.info(`Database: ${standaloneConfig.dbName}/${standaloneConfig.nsName}.db`);
        console.info(`Login: POST /auth/login { "tenant": "${standaloneConfig.tenant}", "username": "root" }`);
        console.info('='.repeat(50));
    }
}
