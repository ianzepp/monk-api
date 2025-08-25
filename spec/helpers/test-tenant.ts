/**
 * Test Tenant Management for Vitest
 * 
 * Creates fresh tenants using TenantManager and provides TypeScript-based
 * testing utilities without external CLI dependencies
 */

import { randomBytes } from 'crypto';
import { MonkEnv } from '../../src/lib/monk-env.js';
import { TenantService, TenantInfo } from '../../src/lib/services/tenant.js';
import { TemplateDatabase } from '../../src/lib/fixtures/template-database.js';
import { System } from '../../src/lib/system.js';
import { Database } from '../../src/lib/database.js';
import { Metabase } from '../../src/lib/metabase.js';
import { DatabaseManager } from '../../src/lib/database-manager.js';
import { Client } from 'pg';

export interface TestTenantManager {
  tenant: TenantInfo | null;
  cleanup(): Promise<void>;
}

export interface TestContext {
  tenant: TenantInfo;
  system: System;
  database: Database;
  metabase: Metabase;
  tenantService: typeof TenantService;
}

export interface TestContextWithTemplate extends TestContext {
  templateName: string;
  jwtToken: string;
}

/**
 * Create a fresh test tenant with unique name
 */
export async function createTestTenant(): Promise<TestTenantManager> {
  // Load monk configuration before any database operations
  MonkEnv.load();
  
  // Debug database configuration
  console.log(`🔍 DATABASE_URL: ${process.env.DATABASE_URL}`);
  console.log(`🔍 DB_USER: ${process.env.DB_USER}`);
  console.log(`🔍 DB_HOST: ${process.env.DB_HOST}`);
  
  // Generate unique tenant name with timestamp
  const timestamp = Date.now();
  const randomId = randomBytes(4).toString('hex');
  const tenantName = `test-${timestamp}-${randomId}`;

  console.log(`🔧 Creating test tenant: ${tenantName}`);

  try {
    // Create tenant using TenantService
    const tenant = await TenantService.createTenant(tenantName, 'localhost', false);

    console.log(`✅ Test tenant created: ${tenantName}`);
    console.log(`📊 Database: ${tenant.database}`);

    return {
      tenant,
      async cleanup() {
        await cleanupTestTenant(tenant);
      }
    };

  } catch (error) {
    console.error(`❌ Failed to create test tenant: ${tenantName}`);
    console.error(error);
    throw new Error(`Test tenant creation failed: ${error}`);
  }
}

/**
 * Clean up test tenant and database
 */
async function cleanupTestTenant(tenant: TenantInfo): Promise<void> {
  if (!tenant) return;

  console.log(`🧹 Cleaning up test tenant: ${tenant.name}`);

  try {
    // Delete tenant using TenantService
    await TenantService.deleteTenant(tenant.name, true);

    console.log(`✅ Test tenant cleaned up: ${tenant.name}`);
  } catch (error) {
    console.warn(`⚠️  Failed to cleanup test tenant ${tenant.name}:`, error);
    // Don't throw error in cleanup - just warn
  }
}

/**
 * Create a test context for the tenant
 */
