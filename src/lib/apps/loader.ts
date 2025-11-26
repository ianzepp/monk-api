/**
 * App Package Loader
 *
 * Dynamically loads installed @monk-app/* app packages at startup.
 * App packages export a createApp() function that returns a Hono app.
 *
 * App tenants are isolated namespaces with IP restrictions (localhost only)
 * that prevent external login. Apps use long-lived JWT tokens for API access.
 *
 * Package scopes:
 * - @monk/* - core packages (formatters, bindings)
 * - @monk-app/* - app packages (mcp, grids, etc.)
 */

import type { Hono, Context } from 'hono';
import { randomUUID } from 'crypto';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { DatabaseNaming } from '@src/lib/database-naming.js';
import { NamespaceManager } from '@src/lib/namespace-manager.js';
import { FixtureDeployer } from '@src/lib/fixtures/deployer.js';
import { JWTGenerator } from '@src/lib/jwt-generator.js';
import { System } from '@src/lib/system.js';
import { createAdapter } from '@src/lib/database/index.js';
import { createInProcessClient, type InProcessClient } from './in-process-client.js';

// App token expiry: 1 year (in seconds)
const APP_TOKEN_EXPIRY = 365 * 24 * 60 * 60;

/**
 * Context passed to app createApp() function
 */
export interface AppContext {
    /** In-process client for API calls (uses app's JWT token) */
    client: InProcessClient;
    /** App's JWT token for API authentication */
    token: string;
    /** App name (e.g., 'mcp') */
    appName: string;
    /** Full tenant name (e.g., '@monk/mcp') */
    tenantName: string;
    /** Reference to main Hono app for in-process routing */
    honoApp: Hono;
}

export type AppFactory = (context: AppContext) => Hono | Promise<Hono>;

/**
 * Register or retrieve an app tenant.
 *
 * App tenants:
 * - Use namespace prefix 'ns_app_' instead of 'ns_tenant_'
 * - Have allowed_ips restricted to localhost (127.0.0.1, ::1)
 * - Cannot be logged into via /auth/login from external IPs
 *
 * @param appName - App name without @monk/ prefix (e.g., 'mcp')
 * @returns JWT token for the app's root user
 */
