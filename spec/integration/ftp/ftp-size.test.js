import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';
describe('FTP Size Integration Tests', () => {
    let tenantManager;
    let testContext;
    beforeAll(async () => {
        // Create fresh tenant for this test suite
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant, 'root');
        // Create test schema
        const accountSchemaYaml = await readFile('spec/fixtures/schemas/account.yaml', 'utf-8');
        await testContext.metabase.createOne('account', accountSchemaYaml);
        // Create test records with known content for size testing
        await testContext.database.createOne('account', {
            id: 'size-test-001',
            name: 'Size Test User',
            email: 'test@example.com',
            username: 'sizetest',
            account_type: 'personal',
            description: 'A test account for SIZE command testing'
        });
        await testContext.database.createOne('account', {
            id: 'size-test-002',
            name: 'Large Content User',
            email: 'large@example.com',
            username: 'largeuser',
            account_type: 'business',
            description: 'X'.repeat(500), // 500 character description
            metadata: {
                tags: ['test', 'large', 'content'],
                settings: {
                    notifications: true,
                    theme: 'dark',
                    language: 'en'
                }
            }
        });
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('JSON Record File Sizes', () => {
        test('should return correct size for complete JSON record', async () => {
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-001.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBeGreaterThan(0);
            expect(result.path).toBe('/data/account/size-test-001.json');
            expect(result.content_info.type).toBe('file');
            expect(result.content_info.encoding).toBe('utf8');
            expect(result.content_info.estimated).toBe(false);
            // Verify size matches actual JSON stringification
            const record = await testContext.database.selectOne('account', {
                where: { id: 'size-test-001' }
            });
            const expectedSize = Buffer.byteLength(JSON.stringify(record), 'utf8');
            expect(result.size).toBe(expectedSize);
        });
        test('should return correct size for large JSON record', async () => {
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-002.json'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBeGreaterThan(500); // Should be larger due to large description
            expect(result.content_info.type).toBe('file');
            // Verify size accuracy for large record
            const record = await testContext.database.selectOne('account', {
                where: { id: 'size-test-002' }
            });
            const expectedSize = Buffer.byteLength(JSON.stringify(record), 'utf8');
            expect(result.size).toBe(expectedSize);
        });
    });
    describe('Individual Field File Sizes', () => {
        test('should return correct size for string field', async () => {
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-001/email'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBeGreaterThan(0);
            expect(result.path).toBe('/data/account/size-test-001/email');
            expect(result.content_info.type).toBe('file');
            // Verify size matches field value
            const record = await testContext.database.selectOne('account', {
                where: { id: 'size-test-001' }
            });
            const expectedSize = Buffer.byteLength(String(record.email), 'utf8');
            expect(result.size).toBe(expectedSize);
        });
        test('should return correct size for large text field', async () => {
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-002/description'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBe(500); // Exactly 500 characters
            expect(result.content_info.type).toBe('file');
        });
        test('should return correct size for JSON object field', async () => {
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-002/metadata'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBeGreaterThan(0);
            expect(result.content_info.type).toBe('file');
            // Verify size matches JSON stringification of field
            const record = await testContext.database.selectOne('account', {
                where: { id: 'size-test-002' }
            });
            const expectedSize = Buffer.byteLength(JSON.stringify(record.metadata), 'utf8');
            expect(result.size).toBe(expectedSize);
        });
    });
    describe('Error Cases', () => {
        test('should return 550 error for directory paths', async () => {
            const directoryPaths = [
                '/data/',
                '/data/account/',
                '/data/account/size-test-001/'
            ];
            for (const path of directoryPaths) {
                const response = await fetch('http://localhost:9001/ftp/size', {
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
                expect(result.error).toBe('not_a_file');
                expect(result.ftp_code).toBe(550);
                expect(result.message).toContain('files, not directories');
                expect(result.path).toBe(path);
            }
        });
        test('should return 550 error for non-existent records', async () => {
            const response = await fetch('http://localhost:9001/ftp/size', {
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
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-001/nonexistent_field'
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
                '/api/data/account/record.json',
                'data/account/record.json' // Missing leading slash
            ];
            for (const path of invalidPaths) {
                const response = await fetch('http://localhost:9001/ftp/size', {
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
                expect(['invalid_path', 'not_a_file'].includes(result.error)).toBe(true);
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
            const response = await fetch('http://localhost:9001/ftp/size', {
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
    });
    describe('Performance Characteristics', () => {
        test('should respond quickly for size queries', async () => {
            const startTime = Date.now();
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/size-test-001.json'
                })
            });
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            expect(response.status).toBe(200);
            expect(responseTime).toBeLessThan(1000); // Should respond in under 1 second
            const result = await response.json();
            expect(result.success).toBe(true);
        });
        test('should handle multiple concurrent size requests', async () => {
            const requests = [
                '/data/account/size-test-001.json',
                '/data/account/size-test-002.json',
                '/data/account/size-test-001/email',
                '/data/account/size-test-002/description'
            ].map(path => fetch('http://localhost:9001/ftp/size', {
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
                expect(result.size).toBeGreaterThan(0);
            }
        });
    });
    describe('Edge Cases', () => {
        test('should handle null field values', async () => {
            // Create record with null field
            await testContext.database.createOne('account', {
                id: 'null-field-test',
                name: 'Null Field Test',
                email: null, // Null field
                username: 'nulltest',
                account_type: 'personal'
            });
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/null-field-test/email'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBe(0); // Null field should have size 0
            expect(result.content_info.type).toBe('file');
        });
        test('should handle empty string fields', async () => {
            // Create record with empty string field
            await testContext.database.createOne('account', {
                id: 'empty-string-test',
                name: 'Empty String Test',
                email: '', // Empty string
                username: 'emptytest',
                account_type: 'personal'
            });
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/empty-string-test/email'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBe(0); // Empty string should have size 0
        });
        test('should handle Unicode content correctly', async () => {
            // Create record with Unicode content
            await testContext.database.createOne('account', {
                id: 'unicode-test',
                name: 'Unicode Test: 🚀 café français 日本語',
                email: 'unicode@example.com',
                username: 'unicodetest',
                account_type: 'personal'
            });
            const response = await fetch('http://localhost:9001/ftp/size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/unicode-test/name'
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.size).toBeGreaterThan(30); // Unicode characters take more bytes
            // Verify size calculation is correct for Unicode
            const record = await testContext.database.selectOne('account', {
                where: { id: 'unicode-test' }
            });
            const expectedSize = Buffer.byteLength(record.name, 'utf8');
            expect(result.size).toBe(expectedSize);
        });
    });
});
//# sourceMappingURL=ftp-size.test.js.map