/**
 * Meta API Tests - Schema Operations
 * 
 * Tests the Meta API YAML workflow using Metabase class:
 * 1. Create schema from YAML (metabase.createOne)
 * 2. Select schema as YAML (metabase.selectOne) 
 * 3. Delete schema (metabase.deleteOne)
 * 
 * Equivalent to test/20-meta-api/ bash tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestTenant, createTestContext, type TestTenantManager, type TestContext } from '@spec/helpers/test-tenant.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

describe('20-meta-api: Schema Operations', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  // Test data - load from existing test schemas
  let accountYaml: string;
  let contactYaml: string;

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    
    if (!tenantManager.tenant) {
      throw new Error('Failed to create test tenant for meta-api tests');
    }

    // Create test context with authentication
    testContext = await createTestContext(tenantManager.tenant, 'root');

    // Load test YAML schemas
    const schemaDir = join(process.cwd(), 'test/schemas');
    accountYaml = readFileSync(join(schemaDir, 'account.yaml'), 'utf8');
    contactYaml = readFileSync(join(schemaDir, 'contact.yaml'), 'utf8');
  });

  afterAll(async () => {
    // Cleanup tenant
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  describe('Schema Creation', () => {
    test('should create account schema from YAML successfully', async () => {
      console.log('🔧 Creating account schema from YAML');
      
      const result = await testContext.metabase.createOne('account', accountYaml);
      
      expect(result).toBeDefined();
      
      // Should return the created schema information
      expect(result.name).toBe('account');
      expect(result.created).toBe(true);
      
      console.log('✅ Account schema created successfully');
    }, 15000);

    test('should create contact schema from YAML successfully', async () => {
      console.log('🔧 Creating contact schema from YAML');
      
      const result = await testContext.metabase.createOne('contact', contactYaml);
      
      expect(result).toBeDefined();
      expect(result.name).toBe('contact');
      expect(result.created).toBe(true);
      
      console.log('✅ Contact schema created successfully');
    }, 15000);
  });

  describe('Schema Retrieval', () => {
    test('should retrieve account schema as YAML', async () => {
      console.log('🔍 Retrieving account schema as YAML');
      
      const retrievedYaml = await testContext.metabase.selectOne('account');
      
      expect(retrievedYaml).toBeDefined();
      expect(typeof retrievedYaml).toBe('string');
      expect(retrievedYaml.length).toBeGreaterThan(0);
      
      // Parse both YAML documents to compare functionally
      const originalSchema = yaml.load(accountYaml) as any;
      const retrievedSchema = yaml.load(retrievedYaml) as any;
      
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
      
      console.log('✅ Account schema retrieved and validated');
    }, 10000);

    test('should retrieve contact schema as YAML', async () => {
      console.log('🔍 Retrieving contact schema as YAML');
      
      const retrievedYaml = await testContext.metabase.selectOne('contact');
      
      expect(retrievedYaml).toBeDefined();
      expect(typeof retrievedYaml).toBe('string');
      
      // Parse and validate structure
      const retrievedSchema = yaml.load(retrievedYaml) as any;
      expect(retrievedSchema.title).toBeDefined();
      expect(retrievedSchema.type).toBe('object');
      expect(retrievedSchema.properties).toBeDefined();
      
      console.log('✅ Contact schema retrieved and validated');
    }, 10000);
  });

  describe('Schema Create + Select Workflow', () => {
    test('should create and immediately select custom schema', async () => {
      const customSchemaName = 'test-workflow';
      const customYaml = `
title: Test Workflow Schema
description: Custom schema for testing create-select workflow
type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 100
    description: Test item name
  active:
    type: boolean
    default: true
    description: Whether item is active
  category:
    type: string
    enum: ["test", "demo", "production"]
    default: "test"
    description: Item category
required:
  - name
additionalProperties: false
`;

      console.log('🔧 Testing create + select workflow');
      
      // Create the schema
      const createResult = await testContext.metabase.createOne(customSchemaName, customYaml.trim());
      expect(createResult).toBeDefined();
      expect(createResult.name).toBe(customSchemaName);
      
      // Immediately select it back
      const retrievedYaml = await testContext.metabase.selectOne(customSchemaName);
      expect(retrievedYaml).toBeDefined();
      
      // Parse and verify functional equivalence
      const originalSchema = yaml.load(customYaml.trim()) as any;
      const retrievedSchema = yaml.load(retrievedYaml) as any;
      
      expect(retrievedSchema.title).toBe(originalSchema.title);
      expect(retrievedSchema.type).toBe(originalSchema.type);
      expect(retrievedSchema.required).toEqual(expect.arrayContaining(originalSchema.required));
      expect(retrievedSchema.properties.name).toBeDefined();
      expect(retrievedSchema.properties.active).toBeDefined();
      expect(retrievedSchema.properties.category).toBeDefined();
      
      console.log('✅ Create + select workflow validated');
    }, 15000);
  });

  describe('Schema Deletion', () => {
    test('should delete schema successfully', async () => {
      const schemaToDelete = 'test-workflow';
      
      console.log(`🗑️  Deleting schema: ${schemaToDelete}`);
      
      const deleteResult = await testContext.metabase.deleteOne(schemaToDelete);
      
      expect(deleteResult).toBeDefined();
      
      console.log('✅ Schema deleted successfully');
    }, 10000);

    test('should not be able to select deleted schema', async () => {
      const deletedSchema = 'test-workflow';
      
      console.log(`🔍 Verifying deleted schema cannot be selected: ${deletedSchema}`);
      
      // Attempting to select deleted schema should fail
      await expect(
        testContext.metabase.selectOne(deletedSchema)
      ).rejects.toThrow();
      
      console.log('✅ Deleted schema correctly inaccessible');
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

      console.log('🔧 Testing create + delete workflow');
      
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
      
      console.log('✅ Create + delete workflow validated');
    }, 15000);
  });
});