export async function registerAppTenant(appName: string): Promise<{
    token: string;
    tenantName: string;
    dbName: string;
    nsName: string;
    userId: string;
}> {
    const tenantName = `@monk/${appName}`;
    const mainPool = DatabaseConnection.getMainPool();

    // Check if tenant already exists
    const existingTenant = await mainPool.query(
        'SELECT id, database, schema FROM tenants WHERE name = $1 AND deleted_at IS NULL',
        [tenantName]
    );

    if (existingTenant.rows.length > 0) {
        // Tenant exists - get user and generate token
        const { database: dbName, schema: nsName } = existingTenant.rows[0];

        // Get root user from tenant namespace
        const userResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            'SELECT id, access, access_read, access_edit, access_full FROM users WHERE auth = $1 AND deleted_at IS NULL',
            ['root']
        );

        if (userResult.rows.length === 0) {
            throw new Error(`App tenant ${tenantName} exists but has no root user`);
        }

        const user = userResult.rows[0];

        // Generate long-lived token
        const token = await JWTGenerator.generateToken({
            id: user.id,
            user_id: user.id,
            tenant: tenantName,
            dbType: 'postgresql',
            dbName,
            nsName,
            access: user.access,
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || [],
        }, APP_TOKEN_EXPIRY);

        console.info(`App tenant exists: ${tenantName}`);

        return { token, tenantName, dbName, nsName, userId: user.id };
    }

    // Create new app tenant
    console.info(`Creating app tenant: ${tenantName}`);

    const dbName = 'db_main';
    const nsName = DatabaseNaming.generateAppNsName(appName);

    // Check namespace doesn't already exist
    if (await NamespaceManager.namespaceExists(dbName, nsName, 'postgresql')) {
        throw new Error(`Namespace ${nsName} already exists but tenant record missing`);
    }

    // Use transaction to ensure namespace + tenant are created atomically
    await mainPool.query('BEGIN');

    try {
        // Create namespace
        await NamespaceManager.createNamespace(dbName, nsName, 'postgresql');

        // Deploy system fixture (minimal schema)
        await FixtureDeployer.deployMultiple(['system'], {
            dbType: 'postgresql',
            dbName,
            nsName,
        });

        // Check if root user already exists (system fixture may create one)
        const existingUser = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            'SELECT id FROM users WHERE auth = $1',
            ['root']
        );

        let userId: string;

        if (existingUser.rows.length > 0) {
            // Use existing root user
            userId = existingUser.rows[0].id;
        } else {
            // Create root user
            userId = randomUUID();
            const timestamp = new Date().toISOString();

            await DatabaseConnection.queryInNamespace(
                dbName,
                nsName,
                `INSERT INTO users (id, name, auth, access, access_read, access_edit, access_full, access_deny, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [userId, `App Root (${appName})`, 'root', 'root', '{}', '{}', '{}', '{}', timestamp, timestamp]
            );
        }

        // Register tenant with IP restrictions
        await mainPool.query(
            `INSERT INTO tenants (name, db_type, database, schema, description, source_template, owner_id, host, is_active, allowed_ips)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                tenantName,
                'postgresql',
                dbName,
                nsName,
                `App tenant for @monk/${appName}`,
                'system',
                userId,
                'localhost',
                true,
                ['127.0.0.1', '::1'], // Localhost only
            ]
        );

        await mainPool.query('COMMIT');

        // Generate long-lived token
        const token = await JWTGenerator.generateToken({
            id: userId,
            user_id: userId,
            tenant: tenantName,
            dbType: 'postgresql',
            dbName,
            nsName,
            access: 'root',
            access_read: [],
            access_edit: [],
            access_full: [],
        }, APP_TOKEN_EXPIRY);

        console.info(`Created app tenant: ${tenantName}`);

        return { token, tenantName, dbName, nsName, userId };

    } catch (error) {
        // Rollback transaction on failure
        await mainPool.query('ROLLBACK');

        // Cleanup namespace (may have been created before transaction started)
        try {
            await NamespaceManager.dropNamespace(dbName, nsName, 'postgresql');
        } catch (cleanupError) {
            console.warn(`Failed to cleanup namespace ${nsName}:`, cleanupError);
        }
        throw error;
    }
}

/**
 * Model definition for app registration.
 * Field definitions match the system fixture's fields table schema.
 */
export interface AppModelDefinition {
    model_name: string;
    description?: string;
    fields: Array<{
        field_name: string;
        type: string;
        required?: boolean;
        default_value?: string;
        description?: string;
    }>;
}

/**
 * Register models for an app in its tenant namespace.
 *
 * Uses System.describe directly to avoid HTTP routing issues during startup.
 * This is idempotent - creates models if they don't exist.
 *
 * @param dbName - Database name
 * @param nsName - Namespace name
 * @param userId - User ID for the operation
 * @param appName - App name for logging
 * @param models - Array of model definitions to register
 */
