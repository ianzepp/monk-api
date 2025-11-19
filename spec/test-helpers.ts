/**
 * Test Helpers
 *
 * High-level utilities for test files to use.
 * Provides simplified API for common test operations like tenant creation.
 */

import { randomBytes } from 'crypto';
import { HttpClient } from './http-client.js';
import { AuthClient } from './auth-client.js';
import { TEST_CONFIG } from './test-config.js';

/**
 * Test Tenant Information
 */
export interface TestTenant {
    tenantName: string;
    databaseName: string;
    username: string;
    token: string;
    httpClient: HttpClient;
}

/**
 * Test Helpers
 *
 * Simplified API for test files to create and manage test tenants.
 * Each test file should create its own tenant in beforeAll() for isolation.
 */
export class TestHelpers {
    /**
     * Create a test tenant from a template via the API
     *
     * This uses POST /auth/register to create a new tenant from a template.
     * The tenant name is automatically generated with a unique suffix.
     *
     * Benefits over direct database cloning:
     * - Tests the actual user registration flow
     * - Realistic integration testing
     * - No direct database dependencies
     *
     * The returned HttpClient automatically includes the JWT token in all requests,
     * so you don't need to manually add Authorization headers.
     *
     * @param testName - Short name for this test (e.g., 'basic-find')
     * @param template - Template name to clone from (default: 'testing')
     * @param username - Username for the tenant admin (default: 'full')
     * @returns Promise with tenant information including auth token
     *
     * @example
     * ```typescript
     * let tenant: TestTenant;
     *
     * beforeAll(async () => {
     *     tenant = await TestHelpers.createTestTenant('my-test');
     * });
     *
     * it('should do something', async () => {
     *     // Auth token automatically included - no manual headers needed!
     *     const response = await tenant.httpClient.post('/api/find/account', {});
     *     expect(response.success).toBe(true);
     * });
     * ```
     */
    static async createTestTenant(
        testName: string,
        template: string = TEST_CONFIG.DEFAULT_TEMPLATE,
        username: string = 'full'
    ): Promise<TestTenant> {
        // Generate unique tenant name (matches shell script pattern)
        // Format: test_{testName}_{timestamp}_{random}
        const timestamp = Date.now();
        const random = randomBytes(4).toString('hex');
        const tenantName = `test_${testName}_${timestamp}_${random}`;

        const authClient = new AuthClient(TEST_CONFIG.API_URL);

        try {
            // Register tenant via AuthClient (automatically caches JWT)
            const response = await authClient.register({
                tenant: tenantName,
                template: template,
                username: username,
            });

            return {
                tenantName: response.data.tenant,
                databaseName: response.data.database,
                username: response.data.username,
                token: response.data.token,
                httpClient: authClient.client,
            };
        } catch (error) {
            throw new Error(
                `Failed to create test tenant '${tenantName}' from template '${template}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Login to an existing tenant
     *
     * This is useful if you need to get a token for a different user
     * in the same tenant.
     *
     * @param tenantName - Tenant name to login to
     * @param username - Username to login with
     * @returns Promise with auth token
     *
     * @example
     * ```typescript
     * const token = await TestHelpers.loginToTenant(tenant.tenantName, 'readonly');
     * ```
     */
    static async loginToTenant(
        tenantName: string,
        username: string
    ): Promise<string> {
        const authClient = new AuthClient(TEST_CONFIG.API_URL);

        try {
            const response = await authClient.login({
                tenant: tenantName,
                username: username,
            });

            return response.data.token;
        } catch (error) {
            throw new Error(
                `Failed to login to tenant '${tenantName}' as '${username}': ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Cleanup test tenant
     *
     * Currently this is a no-op because global cleanup handles all test tenants
     * at the end of the test suite. However, this method is provided for:
     * 1. Explicit cleanup if needed in the future
     * 2. Backwards compatibility with existing test patterns
     *
     * @param _tenantName - Tenant name to cleanup (unused, kept for compatibility)
     */
    static async cleanupTestTenant(_tenantName: string): Promise<void> {
        // No-op - global cleanup handles this
        // All test tenants (names starting with 'test_') are cleaned up
        // by test-cleanup.sh at the end of the test suite
    }

    /**
     * Create an authenticated HTTP client
     *
     * Helper to create an HttpClient with Authorization header pre-configured.
     *
     * @param _token - JWT token for authentication (currently unused - stored in TestTenant)
     * @returns HttpClient instance configured with auth header
     *
     * @example
     * ```typescript
     * const client = TestHelpers.createAuthenticatedClient(tenant.token);
     * const response = await client.post('/api/find/account', {});
     * ```
     */
    static createAuthenticatedClient(_token: string): HttpClient {
        const httpClient = new HttpClient(TEST_CONFIG.API_URL);
        // Note: HttpClient.post() accepts headers in options parameter
        // Each request will need to pass the token in headers
        return httpClient;
    }
}
