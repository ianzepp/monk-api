import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';
describe('FTP Modify Time Integration Tests', () => {
    let tenantManager;
    let testContext;
    beforeAll(async () => {
        // Create fresh tenant for this test suite
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant, 'root');
        // Create test schema
        const accountSchemaYaml = await readFile('spec/fixtures/schemas/account.yaml', 'utf-8');
        await testContext.metabase.createOne('account', accountSchemaYaml);
        // Create test records with known timestamps
        await testContext.database.createOne('account', {
            id: 'mdtm-test-001',
            name: 'MDTM Test User',
            email: 'mdtm@example.com',
            username: 'mdtmtest',
            account_type: 'personal',
            created_at: '2025-01-01T12:00:00Z'
        });
        // Wait a moment and create another record to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 100));
        await testContext.database.createOne('account', {
            id: 'mdtm-test-002',
            name: 'Updated MDTM User',
            email: 'updated@example.com',
            username: 'updateduser',
            account_type: 'business',
            created_at: '2025-01-01T12:00:00Z'
        });
        // Update the second record to create a distinct updated_at timestamp
        await new Promise(resolve => setTimeout(resolve, 100));
        await testContext.database.updateOne('account', 'mdtm-test-002', {
            name: 'Updated MDTM User - Modified'
        });
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('Root and Directory Timestamps', () => {
        test('should return current time for root directory', async () => {
            const beforeRequest = Date.now();
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/'
                })
            });
            const afterRequest = Date.now();
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.path).toBe('/');
            expect(result.modified_time).toMatch(/^\d{14}$/);
            expect(result.timestamp_info.source).toBe('current_time');
            expect(result.timestamp_info.timezone).toBe('UTC');
            // Verify timestamp is within reasonable range
            const timestamp = new Date(result.timestamp_info.iso_timestamp);
            expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeRequest);
            expect(timestamp.getTime()).toBeLessThanOrEqual(afterRequest);
        });
        test('should return current time for /data directory', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
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
            expect(result.success).toBe(true);
            expect(result.path).toBe('/data/');
            expect(result.modified_time).toMatch(/^\d{14}$/);
            expect(result.timestamp_info.source).toBe('current_time');
        });
        test('should return schema directory timestamp', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
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
            expect(result.success).toBe(true);
            expect(result.path).toBe('/data/account/');
            expect(result.modified_time).toMatch(/^\d{14}$/);
            expect(['updated_at', 'created_at', 'current_time']).toContain(result.timestamp_info.source);
            expect(result.timestamp_info.timezone).toBe('UTC');
        });
        test('should return record directory timestamp', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.path).toBe('/data/account/mdtm-test-001/');
            expect(result.modified_time).toMatch(/^\d{14}$/);
            expect(['updated_at', 'created_at']).toContain(result.timestamp_info.source);
            // Should use the record's actual timestamp
            const record = await testContext.database.selectOne('account', {
                where: { id: 'mdtm-test-001' }
            });
            const expectedTimestamp = new Date(record.updated_at || record.created_at);
            const actualTimestamp = new Date(result.timestamp_info.iso_timestamp);
            expect(Math.abs(actualTimestamp.getTime() - expectedTimestamp.getTime())).toBeLessThan(1000);
        });
    });
    describe('JSON Record File Timestamps', () => {
        test('should return correct timestamp for record created_at', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.path).toBe('/data/account/mdtm-test-001.json');
            expect(result.modified_time).toMatch(/^\d{14}$/);
            expect(['updated_at', 'created_at']).toContain(result.timestamp_info.source);
            expect(result.timestamp_info.timezone).toBe('UTC');
            // Verify timestamp matches record
            const record = await testContext.database.selectOne('account', {
                where: { id: 'mdtm-test-001' }
            });
            const expectedTimestamp = new Date(record.updated_at || record.created_at);
            const actualTimestamp = new Date(result.timestamp_info.iso_timestamp);
            expect(Math.abs(actualTimestamp.getTime() - expectedTimestamp.getTime())).toBeLessThan(1000);
        });
        test('should prefer updated_at over created_at for modified record', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-002.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.timestamp_info.source).toBe('updated_at');
            // Verify the updated_at timestamp is newer than created_at
            const record = await testContext.database.selectOne('account', {
                where: { id: 'mdtm-test-002' }
            });
            const createdTime = new Date(record.created_at).getTime();
            const updatedTime = new Date(record.updated_at).getTime();
            expect(updatedTime).toBeGreaterThan(createdTime);
            const actualTimestamp = new Date(result.timestamp_info.iso_timestamp);
            expect(Math.abs(actualTimestamp.getTime() - updatedTime)).toBeLessThan(1000);
        });
    });
    describe('Individual Field File Timestamps', () => {
        test('should return correct timestamp for field file', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001/email'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.path).toBe('/data/account/mdtm-test-001/email');
            expect(result.modified_time).toMatch(/^\d{14}$/);
            expect(['updated_at', 'created_at']).toContain(result.timestamp_info.source);
            // Field should inherit parent record's timestamp
            const record = await testContext.database.selectOne('account', {
                where: { id: 'mdtm-test-001' }
            });
            const expectedTimestamp = new Date(record.updated_at || record.created_at);
            const actualTimestamp = new Date(result.timestamp_info.iso_timestamp);
            expect(Math.abs(actualTimestamp.getTime() - expectedTimestamp.getTime())).toBeLessThan(1000);
        });
        test('should return timestamp for different field types', async () => {
            const fields = ['name', 'email', 'username', 'account_type'];
            for (const field of fields) {
                const response = await fetch('http://localhost:9001/ftp/modify-time', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${testContext.jwtToken}`
                    },
                    body: JSON.stringify({
                        path: `/data/account/mdtm-test-001/${field}`
                    })
                });
                expect(response.status).toBe(200);
                const result = await response.json();
                expect(result.success).toBe(true);
                expect(result.path).toBe(`/data/account/mdtm-test-001/${field}`);
                expect(result.modified_time).toMatch(/^\d{14}$/);
                expect(['updated_at', 'created_at']).toContain(result.timestamp_info.source);
            }
        });
    });
    describe('Error Cases', () => {
        test('should return 550 error for non-existent records', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/nonexistent-record.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(false);
            expect(result.error).toBe('file_not_found');
            expect(result.ftp_code).toBe(550);
            expect(result.path).toBe('/data/account/nonexistent-record.json');
        });
        test('should return 550 error for non-existent fields', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001/nonexistent_field'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(false);
            expect(result.error).toBe('file_not_found');
            expect(result.ftp_code).toBe(550);
            expect(result.message).toContain('Field not found');
        });
        test('should return 550 error for invalid path formats', async () => {
            const invalidPaths = [
                '/invalid/path.json',
                '/data/account/record/field/extra.json',
                '/api/data/account/record.json'
            ];
            for (const path of invalidPaths) {
                const response = await fetch('http://localhost:9001/ftp/modify-time', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${testContext.jwtToken}`
                    },
                    body: JSON.stringify({ path })
                });
                expect(response.status).toBe(200);
                const result = await response.json();
                expect(result.success).toBe(false);
                expect(result.ftp_code).toBe(550);
                expect(result.error).toBe('invalid_path');
            }
        });
    });
    describe('Permission Handling', () => {
        test('should respect ACL permissions for record access', async () => {
            // Create record with restricted access
            await testContext.database.createOne('account', {
                id: 'restricted-record',
                name: 'Restricted User',
                email: 'restricted@example.com',
                username: 'restricted',
                account_type: 'personal',
                access_deny: [testContext.system.getUser().id] // Deny current user
            });
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/restricted-record.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(false);
            expect(result.error).toBe('permission_denied');
            expect(result.ftp_code).toBe(550);
        });
        test('should allow access to directories even with restricted records', async () => {
            // Directory access should generally be allowed
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
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
            expect(result.success).toBe(true);
            expect(result.path).toBe('/data/account/');
        });
    });
    describe('Timestamp Accuracy and Consistency', () => {
        test('should return consistent timestamps for same resource', async () => {
            const paths = [
                '/data/account/mdtm-test-001.json',
                '/data/account/mdtm-test-001/',
                '/data/account/mdtm-test-001/email'
            ];
            const timestamps = [];
            for (const path of paths) {
                const response = await fetch('http://localhost:9001/ftp/modify-time', {
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
                timestamps.push(result.modified_time);
            }
            // All timestamps should be the same (referring to same record)
            expect(timestamps[0]).toBe(timestamps[1]);
            expect(timestamps[1]).toBe(timestamps[2]);
        });
        test('should handle timezone consistency', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.timestamp_info.timezone).toBe('UTC');
            expect(result.timestamp_info.iso_timestamp).toMatch(/Z$/); // Should end with Z for UTC
        });
        test('should format FTP timestamps correctly', async () => {
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.modified_time).toMatch(/^\d{14}$/); // Exactly 14 digits
            // Verify FTP format matches ISO timestamp
            const ftpTime = result.modified_time;
            const isoTime = result.timestamp_info.iso_timestamp;
            const year = ftpTime.substring(0, 4);
            const month = ftpTime.substring(4, 6);
            const day = ftpTime.substring(6, 8);
            const hour = ftpTime.substring(8, 10);
            const minute = ftpTime.substring(10, 12);
            const second = ftpTime.substring(12, 14);
            expect(isoTime).toContain(`${year}-${month}-${day}`);
            expect(isoTime).toContain(`${hour}:${minute}:${second}`);
        });
    });
    describe('Performance Characteristics', () => {
        test('should respond quickly for modification time queries', async () => {
            const startTime = Date.now();
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/mdtm-test-001.json'
                })
            });
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            expect(response.status).toBe(200);
            expect(responseTime).toBeLessThan(1000); // Should respond in under 1 second
            const result = await response.json();
            expect(result.success).toBe(true);
        });
        test('should handle multiple concurrent modification time requests', async () => {
            const requests = [
                '/data/account/mdtm-test-001.json',
                '/data/account/mdtm-test-002.json',
                '/data/account/mdtm-test-001/email',
                '/data/account/',
                '/'
            ].map(path => fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({ path })
            }));
            const responses = await Promise.all(requests);
            for (const response of responses) {
                expect(response.status).toBe(200);
                const result = await response.json();
                expect(result.success).toBe(true);
                expect(result.modified_time).toMatch(/^\d{14}$/);
            }
        });
    });
    describe('Edge Cases', () => {
        test('should handle records with only created_at timestamp', async () => {
            // Create a record and then manually clear updated_at to simulate old record
            await testContext.database.createOne('account', {
                id: 'created-only-record',
                name: 'Created Only User',
                email: 'created@example.com',
                username: 'createdonly',
                account_type: 'personal'
            });
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/created-only-record.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(['updated_at', 'created_at']).toContain(result.timestamp_info.source);
            expect(result.modified_time).toMatch(/^\d{14}$/);
        });
        test('should handle empty schema directory', async () => {
            // Test accessing a schema with no records
            const response = await fetch('http://localhost:9001/ftp/modify-time', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/nonexistent-schema/'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.timestamp_info.source).toBe('current_time');
        });
    });
});
//# sourceMappingURL=ftp-modify-time.test.js.map