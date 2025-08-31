/**
 * Test Tenant Management for Vitest
 *
 * Creates fresh tenants using TenantManager and provides TypeScript-based
 * testing utilities without external CLI dependencies
 */

import { randomBytes } from 'crypto';
import { MonkEnv } from '../../src/lib/monk-env.js';
import { TenantService, type TenantInfo } from '../../src/lib/services/tenant.js';
import { System } from '../../src/lib/system.js';
import { Database } from '../../src/lib/database.js';
import { Metabase } from '../../src/lib/metabase.js';
import { DatabaseConnection } from '../../src/lib/database-connection.js';
import { Client } from 'pg';

// Set up global logger for test helpers
import { logger } from '../../src/lib/logger.js';
global.logger = logger;

export interface TestTenantManager {
    tenant: TenantInfo | null;
    cleanup(): Promise<void>;
}

export interface TestContext {
    tenant: TenantInfo;
    system: System;
    database: Database;
    metabase: Metabase;
    tenantService: typeof TenantService;
}

/**
 * Create a fresh test tenant with unique name
 */
export async function createTestTenant(): Promise<TestTenantManager> {
    // Load monk configuration before any database operations
    MonkEnv.load();

    // Debug database configuration
    logger.info(`🔍 DATABASE_URL: ${process.env.DATABASE_URL}`);
    logger.info(`🔍 DB_USER: ${process.env.DB_USER}`);
    logger.info(`🔍 DB_HOST: ${process.env.DB_HOST}`);

    // Generate unique tenant name with timestamp
    const timestamp = Date.now();
    const randomId = randomBytes(4).toString('hex');
    const tenantName = `test-${timestamp}-${randomId}`;

    logger.info(`🔧 Creating test tenant: ${tenantName}`);

    try {
        // Create tenant using TenantService
        const tenant = await TenantService.createTenant(tenantName, 'localhost', false);

        logger.info(`✅ Test tenant created: ${tenantName}`);
        logger.info(`📊 Database: ${tenant.database}`);

        return {
            tenant,
            async cleanup() {
                await cleanupTestTenant(tenant);
            },
        };
    } catch (error) {
        logger.fail(`❌ Failed to create test tenant: ${tenantName}`);
        logger.fail(String(error));
        throw new Error(`Test tenant creation failed: ${error}`);
    }
}

/**
 * Clean up test tenant and database
 */
async function cleanupTestTenant(tenant: TenantInfo): Promise<void> {
    if (!tenant) return;

    logger.info(`🧹 Cleaning up test tenant: ${tenant.name}`);

    try {
        // Delete tenant using TenantService
        await TenantService.deleteTenant(tenant.name, true);

        logger.info(`✅ Test tenant cleaned up: ${tenant.name}`);
    } catch (error) {
        logger.warn(`⚠️  Failed to cleanup test tenant ${tenant.name}:`, error);
        // Don't throw error in cleanup - just warn
    }
}

/**
 * Create a test context for the tenant
 */
export async function createTestContext(tenant: TenantInfo, username: string = 'root'): Promise<TestContext> {
    logger.info(`🔧 Creating test context for ${tenant.name}`);

    // Use TenantService to generate JWT token for the user
    const loginResult = await TenantService.login(tenant.name, username);

    if (!loginResult || !loginResult.token) {
        throw new Error(`Failed to authenticate user ${username} in tenant ${tenant.name}`);
    }

    // Decode the JWT token to get the payload
    const jwtPayload = await TenantService.verifyToken(loginResult.token);

    // Create mock Hono context with proper database setup
    const mockContext = {
        env: {
            JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/',
        },
        req: {
            header: (name: string) => {
                if (name === 'x-request-id') {
                    return `test-${Date.now()}`;
                }
                return undefined;
            },
        },
        contextData: new Map(),
        get: function (key: string) {
            if (key === 'jwtPayload') {
                return jwtPayload;
            }
            return this.contextData.get(key);
        },
        set: function (key: string, value: any) {
            this.contextData.set(key, value);
        },
    };

    // Set up database context using DatabaseConnection (simulates JWT middleware)
    DatabaseConnection.setDatabaseForRequest(mockContext as any, jwtPayload.database);

    const system = new System(mockContext as any);
    const database = system.database;
    const metabase = system.metabase;

    logger.info(`✅ Test context created for ${tenant.name}`);

    return {
        tenant,
        system,
        database,
        metabase,
        tenantService: TenantService,
    };
}

/**
 * Create additional user in test tenant using direct database connection
 */
export async function createTestUser(tenant: TenantInfo, username: string, access: string = 'read'): Promise<void> {
    logger.info(`👤 Creating test user: ${username} (access: ${access})`);

    // Use DatabaseConnection for consistent connection management
    const client = DatabaseConnection.createClient(tenant.database);

    try {
        await client.connect();

        await client.query('INSERT INTO users (tenant_name, name, access) VALUES ($1, $2, $3)', [tenant.name, username, access]);

        logger.info(`✅ Test user created: ${username}`);
    } catch (error) {
        logger.fail(`❌ Failed to create test user: ${username}`);
        throw error;
    } finally {
        await client.end();
    }
}

/**
 * Test database connectivity using TypeScript Database class
 */
export async function testDatabaseConnectivity(database: Database): Promise<boolean> {
    logger.info(`🔍 Testing database connectivity`);

    try {
        // Try to query the schema table (should always exist)
        const result = await database.selectAny('schemas');
        logger.info(`✅ Database connectivity test passed`);
        return true;
    } catch (error) {
        logger.fail(`❌ Database connectivity test failed:`, error);
        return false;
    }
}

/**
 * Test metabase connectivity using TypeScript Metabase class
 */
export async function testMetabaseConnectivity(metabase: Metabase): Promise<boolean> {
    logger.info(`🔍 Testing metabase connectivity`);

    try {
        // Try to get the self-reference schema (should always exist)
        const schemaYaml = await metabase.selectOne('schemas');
        logger.info(`✅ Metabase connectivity test passed (found schema definition)`);
        return true;
    } catch (error) {
        logger.fail(`❌ Metabase connectivity test failed:`, error);
        return false;
    }
}
