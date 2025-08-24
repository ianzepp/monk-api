/**
 * Infrastructure Tests - Basic Connectivity
 * 
 * Tests basic database and system connectivity using TypeScript classes
 * Equivalent to tests/10-connection/basic-ping-test.sh
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { 
  createTestTenant, 
  createTestSystemContext, 
  testDatabaseConnectivity, 
  testMetabaseConnectivity,
  type TestTenantManager,
  type TestSystemContext 
} from '../helpers/test-tenant.js';

describe('05-infrastructure: Basic Connectivity', () => {
  let tenantManager: TestTenantManager;
  let systemContext: TestSystemContext;

  beforeAll(async () => {
    // Create fresh tenant for this test suite
    tenantManager = await createTestTenant();
    
    if (!tenantManager.tenant) {
      throw new Error('Failed to create test tenant for connectivity tests');
    }

    // Create system context with authentication
    systemContext = await createTestSystemContext(tenantManager.tenant, 'root');
  });

  afterAll(async () => {
    // Cleanup tenant
    if (tenantManager) {
      await tenantManager.cleanup();
    }
  });

  describe('Database Connectivity', () => {
    test('should connect to tenant database successfully', async () => {
      const isConnected = await testDatabaseConnectivity(systemContext.database);
      expect(isConnected).toBe(true);
    }, 10000);

    test('should have correct tenant context', async () => {
      // Verify tenant database follows naming convention
      expect(systemContext.tenant.database).toMatch(/^monk-api\$test-\d+-[a-f0-9]+$/);
      expect(systemContext.tenant.name).toMatch(/^test-\d+-[a-f0-9]+$/);
      expect(systemContext.tenant.host).toBe('localhost');
      
      // Verify system context is properly configured
      expect(systemContext.system).toBeDefined();
      expect(systemContext.database).toBeDefined();
      expect(systemContext.metabase).toBeDefined();
    }, 5000);

    test('should be able to query schema table', async () => {
      // Test direct database access
      const schemas = await systemContext.database.selectAny('schema');
      
      expect(schemas).toBeDefined();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThanOrEqual(1); // Should have at least the self-reference schema
    }, 5000);
  });

  describe('Metabase Connectivity', () => {
    test('should connect to metabase successfully', async () => {
      const isConnected = await testMetabaseConnectivity(systemContext.metabase);
      expect(isConnected).toBe(true);
    }, 10000);

    test('should retrieve schema definition as YAML', async () => {
      const schemaYaml = await systemContext.metabase.selectOne('schema');
      
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
      expect(systemContext.system).toBeDefined();
      
      // Should be able to get user info which contains tenant information
      const userInfo = systemContext.system.getUser();
      expect(userInfo.tenant).toBe(systemContext.tenant.name);
    }, 5000);

    test('should have authenticated user context', async () => {
      expect(systemContext.auth).toBeDefined();
      
      // Should be able to get user info (implicitly tests auth)
      const userInfo = systemContext.system.getUser();
      expect(userInfo).toBeDefined();
      expect(userInfo.id).toBeDefined();
      expect(userInfo.role).toBe('root');
      expect(userInfo.tenant).toBe(systemContext.tenant.name);
    }, 5000);
  });
});