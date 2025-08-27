import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';
describe('FTP Retrieve Endpoint - Integration Tests', () => {
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
        // Create test records
        accountRecord = {
            id: 'account-retrieve-001',
            name: 'John Retrieve Test',
            email: 'john.retrieve@example.com',
            username: 'jretrieve',
            account_type: 'personal',
            balance: 250.50,
            is_active: true,
            is_verified: true,
            preferences: {
                notifications: true,
                theme: 'dark',
                language: 'en'
            },
            metadata: {
                source: 'api_test',
                created_by: 'test_suite'
            }
        };
        contactRecord = {
            id: 'contact-retrieve-001',
            first_name: 'Alice',
            last_name: 'Retrieve',
            email: 'alice.retrieve@acme.com',
            company: 'Acme Corp',
            job_title: 'Lead Engineer',
            contact_type: 'employee',
            priority: 'high',
            is_active: true,
            account_id: 'account-retrieve-001',
            tags: ['technical', 'decision-maker', 'key-contact'],
            address: {
                street: '123 Main St',
                city: 'San Francisco',
                state: 'CA',
                postal_code: '94105',
                country: 'US'
            }
        };
        await testContext.database.createOne('account', accountRecord);
        await testContext.database.createOne('contact', contactRecord);
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('Complete Record Retrieval', () => {
        test('should retrieve complete account record as JSON', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.data.content).toBeDefined();
            expect(result.data.content.id).toBe('account-retrieve-001');
            expect(result.data.content.name).toBe('John Retrieve Test');
            expect(result.data.content.email).toBe('john.retrieve@example.com');
            expect(result.data.content.preferences).toEqual({
                notifications: true,
                theme: 'dark',
                language: 'en'
            });
        });
        test('should retrieve contact record with nested objects', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content.first_name).toBe('Alice');
            expect(result.data.content.last_name).toBe('Retrieve');
            expect(result.data.content.tags).toEqual(['technical', 'decision-maker', 'key-contact']);
            expect(result.data.content.address).toEqual({
                street: '123 Main St',
                city: 'San Francisco',
                state: 'CA',
                postal_code: '94105',
                country: 'US'
            });
        });
        test('should provide accurate FTP metadata', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const result = await response.json();
            const metadata = result.data.ftp_metadata;
            expect(metadata.size).toBeGreaterThan(0);
            expect(metadata.modified_time).toMatch(/^\d{14}$/); // FTP timestamp
            expect(metadata.content_type).toBe('application/json');
            expect(metadata.can_resume).toBe(false); // No partial content
            expect(metadata.etag).toBeDefined();
        });
    });
    describe('Field-Level Retrieval', () => {
        test('should retrieve individual string fields', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/email',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toBe('john.retrieve@example.com');
            expect(result.data.ftp_metadata.content_type).toBe('text/plain');
        });
        test('should retrieve numeric fields', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/balance',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toBe(250.50);
        });
        test('should retrieve boolean fields', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/is_verified',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toBe(true);
        });
        test('should retrieve object fields as JSON', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/preferences',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toEqual({
                notifications: true,
                theme: 'dark',
                language: 'en'
            });
        });
        test('should retrieve array fields', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-retrieve-001/tags',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toEqual(['technical', 'decision-maker', 'key-contact']);
        });
    });
    describe('Resume and Partial Transfer Support', () => {
        test('should support partial content with start_offset', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 10,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            // Should have smaller content due to offset
            expect(result.data.ftp_metadata.can_resume).toBe(true);
        });
        test('should support max_bytes limitation', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        max_bytes: 100,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.ftp_metadata.size).toBeLessThanOrEqual(100);
            expect(result.data.ftp_metadata.can_resume).toBe(true);
        });
        test('should handle binary vs ASCII mode', async () => {
            const binaryResponse = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: true,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const asciiResponse = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(binaryResponse.status).toBe(200);
            expect(asciiResponse.status).toBe(200);
            const binaryResult = await binaryResponse.json();
            const asciiResult = await asciiResponse.json();
            // Content should be the same, but format may differ
            expect(binaryResult.data.content.id).toBe(asciiResult.data.content.id);
        });
    });
    describe('Format Options', () => {
        test('should support JSON format', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const result = await response.json();
            expect(result.data.ftp_metadata.content_type).toBe('application/json');
            expect(typeof result.data.content).toBe('object');
        });
        test('should support raw format for field access', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/name',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            const result = await response.json();
            expect(result.data.content).toBe('John Retrieve Test');
            expect(result.data.ftp_metadata.content_type).toBe('text/plain');
        });
    });
    describe('Error Handling', () => {
        test('should handle non-existent record', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/nonexistent-record.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(500);
        });
        test('should handle non-existent field', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/nonexistent_field',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            expect(response.status).toBe(500);
        });
        test('should handle non-existent schema', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/nonexistent/record-123.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(500);
        });
        test('should handle invalid path formats', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/invalid/path',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(500);
        });
        test('should require authentication', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                    // No Authorization header
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(401);
        });
    });
    describe('Content Type Detection', () => {
        test('should detect email field content type', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/email',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            const result = await response.json();
            expect(result.data.ftp_metadata.content_type).toBe('text/plain');
        });
        test('should handle JSON field access', async () => {
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-retrieve-001/address',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const result = await response.json();
            expect(result.data.content).toEqual({
                street: '123 Main St',
                city: 'San Francisco',
                state: 'CA',
                postal_code: '94105',
                country: 'US'
            });
        });
    });
    describe('Performance and Edge Cases', () => {
        test('should handle large field content', async () => {
            // Update account with large metadata
            const largeMetadata = {
                large_text: 'x'.repeat(5000),
                large_array: Array.from({ length: 100 }, (_, i) => `item-${i}`),
                nested_object: {
                    level1: {
                        level2: {
                            level3: 'deep value'
                        }
                    }
                }
            };
            await testContext.database.updateOne('account', 'account-retrieve-001', {
                metadata: largeMetadata
            });
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001/metadata',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content.large_text).toHaveLength(5000);
            expect(result.data.content.large_array).toHaveLength(100);
            expect(result.data.ftp_metadata.size).toBeGreaterThan(5000);
        });
        test('should handle null field values', async () => {
            // Create account with null optional field
            const accountWithNulls = {
                id: 'account-nulls-001',
                name: 'Null Test',
                email: 'null.test@example.com',
                username: 'nulltest',
                account_type: 'trial',
                credit_limit: null, // Null optional field
                last_login: null // Null optional field
            };
            await testContext.database.createOne('account', accountWithNulls);
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-nulls-001/credit_limit',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toBeNull();
        });
        test('should handle empty string fields', async () => {
            // Update contact with empty optional field
            await testContext.database.updateOne('contact', 'contact-retrieve-001', {
                notes: ''
            });
            const response = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/contact/contact-retrieve-001/notes',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'raw'
                    }
                })
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.data.content).toBe('');
            expect(result.data.ftp_metadata.size).toBe(0);
        });
    });
    describe('ETag and Caching Support', () => {
        test('should generate consistent ETags', async () => {
            const response1 = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const response2 = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const result1 = await response1.json();
            const result2 = await response2.json();
            // ETags should be the same for identical content
            expect(result1.data.ftp_metadata.etag).toBe(result2.data.ftp_metadata.etag);
        });
        test('should change ETag when content changes', async () => {
            // Get initial ETag
            const initialResponse = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const initialResult = await initialResponse.json();
            const initialEtag = initialResult.data.ftp_metadata.etag;
            // Update the record
            await testContext.database.updateOne('account', 'account-retrieve-001', {
                balance: 999.99
            });
            // Get new ETag
            const updatedResponse = await fetch('http://localhost:9001/ftp/retrieve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify({
                    path: '/data/account/account-retrieve-001.json',
                    ftp_options: {
                        binary_mode: false,
                        start_offset: 0,
                        format: 'json'
                    }
                })
            });
            const updatedResult = await updatedResponse.json();
            const updatedEtag = updatedResult.data.ftp_metadata.etag;
            // ETags should be different
            expect(updatedEtag).not.toBe(initialEtag);
            expect(updatedResult.data.content.balance).toBe(999.99);
        });
    });
});
//# sourceMappingURL=ftp-retrieve.test.js.map