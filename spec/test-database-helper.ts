import { randomBytes } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { DatabaseNaming, TenantNamingMode } from '@src/lib/database-naming.js';

const execAsync = promisify(exec);

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
    databaseName: string;
}

/**
 * Test Database Helper
 *
 * Provides utilities for creating and cleaning up test tenants in Vitest tests.
 * Matches the behavior of shell test helpers (spec/test-tenant-helper.sh).
 */
export class TestDatabaseHelper {
    /**
     * Create a test tenant from a template database
     *
     * This matches the shell function: create_test_tenant_from_template()
     * - Generates tenant name: test_{testName}_{timestamp}_{random}
     * - Clones from template: monk_template_{template}
     * - Uses production hashing for database name: tenant_{16-char-hash}
     * - Registers tenant in monk.tenants table
     *
     * @param config - Test tenant configuration
     * @returns Promise with tenant name and database name
     */
    static async createTestTenant(config: TestTenantConfig): Promise<TestTenantResult> {
        const { testName, template = 'testing' } = config;

        // Generate test tenant name (matches shell: test_${test_name}_${timestamp}_${random})
        const timestamp = Date.now();
        const random = randomBytes(4).toString('hex');
        const tenantName = `test_${testName}_${timestamp}_${random}`;

        // Generate hashed database name using production logic
        const databaseName = DatabaseNaming.generateDatabaseName(tenantName, TenantNamingMode.ENTERPRISE);

        // Template database name (matches shell: monk_template_$template_name)
        const templateDatabaseName = `monk_template_${template}`;

        const mainPool = DatabaseConnection.getMainPool();

        try {
            // 1. Validate template exists
            const templateCheck = await mainPool.query(
                'SELECT COUNT(*) FROM pg_database WHERE datname = $1',
                [templateDatabaseName]
            );

            if (templateCheck.rows[0].count === '0') {
                throw new Error(
                    `Template database '${templateDatabaseName}' not found. ` +
                        `Run 'npm run fixtures:build ${template}' to create it.`
                );
            }

            // 2. Clone database from template using createdb command (same as shell tests)
            try {
                await execAsync(`createdb "${databaseName}" -T "${templateDatabaseName}"`);
            } catch (error) {
                throw new Error(`Failed to clone from template database: ${error}`);
            }

            // 3. Register tenant in main database (matches shell INSERT statement)
            await mainPool.query(
                `INSERT INTO tenants (name, database, host, is_active, tenant_type)
                 VALUES ($1, $2, $3, $4, $5)`,
                [tenantName, databaseName, 'localhost', true, 'normal']
            );

            return {
                tenantName,
                databaseName,
            };
        } catch (error) {
            // Cleanup on failure
            try {
                await execAsync(`dropdb "${databaseName}" 2>/dev/null || true`);
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Clean up a test tenant
     *
     * This matches the shell cleanup logic:
     * - Terminates active connections
     * - Drops the database
     * - Removes tenant from registry
     *
     * @param tenantName - Tenant name to clean up
     * @param databaseName - Database name to drop
     */
    static async cleanupTestTenant(tenantName: string, databaseName: string): Promise<void> {
        const mainPool = DatabaseConnection.getMainPool();

        try {
            // 1. Terminate active connections (matches shell: pg_terminate_backend)
            await mainPool.query(
                `SELECT pg_terminate_backend(pid)
                 FROM pg_stat_activity
                 WHERE datname = $1
                   AND pid <> pg_backend_pid()`,
                [databaseName]
            );

            // 2. Drop database
            try {
                await execAsync(`dropdb "${databaseName}"`);
            } catch (error) {
                // Database might not exist, that's ok
                console.warn(`Warning: Failed to drop database ${databaseName}:`, error);
            }

            // 3. Remove tenant from registry
            await mainPool.query('DELETE FROM tenants WHERE name = $1', [tenantName]);
        } catch (error) {
            console.error(`Error cleaning up test tenant ${tenantName}:`, error);
            throw error;
        }
    }

    /**
     * Clean up all test tenants
     *
     * This matches shell: cleanup_all_test_databases()
     * Removes all tenants with names starting with "test_"
     */
    static async cleanupAllTestTenants(): Promise<void> {
        const mainPool = DatabaseConnection.getMainPool();

        try {
            // Get all test tenants
            const result = await mainPool.query(
                `SELECT name, database FROM tenants WHERE name LIKE 'test_%'`
            );

            // Clean up each tenant
            for (const row of result.rows) {
                await this.cleanupTestTenant(row.name, row.database);
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
