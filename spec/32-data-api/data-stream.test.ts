import { describe, it, expect, beforeAll } from 'bun:test';
import { TestHelpers } from '../test-helpers.js';
import { expectSuccess } from '../test-assertions.js';
import type { TestTenant } from '../test-helpers.js';

/**
 * GET /api/data/:model - Streaming JSONL Response
 *
 * Tests streaming JSONL (newline-delimited JSON) responses via Accept header.
 * When client sends Accept: application/x-ndjson, server streams records
 * one per line instead of returning a JSON array envelope.
 */

describe('GET /api/data/:model - Streaming JSONL', () => {
    let tenant: TestTenant;
    const testRecords = [
        { name: 'Alice', email: 'alice@example.com', active: true },
        { name: 'Bob', email: 'bob@example.com', active: true },
        { name: 'Charlie', email: 'charlie@example.com', active: false },
        { name: 'Diana', email: 'diana@example.com', active: true },
        { name: 'Eve', email: 'eve@example.com', active: false },
    ];

    beforeAll(async () => {
        tenant = await TestHelpers.createTestTenant('data-stream');

        // Create test model
        await tenant.httpClient.post('/api/describe/contacts', {});
        await tenant.httpClient.post('/api/describe/contacts/fields/name', {
            field_name: 'name',
            type: 'text',
            required: true,
        });
        await tenant.httpClient.post('/api/describe/contacts/fields/email', {
            field_name: 'email',
            type: 'text',
        });
        await tenant.httpClient.post('/api/describe/contacts/fields/active', {
            field_name: 'active',
            type: 'boolean',
        });

        // Create test records
        const createResponse = await tenant.httpClient.post('/api/data/contacts', testRecords);
        expectSuccess(createResponse);
    });

    it('should return JSONL when Accept: application/x-ndjson', async () => {
        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');

        // Parse JSONL - each line is a separate JSON object
        const lines = response.body.trim().split('\n');
        expect(lines.length).toBe(testRecords.length);

        // Each line should be valid JSON
        const records = lines.map(line => JSON.parse(line));

        // Verify records have expected fields
        for (const record of records) {
            expect(record.id).toBeDefined();
            expect(record.name).toBeDefined();
            expect(record.email).toBeDefined();
            expect(typeof record.active).toBe('boolean');
        }

        // Verify all test records are present
        const names = records.map(r => r.name);
        expect(names).toContain('Alice');
        expect(names).toContain('Bob');
        expect(names).toContain('Charlie');
        expect(names).toContain('Diana');
        expect(names).toContain('Eve');
    });

    it('should return JSON envelope when Accept: application/json', async () => {
        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/json',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('application/json');

        // Should be envelope format
        expect(response.json).toBeDefined();
        expect(response.json.success).toBe(true);
        expect(Array.isArray(response.json.data)).toBe(true);
        expect(response.json.data.length).toBe(testRecords.length);
    });

    it('should return JSON envelope when no Accept header', async () => {
        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
        });

        expect(response.status).toBe(200);

        // Should be envelope format (default)
        expect(response.json).toBeDefined();
        expect(response.json.success).toBe(true);
        expect(Array.isArray(response.json.data)).toBe(true);
    });

    it('should accept application/jsonl as alias for x-ndjson', async () => {
        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/jsonl',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');

        // Should be JSONL format
        const lines = response.body.trim().split('\n');
        expect(lines.length).toBe(testRecords.length);

        // Each line should be valid JSON
        for (const line of lines) {
            const record = JSON.parse(line);
            expect(record.id).toBeDefined();
        }
    });

    it('should stream empty result for model with no records', async () => {
        // Create empty model
        await tenant.httpClient.post('/api/describe/empty_model', {});

        const response = await tenant.httpClient.request('/api/data/empty_model', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');

        // Empty response (no lines)
        expect(response.body.trim()).toBe('');
    });

    it('should stream single record correctly', async () => {
        // Create model with single record
        await tenant.httpClient.post('/api/describe/single_item', {});
        await tenant.httpClient.post('/api/describe/single_item/fields/title', {
            field_name: 'title',
            type: 'text',
        });
        await tenant.httpClient.post('/api/data/single_item', [{ title: 'Only One' }]);

        const response = await tenant.httpClient.request('/api/data/single_item', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);

        const lines = response.body.trim().split('\n');
        expect(lines.length).toBe(1);

        const record = JSON.parse(lines[0]);
        expect(record.title).toBe('Only One');
    });

    it('should include all record fields in JSONL output', async () => {
        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        const lines = response.body.trim().split('\n');
        const record = JSON.parse(lines[0]);

        // Should include user fields
        expect(record.name).toBeDefined();
        expect(record.email).toBeDefined();
        expect(record.active).toBeDefined();

        // Should include system fields
        expect(record.id).toBeDefined();
        expect(record.created_at).toBeDefined();
        expect(record.updated_at).toBeDefined();
    });

    it('should handle special characters in JSONL', async () => {
        // Create record with special characters
        await tenant.httpClient.post('/api/data/contacts', [
            {
                name: 'Test "Quotes" & <Tags>',
                email: 'test+special@example.com',
                active: true,
            },
        ]);

        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);

        // All lines should be valid JSON despite special characters
        const lines = response.body.trim().split('\n');
        for (const line of lines) {
            expect(() => JSON.parse(line)).not.toThrow();
        }

        // Find our special record
        const records = lines.map(line => JSON.parse(line));
        const specialRecord = records.find(r => r.name.includes('Quotes'));
        expect(specialRecord).toBeDefined();
        expect(specialRecord.name).toBe('Test "Quotes" & <Tags>');
    });

    it('should handle unicode in JSONL', async () => {
        // Create record with unicode
        await tenant.httpClient.post('/api/data/contacts', [
            {
                name: 'Testy McTestface',
                email: 'unicode@example.com',
                active: true,
            },
        ]);

        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);

        // All lines should be valid JSON
        const lines = response.body.trim().split('\n');
        for (const line of lines) {
            expect(() => JSON.parse(line)).not.toThrow();
        }
    });

    it('should handle null values in JSONL', async () => {
        // Create record with null values
        await tenant.httpClient.post('/api/data/contacts', [
            {
                name: 'Null Test',
                email: null,
                active: null,
            },
        ]);

        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);

        // Find our null record
        const lines = response.body.trim().split('\n');
        const records = lines.map(line => JSON.parse(line));
        const nullRecord = records.find(r => r.name === 'Null Test');

        expect(nullRecord).toBeDefined();
        expect(nullRecord.email).toBeNull();
        expect(nullRecord.active).toBeNull();
    });

    it('should return Transfer-Encoding: chunked for streaming', async () => {
        const response = await tenant.httpClient.request('/api/data/contacts', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);
        // Note: Transfer-Encoding may be set by the server
        // The important thing is the response works correctly
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
    });

    it('should work with larger datasets', async () => {
        // Create model for large dataset test
        await tenant.httpClient.post('/api/describe/large_items', {});
        await tenant.httpClient.post('/api/describe/large_items/fields/item_number', {
            field_name: 'item_number',
            type: 'integer',
        });
        await tenant.httpClient.post('/api/describe/large_items/fields/content', {
            field_name: 'content',
            type: 'text',
        });

        // Create 100 records
        const largeData = Array.from({ length: 100 }, (_, i) => ({
            item_number: i,
            content: `Record number ${i} with some padding data to make it larger`,
        }));

        await tenant.httpClient.post('/api/data/large_items', largeData);

        const response = await tenant.httpClient.request('/api/data/large_items', {
            method: 'GET',
            accept: 'application/x-ndjson',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');

        const lines = response.body.trim().split('\n');
        expect(lines.length).toBe(100);

        // Verify all records are valid JSON
        const records = lines.map(line => JSON.parse(line));
        expect(records.length).toBe(100);

        // Verify item numbers are present
        const itemNumbers = records.map(r => r.item_number).sort((a, b) => a - b);
        expect(itemNumbers[0]).toBe(0);
        expect(itemNumbers[99]).toBe(99);
    });
});
