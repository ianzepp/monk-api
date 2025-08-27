import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';
describe('FTP Stat Endpoint - Integration Tests', () => {
    let tenantManager;
    let testContext;
    let accountRecord;
    let contactRecord;
    beforeAll(async () => {
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant, 'root');
        // Create test schemas
        const accountYaml = await readFile('spec/fixtures/schema/account.yaml', 'utf-8');
        const contactYaml = await readFile('spec/fixtures/schema/contact.yaml', 'utf-8');
        await testContext.metabase.createOne('account', accountYaml);
        await testContext.metabase.createOne('contact', contactYaml);
        // Create test records with known data
        accountRecord = {
            id: 'account-stat-001',
            name: 'Stat Test User',
            email: 'stat.test@example.com',
            username: 'stattest',
            account_type: 'business',
            balance: 750.25,
            is_active: true,
            is_verified: true,
            preferences: {
                notifications: true,
                theme: 'dark'
            }
        };
        contactRecord = {
            id: 'contact-stat-001',
            first_name: 'Stat',
            last_name: 'Contact',
            email: 'stat.contact@acme.com',
            company: 'Stat Corp',
            contact_type: 'customer',
            priority: 'high',
            is_active: true,
            tags: ['vip', 'enterprise']
        };
        await testContext.database.createOne('account', accountRecord);
        await testContext.database.createOne('contact', contactRecord);
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('Directory Status Information', () => {
        test('should provide root directory status', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.data.path).toBe('/');
            expect(result.data.type).toBe('directory');
            expect(result.data.permissions).toBe('r-x');
            expect(result.data.size).toBe(0);
            expect(result.data.children_count).toBe(2); // /data and /meta
            expect(result.data.record_info.soft_deleted).toBe(false);
        });
        test('should provide data directory status', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.path).toBe('/data/');
            expect(result.data.type).toBe('directory');
            expect(result.data.permissions).toBe('r-x');
            expect(result.data.children_count).toBeGreaterThanOrEqual(2); // At least account and contact schemas
        });
        test('should provide schema directory status', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.path).toBe('/data/account/');
            expect(result.data.type).toBe('directory');
            expect(result.data.permissions).toBe('rwx');
            expect(result.data.record_info.schema).toBe('account');
            expect(result.data.children_count).toBeGreaterThanOrEqual(1); // At least our test record
        });
        test('should provide record directory status', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.path).toBe('/data/account/account-stat-001/');
            expect(result.data.type).toBe('directory');
            expect(result.data.record_info.schema).toBe('account');
            expect(result.data.record_info.record_id).toBe('account-stat-001');
            expect(result.data.record_info.field_count).toBeGreaterThan(5); // Multiple fields + JSON file
            expect(result.data.children_count).toBeGreaterThan(5);
        });
    });
    describe('File Status Information', () => {
        test('should provide JSON file status', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.path).toBe('/data/account/account-stat-001.json');
            expect(result.data.type).toBe('file');
            expect(result.data.size).toBeGreaterThan(0);
            expect(result.data.record_info.schema).toBe('account');
            expect(result.data.record_info.record_id).toBe('account-stat-001');
            expect(result.data.record_info.field_count).toBeGreaterThan(0);
        });
        test('should provide field file status', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001/email'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.path).toBe('/data/account/account-stat-001/email');
            expect(result.data.type).toBe('file');
            expect(result.data.size).toBeGreaterThan(0);
            expect(result.data.record_info.schema).toBe('account');
            expect(result.data.record_info.record_id).toBe('account-stat-001');
            expect(result.data.record_info.field_name).toBe('email');
        });
        test('should provide accurate size for different field types', async () => {
            // Test string field
            const emailResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001/email'
                })
            });
            // Test numeric field
            const balanceResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001/balance'
                })
            });
            // Test object field
            const preferencesResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001/preferences'
                })
            });
            const emailResult = await emailResponse.json();
            const balanceResult = await balanceResponse.json();
            const preferencesResult = await preferencesResponse.json();
            // Email field should be larger than balance field
            expect(emailResult.data.size).toBeGreaterThan(0);
            expect(balanceResult.data.size).toBeGreaterThan(0);
            expect(preferencesResult.data.size).toBeGreaterThan(balanceResult.data.size); // Object larger than number
        });
    });
    describe('Timestamp Formatting', () => {
        test('should provide FTP-compatible timestamps', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001.json'
                })
            });
            const result = await response.json();
            // FTP timestamp format: YYYYMMDDHHMMSS
            expect(result.data.modified_time).toMatch(/^\d{14}$/);
            expect(result.data.created_time).toMatch(/^\d{14}$/);
            expect(result.data.access_time).toMatch(/^\d{14}$/);
            // Verify timestamp structure
            const modifiedTime = result.data.modified_time;
            const year = modifiedTime.substring(0, 4);
            const month = modifiedTime.substring(4, 6);
            const day = modifiedTime.substring(6, 8);
            expect(parseInt(year)).toBeGreaterThan(2020);
            expect(parseInt(month)).toBeGreaterThanOrEqual(1);
            expect(parseInt(month)).toBeLessThanOrEqual(12);
            expect(parseInt(day)).toBeGreaterThanOrEqual(1);
            expect(parseInt(day)).toBeLessThanOrEqual(31);
        });
        test('should reflect actual record timestamps', async () => {
            // Update record to change timestamps
            await testContext.database.updateOne('account', 'account-stat-001', {
                balance: 999.99
            });
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001.json'
                })
            });
            const result = await response.json();
            // Modified time should be recent (within last few seconds)
            const modifiedTime = result.data.modified_time;
            const now = new Date();
            const currentTimestamp = now.getFullYear() +
                (now.getMonth() + 1).toString().padStart(2, '0') +
                now.getDate().toString().padStart(2, '0') +
                now.getHours().toString().padStart(2, '0') +
                now.getMinutes().toString().padStart(2, '0');
            // Should be within the same minute
            expect(modifiedTime.substring(0, 12)).toBe(currentTimestamp.substring(0, 12));
        });
    });
    describe('Permission Calculation', () => {
        test('should calculate permissions from user ACL context', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001.json'
                })
            });
            const result = await response.json();
            // Root user should have appropriate permissions
            expect(result.data.permissions).toMatch(/^[r-][w-][x-]$/);
            expect(result.data.record_info.access_permissions).toBeDefined();
            expect(Array.isArray(result.data.record_info.access_permissions)).toBe(true);
        });
        test('should show different permissions for directories vs files', async () => {
            const dirResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/'
                })
            });
            const fileResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001.json'
                })
            });
            const dirResult = await dirResponse.json();
            const fileResult = await fileResponse.json();
            expect(dirResult.data.type).toBe('directory');
            expect(fileResult.data.type).toBe('file');
            // Both should have valid permission strings
            expect(dirResult.data.permissions).toMatch(/^[r-][w-][x-]$/);
            expect(fileResult.data.permissions).toMatch(/^[r-][w-][x-]$/);
        });
    });
    describe('Soft Delete Detection', () => {
        test('should detect soft deleted records', async () => {
            // Create record and then soft delete it
            const softDeleteAccount = {
                id: 'account-soft-delete-001',
                name: 'Soft Delete Test',
                email: 'soft.delete@example.com',
                username: 'softdelete',
                account_type: 'trial'
            };
            await testContext.database.createOne('account', softDeleteAccount);
            await testContext.database.deleteOne('account', 'account-soft-delete-001');
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-soft-delete-001.json'
                })
            });
            // Should still be accessible for stat (but marked as soft deleted)
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.record_info.soft_deleted).toBe(true);
        });
    });
    describe('Error Handling', () => {
        test('should handle non-existent paths', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/nonexistent/record.json'
                })
            });
            expect(response.status).toBe(500);
        });
        test('should handle non-existent record', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/nonexistent-record.json'
                })
            });
            expect(response.status).toBe(500);
        });
        test('should handle non-existent field', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-stat-001/nonexistent_field'
                })
            });
            expect(response.status).toBe(500);
        });
        test('should handle invalid path formats', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/invalid/path/structure/too/deep/'
                })
            });
            expect(response.status).toBe(500);
        });
        test('should require authentication', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // No Authorization header
                },
                body: JSON.stringify({
                    path: '/data/account/'
                })
            });
            expect(response.status).toBe(401);
        });
    });
    describe('Performance and Edge Cases', () => {
        test('should handle large directories efficiently', async () => {
            // Create multiple records for performance testing
            const accounts = [];
            for (let i = 1; i <= 20; i++) {
                accounts.push({
                    id: `perf-account-${i.toString().padStart(3, '0')}`,
                    name: `Performance Test ${i}`,
                    email: `perf${i}@example.com`,
                    username: `perf${i}`,
                    account_type: 'trial'
                });
            }
            await testContext.database.createAll('account', accounts);
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.children_count).toBeGreaterThanOrEqual(20);
        });
        test('should handle records with many fields', async () => {
            // Create contact with all optional fields
            const fullContact = {
                id: 'contact-full-001',
                first_name: 'Full',
                last_name: 'Contact',
                email: 'full.contact@example.com',
                company: 'Full Corp',
                job_title: 'Full Engineer',
                phone: '+1 (555) 123-4567',
                mobile: '+1 (555) 987-6543',
                contact_type: 'customer',
                priority: 'high',
                source: 'website',
                is_active: true,
                notes: 'This is a comprehensive contact record with all fields filled',
                tags: ['comprehensive', 'full-data', 'test'],
                address: {
                    street: '789 Full Street',
                    city: 'Full City',
                    state: 'FC',
                    postal_code: '54321',
                    country: 'US'
                }
            };
            await testContext.database.createOne('contact', fullContact);
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-full-001/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.record_info.field_count).toBeGreaterThan(10); // Many fields
            expect(result.data.children_count).toBeGreaterThan(10);
        });
        test('should handle empty fields accurately', async () => {
            // Create contact with minimal required fields
            const minimalContact = {
                id: 'contact-minimal-001',
                first_name: 'Min',
                last_name: 'Contact',
                email: 'min@example.com',
                contact_type: 'lead'
            };
            await testContext.database.createOne('contact', minimalContact);
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-minimal-001/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            // Should still show proper field count despite minimal data
            expect(result.data.record_info.field_count).toBeGreaterThan(0);
        });
    });
    describe('Comprehensive Path Coverage', () => {
        test('should handle all supported path levels', async () => {
            const pathsToTest = [
                '/', // Root
                '/data/', // Data directory
                '/data/account/', // Schema directory
                '/data/account/account-stat-001/', // Record directory
                '/data/account/account-stat-001.json', // JSON file
                '/data/account/account-stat-001/name' // Field file
            ];
            for (const path of pathsToTest) {
                const response = await fetch('http://localhost:9001/ftp/stat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${testContext.jwtToken}`
                    },
                    body: JSON.stringify({ path })
                });
                expect(response.status).toBe(200);
                const result = await response.json();
                expect(result.success).toBe(true);
                expect(result.data.path).toBeDefined();
                expect(result.data.type).toMatch(/^(directory|file)$/);
                expect(result.data.permissions).toMatch(/^[r-][w-][x-]$/);
            }
        });
        test('should provide consistent metadata across path types', async () => {
            const response = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-stat-001/tags'
                })
            });
            const result = await response.json();
            // All paths should provide complete metadata
            expect(result.data.path).toBeDefined();
            expect(result.data.type).toBeDefined();
            expect(result.data.permissions).toBeDefined();
            expect(result.data.size).toBeDefined();
            expect(result.data.modified_time).toBeDefined();
            expect(result.data.created_time).toBeDefined();
            expect(result.data.access_time).toBeDefined();
            expect(result.data.record_info).toBeDefined();
            expect(result.data.record_info.schema).toBeDefined();
        });
    });
    describe('Cross-Schema Operations', () => {
        test('should handle different schema types consistently', async () => {
            const accountStatResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/'
                })
            });
            const contactStatResponse = await fetch('http://localhost:9001/ftp/stat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/'
                })
            });
            const accountResult = await accountStatResponse.json();
            const contactResult = await contactStatResponse.json();
            // Both should follow same response format
            expect(accountResult.data.type).toBe('directory');
            expect(contactResult.data.type).toBe('directory');
            expect(accountResult.data.record_info.schema).toBe('account');
            expect(contactResult.data.record_info.schema).toBe('contact');
            // Both should show children counts
            expect(accountResult.data.children_count).toBeGreaterThan(0);
            expect(contactResult.data.children_count).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=ftp-stat.test.js.map