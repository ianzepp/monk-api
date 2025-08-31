/**
 * Meta API Tests - Schema Operations
 * 
 * Tests the Meta API JSON workflow using Metabase class:
 * 1. Create schema from JSON (metabase.createOne)
 * 2. Select schema as JSON (metabase.selectOne) 
 * 3. Delete schema (metabase.deleteOne)
 * 
 * Equivalent to test/20-meta-api/ bash tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('20-meta-api: Schema Operations', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  // Test data - load from existing test schemas
  let accountJson: any;
  let contactJson: any;

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    
    if (!tenantManager.tenant) {
      throw new Error('Failed to create test tenant for meta-api tests');
    }

    // Create test context with authentication
    testContext = await createTestContext(tenantManager.tenant, 'root');

    // Load test JSON schemas
    const schemaDir = join(process.cwd(), 'spec/fixtures/schema');
    accountJson = JSON.parse(readFileSync(join(schemaDir, 'account.json'), 'utf8'));
    contactJson = JSON.parse(readFileSync(join(schemaDir, 'contact.json'), 'utf8'));
  });

  afterAll(async () => {
    // Cleanup tenant
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  describe('Schema Creation', () => {
    test('should create account schema from JSON successfully', async () => {
      logger.info('🔧 Creating account schema from JSON');
      
      const result = await testContext.metabase.createOne('account', accountJson);
      
      expect(result).toBeDefined();
      
      // Should return the created schema information
      expect(result.name).toBe('account');
      expect(result.created).toBe(true);
      
      logger.info('✅ Account schema created successfully');
    }, 15000);

    test('should create contact schema from JSON successfully', async () => {
      logger.info('🔧 Creating contact schema from JSON');
      
      const result = await testContext.metabase.createOne('contact', contactJson);
      
      expect(result).toBeDefined();
      expect(result.name).toBe('contact');
      expect(result.created).toBe(true);
      
      logger.info('✅ Contact schema created successfully');
    }, 15000);
  });

  describe('Schema Retrieval', () => {
    test('should retrieve account schema as JSON', async () => {
      logger.info('🔍 Retrieving account schema as JSON');
      
      const retrievedJson = await testContext.metabase.selectOne('account');
      
      expect(retrievedJson).toBeDefined();
      expect(typeof retrievedJson).toBe('string');
      expect(retrievedJson.length).toBeGreaterThan(0);
      
      // Parse JSON documents to compare functionally
      const originalSchema = accountJson;
      const retrievedSchema = JSON.parse(retrievedJson);
      
      // Verify functional equivalence (key properties should match)
      expect(retrievedSchema.title).toBe(originalSchema.title);
      expect(retrievedSchema.type).toBe(originalSchema.type);
      expect(retrievedSchema.properties).toBeDefined();
      expect(retrievedSchema.required).toBeDefined();
      
      // Check that required fields match
      expect(retrievedSchema.required).toEqual(expect.arrayContaining(originalSchema.required));
      
      // Check that key properties exist
      expect(retrievedSchema.properties.name).toBeDefined();
      expect(retrievedSchema.properties.email).toBeDefined();
      expect(retrievedSchema.properties.username).toBeDefined();
      
      logger.info('✅ Account schema retrieved and validated');
    }, 10000);

    test('should retrieve contact schema as JSON', async () => {
      logger.info('🔍 Retrieving contact schema as JSON');
      
      const retrievedJson = await testContext.metabase.selectOne('contact');
      
      expect(retrievedJson).toBeDefined();
      expect(typeof retrievedJson).toBe('string');
      
      // Parse and validate structure
      const retrievedSchema = JSON.parse(retrievedJson);
      expect(retrievedSchema.title).toBeDefined();
      expect(retrievedSchema.type).toBe('object');
      expect(retrievedSchema.properties).toBeDefined();
      
      logger.info('✅ Contact schema retrieved and validated');
    }, 10000);
  });

  describe('Schema Create + Select Workflow', () => {
    test('should create and immediately select custom schema', async () => {
      const customSchemaName = 'test-workflow';
      const customJson = {
        title: "Test Workflow Schema",
        description: "Custom schema for testing create-select workflow",
        type: "object",
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            description: "Test item name"
          },
          active: {
            type: "boolean",
            default: true,
            description: "Whether item is active"
          },
          category: {
            type: "string",
            enum: ["test", "demo", "production"],
            default: "test",
            description: "Item category"
          }
        },
        required: ["name"],
        additionalProperties: false
      };

      logger.info('🔧 Testing create + select workflow');
      
      // Create the schema
      const createResult = await testContext.metabase.createOne(customSchemaName, customJson);
      expect(createResult).toBeDefined();
      expect(createResult.name).toBe(customSchemaName);
      
      // Immediately select it back
      const retrievedJson = await testContext.metabase.selectOne(customSchemaName);
      expect(retrievedJson).toBeDefined();
      
      // Parse and verify functional equivalence
      const originalSchema = customJson;
      const retrievedSchema = JSON.parse(retrievedJson);
      
      expect(retrievedSchema.title).toBe(originalSchema.title);
      expect(retrievedSchema.type).toBe(originalSchema.type);
      expect(retrievedSchema.required).toEqual(expect.arrayContaining(originalSchema.required));
      expect(retrievedSchema.properties.name).toBeDefined();
      expect(retrievedSchema.properties.active).toBeDefined();
      expect(retrievedSchema.properties.category).toBeDefined();
      
      logger.info('✅ Create + select workflow validated');
    }, 15000);
  });

  describe('Schema Deletion', () => {
    test('should delete schema successfully', async () => {
      const schemaToDelete = 'test-workflow';
      
      logger.info(`🗑️  Deleting schema: ${schemaToDelete}`);
      
      const deleteResult = await testContext.metabase.deleteOne(schemaToDelete);
      
      expect(deleteResult).toBeDefined();
      
      logger.info('✅ Schema deleted successfully');
    }, 10000);

    test('should not be able to select deleted schema', async () => {
      const deletedSchema = 'test-workflow';
      
      logger.info(`🔍 Verifying deleted schema cannot be selected: ${deletedSchema}`);
      
      // Attempting to select deleted schema should fail
      await expect(
        testContext.metabase.selectOne(deletedSchema)
      ).rejects.toThrow();
      
      logger.info('✅ Deleted schema correctly inaccessible');
    }, 5000);
  });

  describe('Schema Create + Delete Workflow', () => {
    test('should create schema and then delete it', async () => {
      const tempSchemaName = 'temp-delete-test';
      const tempYaml = `
title: Temporary Delete Test Schema
description: Schema created specifically for deletion testing
type: object
properties:
  temp_value:
    type: string
    description: Temporary value
  temp_status:
    type: string
    enum: ["pending", "active", "deleted"]
    default: "pending"
    description: Temporary status
required:
  - temp_value
additionalProperties: false
`;

      logger.info('🔧 Testing create + delete workflow');
      
      // Create the temporary schema
      const createResult = await testContext.metabase.createOne(tempSchemaName, tempYaml.trim());
      expect(createResult).toBeDefined();
      expect(createResult.name).toBe(tempSchemaName);
      
      // Delete the schema
      const deleteResult = await testContext.metabase.deleteOne(tempSchemaName);
      expect(deleteResult).toBeDefined();
      
      // Verify it's gone by trying to select it
      await expect(
        testContext.metabase.selectOne(tempSchemaName)
      ).rejects.toThrow();
      
      logger.info('✅ Create + delete workflow validated');
    }, 15000);
  });
});