import { randomBytes } from 'crypto';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { Infrastructure } from '@src/lib/infrastructure.js';

/**
 * Test Tenant Configuration
 */
export interface TestTenantConfig {
    testName: string;
    template?: string; // Ignored - kept for API compatibility
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
 * Uses Infrastructure.createTenant() for tenant provisioning.
 */
export class TestDatabaseHelper {
    /**
     * Create a test tenant using Infrastructure
     *
     * - Generates tenant name: test_{testName}_{timestamp}_{random}
     * - Uses Infrastructure.createTenant() for full provisioning
     * - Returns database and namespace info
     *
     * @param config - Test tenant configuration
     * @returns Promise with tenant name, database name, and namespace name
     */
    static async createTestTenant(config: TestTenantConfig): Promise<TestTenantResult> {
        const { testName } = config;

        // Generate test tenant name
        const timestamp = Date.now();
        const random = randomBytes(4).toString('hex');
        const tenantName = `test_${testName}_${timestamp}_${random}`;

        // Create tenant via Infrastructure (handles schema creation and seeding)
        const result = await Infrastructure.createTenant({
            name: tenantName,
            owner_username: 'root',
        });

        return {
            tenantName: result.tenant.name,
            dbName: result.tenant.database,
            nsName: result.tenant.schema,
        };
    }

    /**
     * Clean up a test tenant
     *
     * Uses Infrastructure.deleteTenant() for soft delete.
     *
     * @param tenantName - Tenant name to clean up
     * @param _dbName - Unused, kept for API compatibility
     * @param _nsName - Unused, kept for API compatibility
     */
    static async cleanupTestTenant(tenantName: string, _dbName?: string, _nsName?: string): Promise<void> {
        try {
            await Infrastructure.deleteTenant(tenantName);
        } catch (error) {
            console.error(`Error cleaning up test tenant ${tenantName}:`, error);
            throw error;
        }
    }

    /**
     * Clean up all test tenants
     *
     * Removes all tenants with names starting with "test_"
     */
    static async cleanupAllTestTenants(): Promise<void> {
        const mainPool = DatabaseConnection.getMainPool();

        try {
            // Get all test tenants
            const result = await mainPool.query(
                `SELECT name FROM tenants WHERE name LIKE 'test_%' AND deleted_at IS NULL`
            );

            // Clean up each tenant
            for (const row of result.rows) {
                await this.cleanupTestTenant(row.name);
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