export async function registerAppModels(
    dbName: string,
    nsName: string,
    userId: string,
    appName: string,
    models: AppModelDefinition[]
): Promise<void> {
    // Create a mock Hono context with the app's JWT claims
    // Includes jwtPayload with root access for sudo checks
    const jwtPayload = { access: 'root', db: dbName, ns: nsName };
    const mockContext = {
        get: (key: string) => {
            switch (key) {
                case 'dbType': return 'postgresql';
                case 'dbName': return dbName;
                case 'nsName': return nsName;
                case 'userId': return userId;
                case 'access': return 'root';
                case 'jwtPayload': return jwtPayload;
                case 'isSudo': return () => true;  // App model registration runs with sudo
                default: return undefined;
            }
        },
        set: () => {},
        req: {
            header: () => undefined,
        },
    } as unknown as Context;

    const system = new System(mockContext);

    // Create adapter and set up transaction (same pattern as api-helpers withTransaction)
    const adapter = createAdapter({ dbType: 'postgresql', db: dbName, ns: nsName });

    try {
        await adapter.connect();
        await adapter.beginTransaction();

        // Set adapter on system for database operations
        system.adapter = adapter;
        system.tx = adapter.getRawConnection() as any;

        // Load namespace cache if needed
        if (system.namespace && !system.namespace.isLoaded()) {
            await system.namespace.loadAll(system);
        }

        // Register each model
        for (const modelDef of models) {
            const { model_name, description, fields } = modelDef;

            // Check if model exists
            const existing = await system.describe.models.selectOne(
                { where: { model_name } },
                { context: 'system' }
            );

            if (!existing) {
                // Create model
                console.info(`Creating model ${model_name} for app ${appName}`);
                await system.describe.models.createOne({
                    model_name,
                    description,
                });

                // Create fields
                for (const field of fields) {
                    await system.describe.fields.createOne({
                        model_name,
                        ...field,
                    });
                }
            } else {
                console.info(`Model ${model_name} already exists for app ${appName}`);
            }
        }

        await adapter.commit();

    } catch (error) {
        await adapter.rollback();
        throw error;
    } finally {
        await adapter.disconnect();
        system.adapter = null;
        system.tx = undefined as any;
    }
}

/**
 * Load an app package and initialize its tenant.
 *
 * @param appName - App name without @monk/ prefix (e.g., 'mcp')
 * @param honoApp - Main Hono app instance for in-process client
 * @returns Initialized Hono app for the package, or null if not installed
 */
export async function loadApp(appName: string, honoApp: Hono): Promise<Hono | null> {
    try {
        // Try to import the package from @monk-app/* scope
        const mod = await import(`@monk-app/${appName}`);

        if (typeof mod.createApp !== 'function') {
            console.warn(`App package @monk-app/${appName} does not export createApp()`);
            return null;
        }

        // Register/retrieve app tenant
        const { token, tenantName, dbName, nsName, userId } = await registerAppTenant(appName);

        // Create a mock context for the in-process client
        // The client will use the app's token for all requests
        const mockContext = {
            req: {
                header: (name: string) => {
                    if (name.toLowerCase() === 'authorization') {
                        return `Bearer ${token}`;
                    }
                    return undefined;
                },
            },
        } as any;

        const client = createInProcessClient(mockContext, honoApp);

        // Build app context
        const appContext: AppContext = {
            client,
            token,
            appName,
            tenantName,
            honoApp,
        };

        // Register app models if declared (before creating the app)
        // Uses System.describe directly to avoid HTTP router locking
        if (Array.isArray(mod.MODELS) && mod.MODELS.length > 0) {
            await registerAppModels(dbName, nsName, userId, appName, mod.MODELS);
        }

        // Call the app's createApp function
        const app = await mod.createApp(appContext);

        return app;

    } catch (error) {
        // Package not installed - skip silently
        if (error instanceof Error && !error.message.includes('Cannot find package')) {
            console.warn(`Failed to load @monk-app/${appName}:`, error.message);
        }
        return null;
    }
}

/**
 * Discover installed @monk-app/* packages by scanning node_modules.
 *
 * @returns Array of app names (without @monk-app/ prefix)
 */
export async function discoverApps(): Promise<string[]> {
    const { readdir } = await import('fs/promises');
    const { join } = await import('path');

    const scopeDir = join(process.cwd(), 'node_modules', '@monk-app');

    try {
        const entries = await readdir(scopeDir, { withFileTypes: true });
        return entries
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name);
    } catch {
        // @monk-app directory doesn't exist - no apps installed
        return [];
    }
}