export async function createTestContext(tenant: TenantInfo, username: string = 'root'): Promise<TestContext> {
  console.log(`🔧 Creating test context for ${tenant.name}`);

  // Use TenantService to generate JWT token for the user
  const loginResult = await TenantService.login(tenant.name, username);
  
  if (!loginResult || !loginResult.token) {
    throw new Error(`Failed to authenticate user ${username} in tenant ${tenant.name}`);
  }

  // Decode the JWT token to get the payload
  const jwtPayload = await TenantService.verifyToken(loginResult.token);

  // Create mock Hono context with proper database setup
  const mockContext = {
    env: {
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://localhost:5432/',
    },
    req: {
      header: (name: string) => {
        if (name === 'x-request-id') {
          return `test-${Date.now()}`;
        }
        return undefined;
      }
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

  // Set up database context using DatabaseManager (simulates JWT middleware)
  await DatabaseManager.setDatabaseForRequest(mockContext as any, jwtPayload.database);

  const system = new System(mockContext as any);
  const database = system.database;
  const metabase = system.metabase;

  console.log(`✅ Test context created for ${tenant.name}`);

  return {
    tenant,
    system,
    database,
    metabase,
    tenantService: TenantService
  };
}

/**
 * Create additional user in test tenant using direct database connection
 */
export async function createTestUser(tenant: TenantInfo, username: string, access: string = 'read'): Promise<void> {
  console.log(`👤 Creating test user: ${username} (access: ${access})`);
  
  const dbUser = process.env.DB_USER || process.env.USER || 'postgres';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const tenantConnection = `postgresql://${dbUser}@${dbHost}:${dbPort}/${tenant.database}`;
  
  const client = new Client({ connectionString: tenantConnection });
  
  try {
    await client.connect();
    
    await client.query(
      'INSERT INTO users (tenant_name, name, access) VALUES ($1, $2, $3)',
      [tenant.name, username, access]
    );
    
    console.log(`✅ Test user created: ${username}`);
  } catch (error) {
    console.error(`❌ Failed to create test user: ${username}`);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Test database connectivity using TypeScript Database class
 */
export async function testDatabaseConnectivity(database: Database): Promise<boolean> {
  console.log(`🔍 Testing database connectivity`);
  
  try {
    // Try to query the schema table (should always exist)
    const result = await database.selectAny('schema');
    console.log(`✅ Database connectivity test passed`);
    return true;
  } catch (error) {
    console.error(`❌ Database connectivity test failed:`, error);
    return false;
  }
}

/**
 * Test metabase connectivity using TypeScript Metabase class
 */
export async function testMetabaseConnectivity(metabase: Metabase): Promise<boolean> {
  console.log(`🔍 Testing metabase connectivity`);
  
  try {
    // Try to get the self-reference schema (should always exist)
    const schemaYaml = await metabase.selectOne('schema');
    console.log(`✅ Metabase connectivity test passed (found schema definition)`);
    return true;
  } catch (error) {
    console.error(`❌ Metabase connectivity test failed:`, error);
    return false;
  }
}

// ==========================================
// TEMPLATE-BASED TEST HELPERS
// ==========================================

/**
 * Create test tenant from template database (fast cloning)
 */
export async function createTestTenantFromTemplate(templateName: string): Promise<TestTenantManager> {
  // Load monk configuration
  MonkEnv.load();
  
  // Generate unique tenant name
  const timestamp = Date.now();
  const randomId = randomBytes(4).toString('hex');
  const tenantName = `test-${timestamp}-${randomId}`;
  
  console.log(`⚡ Creating test tenant from template: ${tenantName} (template: ${templateName})`);
  
  try {
    // Fast clone from template instead of slow tenant creation
    const tenant = await TemplateDatabase.createTenantFromTemplate(tenantName, templateName);
    
    console.log(`✅ Test tenant cloned from template: ${tenantName}`);
    
    return {
      tenant,
      async cleanup() {
        await cleanupTestTenant(tenant);
      }
    };
  } catch (error) {
    console.error(`❌ Failed to create tenant from template: ${tenantName}`);
    throw error;
  }
}

/**
 * Create test context with template-based tenant and JWT token
 */
export async function createTestContextWithTemplate(templateName: string, user: string = 'root'): Promise<TestContextWithTemplate> {
  // Create tenant from template
  const tenantManager = await createTestTenantFromTemplate(templateName);
  
  if (!tenantManager.tenant) {
    throw new Error('Failed to create tenant from template');
  }
  
  // Create authenticated test context
  const testContext = await createTestContext(tenantManager.tenant, user);
  
  // Get JWT token for HTTP testing
  const loginResult = await TenantService.login(tenantManager.tenant.name, user);
  
  if (!loginResult?.token) {
    throw new Error(`Failed to get JWT token for user ${user} in template-based tenant`);
  }
  
  // TODO: Review where JWT token generation should live in test helpers
  // For now, including it here for HTTP endpoint testing convenience
  
  return {
    ...testContext,
    templateName,
    jwtToken: loginResult.token
  };
}