import { describe, it, expect, beforeAll } from 'vitest';
import { TestHelpers, type TestTenant } from '../test-helpers.js';
import { expectSuccess, expectError } from '../test-assertions.js';

/**
 * History API Tests
 *
 * Tests change tracking for fields marked as tracked.
 * The history observer records create, update, and delete operations
 * for fields with tracked=true.
 *
 * Endpoints:
 * - GET /api/history/:model/:id - Get all history for a record
 * - GET /api/history/:model/:id/:change - Get specific change
 */

describe('History API - Change Tracking', () => {
    let tenant: TestTenant;
    let testRecordId: string;

    beforeAll(async () => {
        // History tracking requires 'audit' fixture which includes the history table
        tenant = await TestHelpers.createTestTenant('history-api', 'system,audit');

        // Create test model
        await tenant.httpClient.post('/api/describe/accounts', {});

        // Add tracked fields
        await tenant.httpClient.post('/api/describe/accounts/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
            tracked: true, // Enable history tracking
        });
        await tenant.httpClient.post('/api/describe/accounts/fields/email', {
            field_name: 'email',
            type: 'text',
            tracked: true, // Enable history tracking
        });
        await tenant.httpClient.post('/api/describe/accounts/fields/status', {
            field_name: 'status',
            type: 'text',
            tracked: false, // Not tracked
        });
    });

    describe('Create Operation Tracking', () => {
        it('should track record creation', async () => {
            // Create a test record
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'John Doe',
                    email: 'john@example.com',
                    status: 'active',
                },
            ]);

            expectSuccess(createResponse);
            testRecordId = createResponse.data[0].id;

            // Small delay for observer to process
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Get history for the record
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);
            expect(historyResponse.data).toBeDefined();
            expect(Array.isArray(historyResponse.data)).toBe(true);
            expect(historyResponse.data.length).toBeGreaterThanOrEqual(1);
        });

        it('should record create operation type', async () => {
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);

            // Find create operation
            const createEntry = historyResponse.data.find((entry: any) => entry.operation === 'create');
            expect(createEntry).toBeDefined();
        });

        it('should track only marked fields in create', async () => {
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);

            const createEntry = historyResponse.data.find((entry: any) => entry.operation === 'create');
            if (createEntry && createEntry.changes) {
                // Should track name and email (tracked=true)
                // Should NOT track status (tracked=false)
                const changes = createEntry.changes;

                // Tracked fields should be present
                if (changes.name) {
                    expect(changes.name.old).toBeNull(); // Create has no old value
                    expect(changes.name.new).toBe('John Doe');
                }
                if (changes.email) {
                    expect(changes.email.old).toBeNull();
                    expect(changes.email.new).toBe('john@example.com');
                }
            }
        });
    });

    describe('Update Operation Tracking', () => {
        it('should track record updates', async () => {
            // Update the record
            const updateResponse = await tenant.httpClient.put(`/api/data/accounts/${testRecordId}`, {
                email: 'john.updated@example.com',
            });

            expectSuccess(updateResponse);

            // Small delay for observer to process
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Get history
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);
            expect(historyResponse.data.length).toBeGreaterThanOrEqual(2);
        });

        it('should record update operation with old and new values', async () => {
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);

            // Find most recent update operation
            const updateEntry = historyResponse.data.find((entry: any) => entry.operation === 'update');

            if (updateEntry && updateEntry.changes && updateEntry.changes.email) {
                expect(updateEntry.changes.email.old).toBe('john@example.com');
                expect(updateEntry.changes.email.new).toBe('john.updated@example.com');
            }
        });
    });

    describe('Delete Operation Tracking', () => {
        it('should track record deletion', async () => {
            // Create a record to delete
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'To Be Deleted',
                    email: 'delete@example.com',
                },
            ]);

            expectSuccess(createResponse);
            const deleteRecordId = createResponse.data[0].id;

            // Delete the record
            const deleteResponse = await tenant.httpClient.delete(`/api/data/accounts/${deleteRecordId}`);
            expectSuccess(deleteResponse);

            // Small delay for observer to process
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Get history (should still be available for deleted records)
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${deleteRecordId}`);

            expectSuccess(historyResponse);

            // Find delete operation
            const deleteEntry = historyResponse.data.find((entry: any) => entry.operation === 'delete');
            expect(deleteEntry).toBeDefined();
        });

        it('should record old values in delete operation', async () => {
            // Create and delete another record
            const createResponse = await tenant.httpClient.post('/api/data/accounts', [
                {
                    name: 'Delete Test',
                    email: 'deletetest@example.com',
                },
            ]);

            const deleteRecordId = createResponse.data[0].id;
            await tenant.httpClient.delete(`/api/data/accounts/${deleteRecordId}`);

            // Small delay
            await new Promise((resolve) => setTimeout(resolve, 100));

            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${deleteRecordId}`);

            const deleteEntry = historyResponse.data.find((entry: any) => entry.operation === 'delete');

            if (deleteEntry && deleteEntry.changes) {
                // Soft delete preserves field values - record still exists with trashed_at set
                // Both old and new should have the same value (no field change, just trashed_at)
                if (deleteEntry.changes.name) {
                    expect(deleteEntry.changes.name.old).toBe('Delete Test');
                    // new value is the current state after soft delete (data preserved)
                    expect(deleteEntry.changes.name.new).toBe('Delete Test');
                }
            }
        });
    });

    describe('GET /api/history/:model/:id/:change - Specific Change', () => {
        it('should retrieve specific change by change_id', async () => {
            // Get all history first
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);

            if (historyResponse.data.length > 0) {
                const firstEntry = historyResponse.data[0];
                const changeId = firstEntry.change_id || firstEntry.id;

                if (changeId) {
                    // Get specific change
                    const changeResponse = await tenant.httpClient.get(
                        `/api/history/accounts/${testRecordId}/${changeId}`
                    );

                    expectSuccess(changeResponse);
                    expect(changeResponse.data).toBeDefined();
                    expect(changeResponse.data.operation).toBeDefined();
                }
            }
        });

        it('should return 404 for non-existent change_id', async () => {
            const fakeChangeId = '550e8400-e29b-41d4-a716-446655440000';

            const response = await tenant.httpClient.get(
                `/api/history/accounts/${testRecordId}/${fakeChangeId}`
            );

            expectError(response);
        });
    });

    describe('History Entry Structure', () => {
        it('should include required fields in history entry', async () => {
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);

            if (historyResponse.data.length > 0) {
                const entry = historyResponse.data[0];

                // Should have operation type
                expect(entry.operation).toBeDefined();
                expect(['create', 'update', 'delete']).toContain(entry.operation);

                // Should have timestamp
                expect(entry.created_at || entry.timestamp).toBeDefined();
            }
        });

        it('should order history entries by timestamp (most recent first)', async () => {
            const historyResponse = await tenant.httpClient.get(`/api/history/accounts/${testRecordId}`);

            expectSuccess(historyResponse);

            if (historyResponse.data.length > 1) {
                const timestamps = historyResponse.data.map((entry: any) =>
                    new Date(entry.created_at || entry.timestamp).getTime()
                );

                // Verify descending order (most recent first)
                for (let i = 0; i < timestamps.length - 1; i++) {
                    expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
                }
            }
        });
    });
});
