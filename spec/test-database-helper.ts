import { randomBytes } from 'crypto';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { DatabaseNaming } from '@src/lib/database-naming.js';
import { NamespaceManager } from '@src/lib/namespace-manager.js';
import { FixtureDeployer } from '@src/lib/fixtures/deployer.js';

/**
 * Test Tenant Configuration
 */
export interface TestTenantConfig {
    testName: string;
    template?: string; // Default: "testing"
}

/**
 * Test Tenant Result
 */
export interface TestTenantResult {
    tenantName: string;
    dbName: string;
    nsName: string;
}

/**
 * Test Database Helper
 *
 * Provides utilities for creating and cleaning up test tenants in Vitest tests.
 * Matches the behavior of shell test helpers (spec/test-tenant-helper.sh).
 */
export class TestDatabaseHelper {
    /**
     * Create a test tenant using namespace architecture
     *
     * NEW: Uses namespace-based architecture instead of database cloning
     * - Generates tenant name: test_{testName}_{timestamp}_{random}
     * - Creates namespace in db_test: ns_test_{8-char-hash}
     * - Deploys fixtures to namespace
     * - Registers tenant in monk.tenants table
     *
     * @param config - Test tenant configuration
     * @returns Promise with tenant name, database name, and namespace name
     */
    static async createTestTenant(config: TestTenantConfig): Promise<TestTenantResult> {
        const { testName, template = 'testing' } = config;

        // Generate test tenant name
        const timestamp = Date.now();
        const random = randomBytes(4).toString('hex');
        const tenantName = `test_${testName}_${timestamp}_${random}`;

        // Use db_test database and generate namespace name
        // Use tenant namespace prefix (ns_tenant_) to satisfy tenants table constraint
        const dbName = 'db_test';
        const nsName = DatabaseNaming.generateTenantNsName(tenantName);

        const mainPool = DatabaseConnection.getMainPool();

        try {
            // 1. Create namespace in db_test
            await NamespaceManager.createNamespace(dbName, nsName);

            // 2. Deploy fixtures to namespace
            // System fixture is always deployed first, then the requested template
            const fixtures = template === 'system' ? ['system'] : ['system', template];
            await FixtureDeployer.deployMultiple(fixtures, { dbName, nsName });

            // 3. Register tenant in main database
            // Use a fixed test owner_id (will be cleaned up with tenant)
            const testOwnerId = '00000000-0000-0000-0000-000000000000';
            await mainPool.query(
                `INSERT INTO tenants (name, database, schema, host, is_active, owner_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [tenantName, dbName, nsName, 'localhost', true, testOwnerId]
            );

            return {
                tenantName,
                dbName,
                nsName,
            };
        } catch (error) {
            // Cleanup on failure
            try {
                await NamespaceManager.dropNamespace(dbName, nsName);
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Clean up a test tenant
     *
     * NEW: Namespace-based cleanup
     * - Drops the namespace (schema) and all objects within it
     * - Removes tenant from registry
     *
     * @param tenantName - Tenant name to clean up
     * @param dbName - Database name (e.g., db_test)
     * @param nsName - Namespace name (e.g., ns_test_abc123)
     */
    static async cleanupTestTenant(tenantName: string, dbName: string, nsName: string): Promise<void> {
        const mainPool = DatabaseConnection.getMainPool();

        try {
            // 1. Drop namespace (CASCADE drops all objects within it)
            try {
                await NamespaceManager.dropNamespace(dbName, nsName);
            } catch (error) {
                // Namespace might not exist, that's ok
                console.warn(`Warning: Failed to drop namespace ${dbName}.${nsName}:`, error);
            }

            // 2. Remove tenant from registry
            await mainPool.query('DELETE FROM tenants WHERE name = $1', [tenantName]);
        } catch (error) {
            console.error(`Error cleaning up test tenant ${tenantName}:`, error);
            throw error;
        }
    }

    /**
     * Clean up all test tenants
     *
     * NEW: Namespace-based cleanup
     * Removes all tenants with names starting with "test_"
     */
    static async cleanupAllTestTenants(): Promise<void> {
        const mainPool = DatabaseConnection.getMainPool();

        try {
            // Get all test tenants
            const result = await mainPool.query(
                `SELECT name, database, schema FROM tenants WHERE name LIKE 'test_%'`
            );

            // Clean up each tenant
            for (const row of result.rows) {
                await this.cleanupTestTenant(row.name, row.database, row.schema);
            }
        } catch (error) {
            console.error('Error cleaning up test tenants:', error);
            throw error;
        }
    }

    /**
     * Get authentication token for a test user
     *
     * This matches shell: get_user_token()
     * Makes a request to /auth/login and returns the JWT token
     *
     * @param tenantName - Tenant name
     * @param username - Username (e.g., "full", "root")
     * @param baseUrl - API base URL (default: http://localhost:9001)
     * @returns Promise with JWT token
     */
    static async getAuthToken(
        tenantName: string,
        username: string,
        baseUrl: string = 'http://localhost:9001'
    ): Promise<string> {
        const response = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tenant: tenantName,
                username: username,
            }),
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { success: boolean; data?: { token: string } };

        if (!data.success || !data.data?.token) {
            throw new Error(`Authentication failed: ${JSON.stringify(data)}`);
        }

        return data.data.token;
    }
}
