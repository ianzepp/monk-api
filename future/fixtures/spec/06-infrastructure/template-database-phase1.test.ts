/**
 * Template Database Phase 1 Tests
 *
 * Tests the core template database infrastructure for fast test setup
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { TemplateDatabase } from '@src/lib/fixtures/template-database.js';
import { createTestContextWithTemplate } from '@spec/helpers/test-tenant.js';

describe('Template Database Phase 1', () => {
    // Clean up any existing basic template before and after tests
    beforeAll(async () => {
        try {
            await TemplateDatabase.dropTemplate('basic');
        } catch (error) {
            // Template might not exist - that's fine
        }
    });

    afterAll(async () => {
        try {
            await TemplateDatabase.dropTemplate('basic');
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    test('should create template database', async () => {
        const templateDbName = await TemplateDatabase.createTemplateDatabase('basic');

        expect(templateDbName).toBe('test_template_basic');
        expect(await TemplateDatabase.databaseExists(templateDbName)).toBe(true);
    });

    test('should list available templates', async () => {
        // Ensure basic template exists
        await TemplateDatabase.createTemplateDatabase('basic');

        const templates = await TemplateDatabase.listTemplates();

        expect(templates).toContain('basic');
        expect(Array.isArray(templates)).toBe(true);
    });

    test('should create tenant from template (fast cloning)', async () => {
        // Ensure template exists
        await TemplateDatabase.createTemplateDatabase('basic');

        const tenant = await TemplateDatabase.createTenantFromTemplate('test-clone-123', 'basic');

        expect(tenant.name).toBe('test-clone-123');
        expect(tenant.database).toContain('test_clone_123');
        expect(tenant.host).toBe('localhost');

        // Verify the cloned database exists
        expect(await TemplateDatabase.databaseExists(tenant.database)).toBe(true);

        // Clean up the test tenant database
        await TemplateDatabase.dropDatabase(tenant.database);
    });

    test('should build basic template', async () => {
        await TemplateDatabase.buildBasicTemplate();

        const templates = await TemplateDatabase.listTemplates();
        expect(templates).toContain('basic');
    });

    test('should create test context with template (integration)', async () => {
        // This tests the full integration with test helpers
        await TemplateDatabase.buildBasicTemplate();

        const testContext = await createTestContextWithTemplate('basic');

        expect(testContext.templateName).toBe('basic');
        expect(testContext.tenant).toBeDefined();
        expect(testContext.database).toBeDefined();
        expect(testContext.metabase).toBeDefined();
        expect(testContext.jwtToken).toBeDefined();
        expect(typeof testContext.jwtToken).toBe('string');
        expect(testContext.jwtToken.length).toBeGreaterThan(0);

        // Verify we can query the database
        const schemas = await testContext.database.selectAny('schemas');
        expect(Array.isArray(schemas)).toBe(true);
    });

    test('should handle template that does not exist', async () => {
        await expect(TemplateDatabase.createTenantFromTemplate('test-fail', 'nonexistent')).rejects.toThrow('Template database');
    });

    test('should clean templates by pattern', async () => {
        // Create a test template
        await TemplateDatabase.createTemplateDatabase('test-pattern');

        // Verify it exists
        let templates = await TemplateDatabase.listTemplates();
        expect(templates).toContain('test-pattern');

        // Clean by pattern
        await TemplateDatabase.cleanTemplates('pattern');

        // Verify it's gone
        templates = await TemplateDatabase.listTemplates();
        expect(templates).not.toContain('test-pattern');
    });
});
