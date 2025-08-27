/**
 * Authentication Tests - Basic Auth Flow
 * 
 * Tests the core authentication workflow:
 * 1. Create tenant (TenantService.createTenant)
 * 2. Login as root (TenantService.login) 
 * 3. Verify connectivity (System/Database operations)
 * 
 * Equivalent to test/15-authentication/basic-auth-test.sh
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { TenantService } from '@lib/services/tenant.js';
import { randomBytes } from 'crypto';
import { DatabaseConnection } from '@lib/database-connection.js';
import { System } from '@lib/system.js';

describe('15-authentication: Basic Auth Flow', () => {
  let tenantName: string;
  let tenantInfo: any;

  beforeAll(() => {
    // Generate unique tenant name for this test suite
    const timestamp = Date.now();
    const randomId = randomBytes(4).toString('hex');
    tenantName = `auth-test-${timestamp}-${randomId}`;
  });

  afterAll(async () => {
    // Cleanup tenant after tests
    if (tenantName) {
      try {
        await TenantService.deleteTenant(tenantName, true);
        logger.info(`✅ Cleaned up test tenant: ${tenantName}`);
      } catch (error) {
        logger.warn(`⚠️  Failed to cleanup tenant ${tenantName}:`, error);
      }
    }
  });

  describe('Step 1: Tenant Creation', () => {
    test('should create new tenant successfully', async () => {
      logger.info(`🔧 Creating tenant: ${tenantName}`);
      
      tenantInfo = await TenantService.createTenant(tenantName, 'localhost');
      
      expect(tenantInfo).toBeDefined();
      expect(tenantInfo.name).toBe(tenantName);
      expect(tenantInfo.host).toBe('localhost');
      expect(tenantInfo.database).toMatch(/^monk-api\$/);
      
      logger.info(`✅ Tenant created: ${tenantInfo.database}`);
    }, 15000);

    test('should have tenant in tenant list', async () => {
      const tenants = await TenantService.listTenants();
      
      expect(Array.isArray(tenants)).toBe(true);
      
      const ourTenant = tenants.find(t => t.name === tenantName);
      expect(ourTenant).toBeDefined();
      expect(ourTenant?.database).toBe(tenantInfo.database);
    }, 5000);

    test('should be able to retrieve tenant info', async () => {
      const retrievedTenant = await TenantService.getTenant(tenantName);
      
      expect(retrievedTenant).toBeDefined();
      expect(retrievedTenant?.name).toBe(tenantName);
      expect(retrievedTenant?.database).toBe(tenantInfo.database);
    }, 5000);
  });

  describe('Step 2: Authentication', () => {
    test('should authenticate root user successfully', async () => {
      logger.info(`🔐 Authenticating as root in tenant: ${tenantName}`);
      
      const loginResult = await TenantService.login(tenantName, 'root');
      
      expect(loginResult).toBeDefined();
      expect(loginResult?.token).toBeDefined();
      expect(loginResult?.user).toBeDefined();
      
      expect(loginResult?.user.username).toBe('root');
      expect(loginResult?.user.tenant).toBe(tenantName);
      expect(loginResult?.user.access).toBe('root');
      expect(loginResult?.user.database).toBe(tenantInfo.database);
      
      logger.info(`✅ Authentication successful`);
    }, 10000);

    test('should generate valid JWT token', async () => {
      const loginResult = await TenantService.login(tenantName, 'root');
      
      expect(loginResult?.token).toBeDefined();
      expect(typeof loginResult?.token).toBe('string');
      expect(loginResult?.token.split('.').length).toBe(3); // JWT has 3 parts
      
      // Verify we can decode the token
      const decodedPayload = await TenantService.verifyToken(loginResult!.token);
      
      expect(decodedPayload).toBeDefined();
      expect(decodedPayload.tenant).toBe(tenantName);
      expect(decodedPayload.database).toBe(tenantInfo.database);
      expect(decodedPayload.access).toBe('root');
      expect(decodedPayload.iat).toBeDefined();
      expect(decodedPayload.exp).toBeDefined();
      expect(decodedPayload.exp).toBeGreaterThan(decodedPayload.iat);
    }, 5000);

    test('should fail authentication for non-existent user', async () => {
      const loginResult = await TenantService.login(tenantName, 'nonexistent');
      
      expect(loginResult).toBeNull();
    }, 5000);

    test('should fail authentication for non-existent tenant', async () => {
      const loginResult = await TenantService.login('nonexistent-tenant', 'root');
      
      expect(loginResult).toBeNull();
    }, 5000);
  });

  describe('Step 3: Authenticated Operations', () => {
    let authToken: string;
    let jwtPayload: any;

    beforeAll(async () => {
      // Get fresh auth token for this test group
      const loginResult = await TenantService.login(tenantName, 'root');
      expect(loginResult).toBeDefined();
      
      authToken = loginResult!.token;
      jwtPayload = await TenantService.verifyToken(authToken);
    });

    test('should validate JWT token correctly', async () => {
      const validatedPayload = await TenantService.validateToken(authToken);
      
      expect(validatedPayload).toBeDefined();
      expect(validatedPayload?.tenant).toBe(tenantName);
      expect(validatedPayload?.access).toBe('root');
    }, 5000);

    test('should reject invalid JWT token', async () => {
      const invalidPayload = await TenantService.validateToken('invalid.jwt.token');
      
      expect(invalidPayload).toBeNull();
    }, 5000);

    test('should be able to create authenticated system context', async () => {
      // This tests the equivalent of "monk ping" - authenticated connectivity
      
      // Create mock context similar to test-tenant.ts helper
      const mockContext = {
        env: {
          JWT_SECRET: 'test-jwt-secret-for-auth-tests',
          DATABASE_URL: 'postgresql://testuser@localhost:5432/test-db',
        },
        req: {
          header: (name: string) => `test-${Date.now()}`,
          method: 'GET',
          path: '/api/ping'
        },
        contextData: new Map(),
        get: function(key: string) {
          if (key === 'jwtPayload') {
            return jwtPayload;
          }
          return this.contextData.get(key);
        },
        set: function(key: string, value: any) {
          this.contextData.set(key, value);
        }
      };

      // Set up database context (simulates JWT middleware)
      DatabaseConnection.setDatabaseForRequest(mockContext as any, jwtPayload.database);
      
      // Create System instance (simulates authenticated request)
      const system = new System(mockContext as any);
      
      expect(system).toBeDefined();
      expect(system.database).toBeDefined();
      expect(system.metabase).toBeDefined();
      
      // Test authenticated database operation
      const schemas = await system.database.selectAny('schema');
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThanOrEqual(1);
      
      // Test user context
      const userInfo = system.getUser();
      expect(userInfo.tenant).toBe(tenantName);
      expect(userInfo.role).toBe('root');
    }, 10000);
  });
});