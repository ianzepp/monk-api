/**
 * Infrastructure Tests - Basic Connectivity
 * 
 * Tests basic database and system connectivity using TypeScript classes
 * Equivalent to test/10-connection/basic-ping-test.sh
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { 
  createTestTenant, 
  createTestContext, 
  testDatabaseConnectivity, 
  testMetabaseConnectivity,
  type TestTenantManager,
  type TestContext 
} from '../helpers/test-tenant.js';

describe('05-infrastructure: Basic Connectivity', () => {
  let tenantManager: TestTenantManager;
  let testContext: TestContext;

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    
    if (!tenantManager.tenant) {
      throw new Error('Failed to create test tenant for connectivity tests');
    }

    // Create test context with authentication
    testContext = await createTestContext(tenantManager.tenant, 'root');
  });

  afterAll(async () => {
    // Cleanup tenant
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  describe('Database Connectivity', () => {
    test('should connect to tenant database successfully', async () => {
      const isConnected = await testDatabaseConnectivity(testContext.database);
      expect(isConnected).toBe(true);
    }, 10000);

    test('should have correct tenant context', async () => {
      // Verify tenant database follows naming convention
      expect(testContext.tenant.database).toMatch(/^monk-api\$test-\d+-[a-f0-9]+$/);
      expect(testContext.tenant.name).toMatch(/^test-\d+-[a-f0-9]+$/);
      expect(testContext.tenant.host).toBe('localhost');
      
      // Verify test context is properly configured
      expect(testContext.system).toBeDefined();
      expect(testContext.database).toBeDefined();
      expect(testContext.metabase).toBeDefined();
    }, 5000);

    test('should be able to query schema table', async () => {
      // Test direct database access
      const schemas = await testContext.database.selectAny('schema');
      
      expect(schemas).toBeDefined();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThanOrEqual(1); // Should have at least the self-reference schema
    }, 5000);
  });

  describe('Metabase Connectivity', () => {
    test('should connect to metabase successfully', async () => {
      const isConnected = await testMetabaseConnectivity(testContext.metabase);
      expect(isConnected).toBe(true);
    }, 10000);

    test('should retrieve schema definition as YAML', async () => {
      const schemaYaml = await testContext.metabase.selectOne('schema');
      
      expect(schemaYaml).toBeDefined();
      expect(typeof schemaYaml).toBe('string');
      expect(schemaYaml.length).toBeGreaterThan(0);
      
      // Should be valid YAML content
      expect(schemaYaml).toContain('title:');
      expect(schemaYaml).toContain('properties:');
    }, 5000);
  });

  describe('Authentication Context', () => {
    test('should have valid system context', async () => {
      expect(testContext.system).toBeDefined();
      
      // Should be able to get user info which contains tenant information
      const userInfo = testContext.system.getUser();
      expect(userInfo.tenant).toBe(testContext.tenant.name);
    }, 5000);

    test('should have authenticated user context', async () => {
      expect(testContext.tenantService).toBeDefined();
      
      // Should be able to get user info (implicitly tests auth)
      const userInfo = testContext.system.getUser();
      expect(userInfo).toBeDefined();
      expect(userInfo.id).toBeDefined();
      expect(userInfo.role).toBe('root');
      expect(userInfo.tenant).toBe(testContext.tenant.name);
    }, 5000);
  });
});