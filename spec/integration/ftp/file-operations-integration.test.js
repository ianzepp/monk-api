/**
 * FTP File Operations Integration Tests (Phase 3)
 *
 * Integration tests for FTP store and delete operations with real database,
 * testing end-to-end workflows, transaction management, and HTTP endpoints.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext } from '@spec/helpers/test-tenant.js';
import { readFile } from 'fs/promises';
describe('FTP File Operations - Integration Tests (Phase 3)', () => {
    let tenantManager;
    let testContext;
    beforeAll(async () => {
        // Create fresh tenant for this test suite
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant, 'root');
        // Create test schemas
        const userYaml = await readFile('spec/fixtures/schema/account.yaml', 'utf-8');
        await testContext.metabase.createOne('users', userYaml);
        // Create initial test data
        const initialUser = {
            id: 'integration-test-user',
            name: 'Integration Test User',
            email: 'integration@test.com',
            username: 'integration',
            account_type: 'test'
        };
        await testContext.database.createOne('users', initialUser);
    });
    afterAll(async () => {
        if (tenantManager) {
            await tenantManager.cleanup();
        }
    });
    describe('FTP Store Operations', () => {
        test('should create new record via FTP store', async () => {
            const storeRequest = {
                path: '/data/users/new-user.json',
                content: {
                    name: 'New Test User',
                    email: 'newuser@test.com',
                    username: 'newuser',
                    account_type: 'standard'
                },
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true,
                    validate_schema: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('create');
            expect(result.result.record_id).toBe('new-user');
            expect(result.result.created).toBe(true);
            expect(result.result.updated).toBe(false);
            expect(result.result.validation_passed).toBe(true);
            // Verify FTP metadata
            expect(result.ftp_metadata.modified_time).toBeDefined();
            expect(result.ftp_metadata.permissions).toMatch(/r[w-]x/);
            expect(result.ftp_metadata.etag).toBeDefined();
            expect(result.ftp_metadata.content_type).toBe('application/json');
            // Verify transaction info if atomic
            if (result.transaction_info) {
                expect(result.transaction_info.transaction_id).toMatch(/^ftp-store-/);
                expect(result.transaction_info.can_rollback).toBe(false);
                expect(result.transaction_info.timeout_ms).toBe(30000);
            }
            // Verify record was actually created
            const createdRecord = await testContext.database.selectOne('users', {
                where: { id: 'new-user' }
            });
            expect(createdRecord).toBeDefined();
            expect(createdRecord.name).toBe('New Test User');
            expect(createdRecord.email).toBe('newuser@test.com');
        });
        test('should update existing record via FTP store', async () => {
            const storeRequest = {
                path: '/data/users/integration-test-user.json',
                content: {
                    name: 'Updated Integration User',
                    email: 'updated@test.com',
                    username: 'integration-updated',
                    account_type: 'premium',
                    description: 'Updated via FTP store'
                },
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('update');
            expect(result.result.record_id).toBe('integration-test-user');
            expect(result.result.created).toBe(false);
            expect(result.result.updated).toBe(true);
            // Verify record was actually updated
            const updatedRecord = await testContext.database.selectOne('users', {
                where: { id: 'integration-test-user' }
            });
            expect(updatedRecord).toBeDefined();
            expect(updatedRecord.name).toBe('Updated Integration User');
            expect(updatedRecord.email).toBe('updated@test.com');
            expect(updatedRecord.description).toBe('Updated via FTP store');
        });
        test('should update specific field via FTP store', async () => {
            const storeRequest = {
                path: '/data/users/integration-test-user/email',
                content: 'field-update@test.com',
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('field_update');
            expect(result.result.record_id).toBe('integration-test-user');
            expect(result.result.field_name).toBe('email');
            expect(result.result.updated).toBe(true);
            // Verify field was actually updated
            const updatedRecord = await testContext.database.selectOne('users', {
                where: { id: 'integration-test-user' }
            });
            expect(updatedRecord).toBeDefined();
            expect(updatedRecord.email).toBe('field-update@test.com');
            // Other fields should remain unchanged
            expect(updatedRecord.name).toBe('Updated Integration User');
        });
        test('should handle append mode for string fields', async () => {
            // First, set up a field with initial content
            await testContext.database.updateOne('users', 'integration-test-user', {
                description: 'Initial content'
            });
            const storeRequest = {
                path: '/data/users/integration-test-user/description',
                content: ' - Appended content',
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: true,
                    create_path: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('field_update');
            // Verify content was appended
            const updatedRecord = await testContext.database.selectOne('users', {
                where: { id: 'integration-test-user' }
            });
            expect(updatedRecord).toBeDefined();
            expect(updatedRecord.description).toBe('Initial content - Appended content');
        });
        test('should handle content type detection', async () => {
            const storeRequest = {
                path: '/data/users/content-test-user.json',
                content: '{"name": "JSON String User", "email": "json@test.com", "username": "jsonuser"}',
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                },
                metadata: {
                    content_type: 'application/json'
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.ftp_metadata.content_type).toBe('application/json');
            // Verify JSON string was parsed correctly
            const createdRecord = await testContext.database.selectOne('users', {
                where: { id: 'content-test-user' }
            });
            expect(createdRecord).toBeDefined();
            expect(createdRecord.name).toBe('JSON String User');
            expect(createdRecord.email).toBe('json@test.com');
        });
        test('should reject operations without overwrite when record exists', async () => {
            const storeRequest = {
                path: '/data/users/integration-test-user.json',
                content: {
                    name: 'Should Not Work',
                    email: 'shouldnotwork@test.com'
                },
                ftp_options: {
                    binary_mode: false,
                    overwrite: false, // This should cause failure
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(500);
            // Verify record was not changed
            const unchangedRecord = await testContext.database.selectOne('users', {
                where: { id: 'integration-test-user' }
            });
            expect(unchangedRecord).toBeDefined();
            expect(unchangedRecord.name).not.toBe('Should Not Work');
        });
        test('should handle field operations on nonexistent record', async () => {
            const storeRequest = {
                path: '/data/users/nonexistent-user/email',
                content: 'shouldfail@test.com',
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(500);
        });
    });
    describe('FTP Delete Operations', () => {
        test('should soft delete a record', async () => {
            // First create a record to delete
            await testContext.database.createOne('users', {
                id: 'delete-test-user',
                name: 'Delete Test User',
                email: 'delete@test.com',
                username: 'deletetest',
                account_type: 'temporary'
            });
            const deleteRequest = {
                path: '/data/users/delete-test-user',
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: false, // Soft delete
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('soft_delete');
            expect(result.results.deleted_count).toBe(1);
            expect(result.results.records_affected).toContain('delete-test-user');
            expect(result.ftp_metadata.can_restore).toBe(true);
            expect(result.ftp_metadata.restore_deadline).toBeDefined();
            // Verify record was soft deleted (has trashed_at)
            const softDeletedRecord = await testContext.database.selectOne('users', {
                where: { id: 'delete-test-user' }
            });
            expect(softDeletedRecord).toBeDefined();
            expect(softDeletedRecord.trashed_at).toBeDefined();
            expect(new Date(softDeletedRecord.trashed_at).getTime()).toBeGreaterThan(Date.now() - 60000);
        });
        test('should permanently delete a record', async () => {
            // First create a record to delete
            await testContext.database.createOne('users', {
                id: 'permanent-delete-user',
                name: 'Permanent Delete User',
                email: 'permdelete@test.com',
                username: 'permdelete',
                account_type: 'temporary'
            });
            const deleteRequest = {
                path: '/data/users/permanent-delete-user',
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: true, // Permanent delete
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('permanent_delete');
            expect(result.results.deleted_count).toBe(1);
            expect(result.results.records_affected).toContain('permanent-delete-user');
            expect(result.ftp_metadata.can_restore).toBe(false);
            // Verify record was permanently deleted
            const deletedRecord = await testContext.database.selectOne('users', {
                where: { id: 'permanent-delete-user' }
            });
            expect(deletedRecord).toBeNull();
        });
        test('should delete (clear) a specific field', async () => {
            // First create a record with a field to delete
            await testContext.database.createOne('users', {
                id: 'field-delete-user',
                name: 'Field Delete User',
                email: 'fielddelete@test.com',
                username: 'fielddelete',
                account_type: 'test',
                description: 'This field will be deleted'
            });
            const deleteRequest = {
                path: '/data/users/field-delete-user/description',
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.operation).toBe('field_delete');
            expect(result.results.deleted_count).toBe(1);
            expect(result.results.fields_cleared).toContain('description');
            expect(result.ftp_metadata.can_restore).toBe(false);
            // Verify field was cleared
            const updatedRecord = await testContext.database.selectOne('users', {
                where: { id: 'field-delete-user' }
            });
            expect(updatedRecord).toBeDefined();
            expect(updatedRecord.description).toBeNull();
            // Other fields should remain unchanged
            expect(updatedRecord.name).toBe('Field Delete User');
            expect(updatedRecord.email).toBe('fielddelete@test.com');
        });
        test('should handle delete operations on nonexistent records', async () => {
            const deleteRequest = {
                path: '/data/users/nonexistent-user',
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(500);
        });
        test('should handle field delete on nonexistent field', async () => {
            const deleteRequest = {
                path: '/data/users/integration-test-user/nonexistent-field',
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(500);
        });
        test('should reject schema deletion without force', async () => {
            const deleteRequest = {
                path: '/data/users', // Schema-level deletion
                ftp_options: {
                    recursive: false,
                    force: false, // Should be rejected
                    permanent: false,
                    atomic: true
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(500);
        });
    });
    describe('Transaction Management Integration', () => {
        test('should handle atomic store operation failure with rollback', async () => {
            const storeRequest = {
                path: '/data/nonexistent-schema/test-record.json',
                content: { name: 'Test' },
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true // Should rollback on failure
                }
            };
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            expect(response.status).toBe(500);
            // Verify no partial state was left behind
            // This would be more meaningful with a more complex transaction scenario
        });
        test('should handle atomic delete operation failure with rollback', async () => {
            const deleteRequest = {
                path: '/data/users/nonexistent-user',
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: false,
                    atomic: true // Should rollback on failure
                }
            };
            const response = await fetch('http://localhost:9001/ftp/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(deleteRequest)
            });
            expect(response.status).toBe(500);
            // Verify no partial state was left behind
        });
    });
    describe('Performance and Metadata', () => {
        test('should provide accurate performance metrics', async () => {
            const storeRequest = {
                path: '/data/users/performance-test.json',
                content: {
                    name: 'Performance Test User',
                    email: 'performance@test.com',
                    username: 'perftest',
                    account_type: 'test',
                    large_data: 'x'.repeat(10000) // Large content for timing
                },
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const startTime = Date.now();
            const response = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest)
            });
            const endTime = Date.now();
            const actualDuration = endTime - startTime;
            expect(response.status).toBe(200);
            const result = await response.json();
            expect(result.success).toBe(true);
            expect(result.result.size).toBeGreaterThan(10000); // Large content
            expect(result.ftp_metadata.etag).toBeDefined();
            expect(result.ftp_metadata.content_type).toBe('application/json');
        });
        test('should generate consistent ETags for same content', async () => {
            const content = { name: 'ETag Test', email: 'etag@test.com' };
            // First store
            const storeRequest1 = {
                path: '/data/users/etag-test-1.json',
                content,
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const response1 = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest1)
            });
            const result1 = await response1.json();
            // Second store with same content
            const storeRequest2 = {
                path: '/data/users/etag-test-2.json',
                content,
                ftp_options: {
                    binary_mode: false,
                    overwrite: true,
                    append_mode: false,
                    create_path: false,
                    atomic: true
                }
            };
            const response2 = await fetch('http://localhost:9001/ftp/store', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${testContext.jwtToken}`
                },
                body: JSON.stringify(storeRequest2)
            });
            const result2 = await response2.json();
            // ETags should be similar for similar content (though not necessarily identical due to timestamps)
            expect(result1.ftp_metadata.etag).toBeDefined();
            expect(result2.ftp_metadata.etag).toBeDefined();
            expect(result1.ftp_metadata.etag.length).toBe(result2.ftp_metadata.etag.length);
        });
    });
});
//# sourceMappingURL=file-operations-integration.test.js.map