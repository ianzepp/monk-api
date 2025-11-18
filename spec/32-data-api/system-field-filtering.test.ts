import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestDatabaseHelper } from '../test-database-helper.js';
import { HttpClient } from '../http-client.js';

/**
 * System Field Filtering Tests
 *
 * Tests the ?stat= and ?access= query parameters that filter system fields from responses.
 *
 * These tests verify:
 * 1. Default behavior includes all system fields
 * 2. ?stat=false excludes timestamp fields
 * 3. ?access=false excludes ACL fields
 * 4. Combined filtering works correctly
 * 5. Filtering works on GET, POST, PUT operations
 * 6. Filtering runs before ?pick= extraction
 */

describe('System Field Filtering (?stat= and ?access= parameters)', () => {
    let tenantName: string;
    let databaseName: string;
    let token: string;
    const httpClient = new HttpClient('http://localhost:9001');

    // Create test tenant before all tests
    beforeAll(async () => {
        const result = await TestDatabaseHelper.createTestTenant({
            testName: 'field-filtering',
            template: 'testing',
        });

        tenantName = result.tenantName;
        databaseName = result.databaseName;

        // Get auth token
        const loginResponse = await httpClient.post('/auth/login', {
            tenant: tenantName,
            username: 'full',
        });

        expect(loginResponse.success).toBe(true);
        expect(loginResponse.data.token).toBeDefined();
        token = loginResponse.data.token;
    });

    // Clean up test tenant after all tests
    afterAll(async () => {
        if (tenantName && databaseName) {
            await TestDatabaseHelper.cleanupTestTenant(tenantName, databaseName);
        }
    });

    describe('Default Behavior (no filtering)', () => {
        it('should include all system fields by default on GET', async () => {
            const response = await httpClient.get('/api/data/accounts', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();
            expect(Array.isArray(response.data)).toBe(true);

            if (response.data.length > 0) {
                const record = response.data[0];

                // Stat fields should be present
                expect(record.created_at).toBeDefined();
                expect(record.updated_at).toBeDefined();
                expect(record).toHaveProperty('trashed_at');
                expect(record).toHaveProperty('deleted_at');

                // Access fields should be present
                expect(record).toHaveProperty('access_read');
                expect(record).toHaveProperty('access_edit');
                expect(record).toHaveProperty('access_full');
                expect(record).toHaveProperty('access_deny');
            }
        });

        it('should include all system fields by default on POST', async () => {
            const response = await httpClient.post(
                '/api/data/accounts',
                {
                    name: 'Test Account',
                    email: 'test@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();

            // Stat fields should be present
            expect(response.data.created_at).toBeDefined();
            expect(response.data.updated_at).toBeDefined();
            expect(response.data).toHaveProperty('trashed_at');

            // Access fields should be present
            expect(response.data).toHaveProperty('access_read');
            expect(response.data).toHaveProperty('access_edit');
            expect(response.data).toHaveProperty('access_full');
            expect(response.data).toHaveProperty('access_deny');
        });
    });

    describe('?stat=false parameter', () => {
        it('should exclude timestamp fields when stat=false on GET', async () => {
            const response = await httpClient.get('/api/data/accounts?stat=false', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();
            expect(Array.isArray(response.data)).toBe(true);

            if (response.data.length > 0) {
                const record = response.data[0];

                // Stat fields should be ABSENT
                expect(record.created_at).toBeUndefined();
                expect(record.updated_at).toBeUndefined();
                expect(record.trashed_at).toBeUndefined();
                expect(record.deleted_at).toBeUndefined();

                // Access fields should still be present
                expect(record).toHaveProperty('access_read');
                expect(record).toHaveProperty('access_edit');

                // User data should still be present
                expect(record.id).toBeDefined();
                expect(record.name).toBeDefined();
            }
        });

        it('should exclude timestamp fields when stat=false on POST', async () => {
            const response = await httpClient.post(
                '/api/data/accounts?stat=false',
                {
                    name: 'Test Account No Stat',
                    email: 'nostat@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();

            // Stat fields should be ABSENT
            expect(response.data.created_at).toBeUndefined();
            expect(response.data.updated_at).toBeUndefined();
            expect(response.data.trashed_at).toBeUndefined();

            // Access fields should still be present
            expect(response.data).toHaveProperty('access_read');

            // User data should still be present
            expect(response.data.id).toBeDefined();
            expect(response.data.name).toBe('Test Account No Stat');
        });

        it('should exclude timestamp fields when stat=false on PUT', async () => {
            // First create a record
            const createResponse = await httpClient.post(
                '/api/data/accounts',
                {
                    name: 'Account To Update',
                    email: 'update@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(createResponse.success).toBe(true);
            const recordId = createResponse.data.id;

            // Update with stat=false
            const updateResponse = await httpClient.put(
                `/api/data/accounts/${recordId}?stat=false`,
                {
                    name: 'Updated Account Name',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(updateResponse.success).toBe(true);
            expect(updateResponse.data).toBeDefined();

            // Stat fields should be ABSENT
            expect(updateResponse.data.created_at).toBeUndefined();
            expect(updateResponse.data.updated_at).toBeUndefined();

            // Updated data should be present
            expect(updateResponse.data.name).toBe('Updated Account Name');
        });
    });

    describe('?access=false parameter', () => {
        it('should exclude ACL fields when access=false on GET', async () => {
            const response = await httpClient.get('/api/data/accounts?access=false', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();
            expect(Array.isArray(response.data)).toBe(true);

            if (response.data.length > 0) {
                const record = response.data[0];

                // Access fields should be ABSENT
                expect(record.access_read).toBeUndefined();
                expect(record.access_edit).toBeUndefined();
                expect(record.access_full).toBeUndefined();
                expect(record.access_deny).toBeUndefined();

                // Stat fields should still be present
                expect(record.created_at).toBeDefined();
                expect(record.updated_at).toBeDefined();

                // User data should still be present
                expect(record.id).toBeDefined();
                expect(record.name).toBeDefined();
            }
        });

        it('should exclude ACL fields when access=false on POST', async () => {
            const response = await httpClient.post(
                '/api/data/accounts?access=false',
                {
                    name: 'Test Account No Access',
                    email: 'noaccess@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();

            // Access fields should be ABSENT
            expect(response.data.access_read).toBeUndefined();
            expect(response.data.access_edit).toBeUndefined();
            expect(response.data.access_full).toBeUndefined();
            expect(response.data.access_deny).toBeUndefined();

            // Stat fields should still be present
            expect(response.data.created_at).toBeDefined();

            // User data should still be present
            expect(response.data.id).toBeDefined();
            expect(response.data.name).toBe('Test Account No Access');
        });
    });

    describe('Combined filtering (?stat=false&access=false)', () => {
        it('should exclude both stat and access fields when both false', async () => {
            const response = await httpClient.get('/api/data/accounts?stat=false&access=false', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();
            expect(Array.isArray(response.data)).toBe(true);

            if (response.data.length > 0) {
                const record = response.data[0];

                // Stat fields should be ABSENT
                expect(record.created_at).toBeUndefined();
                expect(record.updated_at).toBeUndefined();
                expect(record.trashed_at).toBeUndefined();

                // Access fields should be ABSENT
                expect(record.access_read).toBeUndefined();
                expect(record.access_edit).toBeUndefined();
                expect(record.access_full).toBeUndefined();
                expect(record.access_deny).toBeUndefined();

                // User data should still be present
                expect(record.id).toBeDefined();
                expect(record.name).toBeDefined();
            }
        });

        it('should return data-only response on POST with both filters', async () => {
            const response = await httpClient.post(
                '/api/data/accounts?stat=false&access=false',
                {
                    name: 'Data Only Account',
                    email: 'dataonly@example.com',
                },
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            expect(response.success).toBe(true);
            expect(response.data).toBeDefined();

            // All system fields should be ABSENT
            expect(response.data.created_at).toBeUndefined();
            expect(response.data.updated_at).toBeUndefined();
            expect(response.data.access_read).toBeUndefined();
            expect(response.data.access_edit).toBeUndefined();

            // Only user data present
            expect(response.data.id).toBeDefined();
            expect(response.data.name).toBe('Data Only Account');
            expect(response.data.email).toBe('dataonly@example.com');
        });
    });

    describe('Interaction with ?pick= parameter', () => {
        it('should filter fields BEFORE pick extraction', async () => {
            const response = await httpClient.get('/api/data/accounts?access=false&pick=data', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(Array.isArray(response)).toBe(true);

            if (response.length > 0) {
                const record = response[0];

                // Access fields should be ABSENT (filtered before pick)
                expect(record.access_read).toBeUndefined();
                expect(record.access_edit).toBeUndefined();

                // Stat fields should still be present (not filtered)
                expect(record.created_at).toBeDefined();

                // User data should be present
                expect(record.id).toBeDefined();
                expect(record.name).toBeDefined();
            }
        });

        it('should apply both filtering and picking correctly', async () => {
            const response = await httpClient.get(
                '/api/data/accounts?stat=false&access=false&pick=data.id,data.name',
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            // Pick should extract only id and name from filtered data
            expect(response).toBeDefined();
            expect(typeof response).toBe('object');

            if (Array.isArray(response.id)) {
                // Multiple records - pick returns {id: [...], name: [...]}
                expect(response.id).toBeDefined();
                expect(response.name).toBeDefined();
                expect(response.created_at).toBeUndefined();
                expect(response.access_read).toBeUndefined();
            } else {
                // Single record or different format
                // Verify no system fields leaked through
                const str = JSON.stringify(response);
                expect(str).not.toContain('created_at');
                expect(str).not.toContain('access_read');
            }
        });
    });

    describe('Explicit true values', () => {
        it('should include fields when stat=true explicitly', async () => {
            const response = await httpClient.get('/api/data/accounts?stat=true', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            if (response.data.length > 0) {
                const record = response.data[0];
                expect(record.created_at).toBeDefined();
                expect(record.updated_at).toBeDefined();
            }
        });

        it('should include fields when access=true explicitly', async () => {
            const response = await httpClient.get('/api/data/accounts?access=true', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            if (response.data.length > 0) {
                const record = response.data[0];
                expect(record).toHaveProperty('access_read');
                expect(record).toHaveProperty('access_edit');
            }
        });
    });

    describe('Array responses', () => {
        it('should filter fields in all array elements', async () => {
            const response = await httpClient.get('/api/data/accounts?stat=false', {
                headers: { Authorization: `Bearer ${token}` },
            });

            expect(response.success).toBe(true);
            expect(Array.isArray(response.data)).toBe(true);

            // Check that ALL records in the array are filtered
            response.data.forEach((record: any) => {
                expect(record.created_at).toBeUndefined();
                expect(record.updated_at).toBeUndefined();
                expect(record.id).toBeDefined(); // User data still present
            });
        });
    });
});
