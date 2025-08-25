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
 * Enhanced test context with fixture data and metadata
 */
export interface TestContextWithData extends TestContext {
  // Fixture information
  fixtureName: string;
  availableSchemas: string[];
  recordCounts: Record<string, number>;
  
  // Database information
  testDatabase: string;
  templateSource: 'cloned' | 'manual' | 'mock';
  
  // Fixture metadata
  fixture?: {
    name: string;
    version: string;
    description: string;
    schemas: Record<string, any>;
    recordCounts: Record<string, number>;
    relationships: Array<{from: string, to: string}>;
  };
  
  // Convenience methods for testing
  helpers: TestDataHelpers;
}

/**
 * Convenience methods for common test operations
 */
export interface TestDataHelpers {
  // Quick data access
  getRecordCount(schemaName: string): Promise<number>;
  getRandomRecord(schemaName: string): Promise<any>;
  findRecordWhere(schemaName: string, criteria: any): Promise<any>;
  
  // Schema operations
  hasSchema(schemaName: string): boolean;
  getSchemaNames(): string[];
  
  // Relationship helpers
  getRelatedRecords(schemaName: string, recordId: string): Promise<Record<string, any[]>>;
  
  // Test data assertions
  assertRecordExists(schemaName: string, criteria: any): Promise<void>;
  assertRecordCount(schemaName: string, expectedCount: number): Promise<void>;
}

/**
 * Template loading options
 */
export interface TemplateLoadOptions {
  user?: string;
  mockTemplate?: boolean;
  customData?: Record<string, any[]>;
  skipValidation?: boolean;
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
 * Create test context with fixture data
 * Main entry point for Phase 4 enhanced testing
 */
export async function createTestContextWithFixture(
  fixtureName: string,
  options: TemplateLoadOptions = {}
): Promise<TestContextWithData> {
  const { user = 'root', mockTemplate = false, customData, skipValidation = false } = options;

  console.log(`🎯 Creating test context with fixture: ${fixtureName}`);

  // Create base test context
  const tenantManager = await createTestTenant();
  const baseContext = await createTestContext(tenantManager.tenant!, user);
  
  let testDatabase: string;
  let templateSource: 'cloned' | 'manual' | 'mock';
  let fixture: any;
  let recordCounts: Record<string, number> = {};

  if (mockTemplate) {
    // Mock mode for development/testing when template system isn't working
    console.log(`🎭 Using mock template for ${fixtureName}`);
    
    testDatabase = baseContext.tenant.database;
    templateSource = 'mock';
    
    // Load fixture definition and create mock data
    fixture = await loadFixtureDefinition(fixtureName);
    recordCounts = await createMockData(baseContext, fixture, customData);
    
  } else {
    try {
      // Try to use real template cloning (blocked by JSON issue currently)
      console.log(`⚡ Attempting to clone template: ${fixtureName}`);
      
      const templateDb = new TemplateDatabase();
      testDatabase = await templateDb.createTestDatabaseFromTemplate(fixtureName);
      templateSource = 'cloned';
      
      // Load fixture metadata
      fixture = await loadFixtureDefinition(fixtureName);
      recordCounts = fixture.metadata?.recordCounts || {};
      
      console.log(`✅ Template cloned successfully: ${testDatabase}`);
      
    } catch (error) {
      console.warn(`⚠️  Template cloning failed, falling back to manual setup: ${error.message}`);
      
      // Fallback to manual data creation
      testDatabase = baseContext.tenant.database;
      templateSource = 'manual';
      
      fixture = await loadFixtureDefinition(fixtureName);
      recordCounts = await createManualData(baseContext, fixture, customData);
    }
  }

  // Create helper methods
  const helpers = createTestDataHelpers(baseContext, fixture);

  // Create enhanced context
  const enhancedContext: TestContextWithData = {
    ...baseContext,
    fixtureName,
    availableSchemas: Object.keys(fixture?.schemas || {}),
    recordCounts,
    testDatabase,
    templateSource,
    fixture,
    helpers
  };

  console.log(`✅ Enhanced test context ready:`, {
    fixtureName,
    templateSource,
    schemaCount: enhancedContext.availableSchemas.length,
    totalRecords: Object.values(recordCounts).reduce((sum, count) => sum + count, 0)
  });

  return enhancedContext;
}

/**
 * Create test context with multiple fixtures (composition)
 */
export async function createMultiFixtureContext(
  fixtureNames: string[],
  options: TemplateLoadOptions = {}
): Promise<TestContextWithData> {
  console.log(`🔗 Creating multi-fixture context:`, fixtureNames);

  if (fixtureNames.length === 0) {
    throw new Error('At least one fixture name is required');
  }

  if (fixtureNames.length === 1) {
    return await createTestContextWithFixture(fixtureNames[0], options);
  }

  // Load all fixture definitions
  const fixtureDefinitions = await Promise.all(
    fixtureNames.map(name => loadFixtureDefinition(name))
  );

  // Resolve dependencies and merge fixtures
  const mergedFixture = await mergeFixtures(fixtureDefinitions);
  
  // Create context with primary fixture as base
  const primaryFixture = fixtureNames[0];
  const baseContext = await createTestContextWithFixture(primaryFixture, { 
    ...options, 
    mockTemplate: true 
  });

  // Update context with merged fixture information
  const enhancedContext: TestContextWithData = {
    ...baseContext,
    fixtureName: fixtureNames.join('+'), // Combined name
    availableSchemas: mergedFixture.allSchemas,
    recordCounts: mergedFixture.totalRecordCounts,
    fixture: {
      name: fixtureNames.join('+'),
      version: '1.0.0',
      description: `Composite fixture: ${fixtureNames.join(', ')}`,
      schemas: mergedFixture.schemas,
      recordCounts: mergedFixture.totalRecordCounts,
      relationships: mergedFixture.relationships
    }
  };

  console.log(`✅ Multi-fixture context created:`, {
    fixtures: fixtureNames,
    totalSchemas: mergedFixture.allSchemas.length,
    totalRecords: Object.values(mergedFixture.totalRecordCounts).reduce((sum, count) => sum + count, 0),
    relationships: mergedFixture.relationships.length
  });

  return enhancedContext;
}

/**
 * Load fixture definition from the fixture system
 */
async function loadFixtureDefinition(fixtureName: string): Promise<any> {
  try {
    // Try to load fixture definition
    const fixturePath = `../../spec/fixtures/definitions/${fixtureName}.ts`;
    const fixtureModule = await import(fixturePath);
    
    return {
      name: fixtureName,
      version: '1.0.0',
      description: fixtureModule.fixture?.description || `${fixtureName} fixture`,
      schemas: fixtureModule.fixture?.schemas || {},
      recordCounts: fixtureModule.fixture?.recordCounts || {},
      relationships: fixtureModule.fixture?.relationships || []
    };
  } catch (error) {
    console.warn(`⚠️  Could not load fixture definition for ${fixtureName}, using defaults`);
    return {
      name: fixtureName,
      version: '1.0.0',
      description: `Basic ${fixtureName} fixture`,
      schemas: { account: {}, contact: {} }, // Default schemas
      recordCounts: { account: 10, contact: 20 },
      relationships: []
    };
  }
}

/**
 * Create mock data for development/testing
 */
async function createMockData(
  context: TestContext, 
  fixture: any, 
  customData?: Record<string, any[]>
): Promise<Record<string, number>> {
  console.log(`🎭 Creating mock data for fixture: ${fixture.name}`);
  
  const recordCounts: Record<string, number> = {};

  // Use custom data if provided
  if (customData) {
    for (const [schemaName, records] of Object.entries(customData)) {
      try {
        // Create schema first if it doesn't exist
        await ensureSchemaExists(context, schemaName);
        
        // Insert records
        await context.database.createAll(schemaName, records);
        recordCounts[schemaName] = records.length;
        
        console.log(`✅ Created ${records.length} ${schemaName} records`);
      } catch (error) {
        console.warn(`⚠️  Failed to create ${schemaName} records:`, error.message);
        recordCounts[schemaName] = 0;
      }
    }
  } else {
    // Generate basic mock data
    const mockSchemas = ['account', 'contact'];
    for (const schemaName of mockSchemas) {
      const count = fixture.recordCounts?.[schemaName] || 5;
      recordCounts[schemaName] = count;
      console.log(`📝 Mock: would create ${count} ${schemaName} records`);
    }
  }

  return recordCounts;
}

/**
 * Create data manually when template cloning fails
 */
async function createManualData(
  context: TestContext,
  fixture: any,
  customData?: Record<string, any[]>
): Promise<Record<string, number>> {
  console.log(`🔨 Creating manual data for fixture: ${fixture.name}`);
  
  // TODO: Implement manual data creation using generators
  // This would use the AccountGenerator, ContactGenerator, etc.
  
  return await createMockData(context, fixture, customData);
}

/**
 * Ensure schema exists in the test database
 */
async function ensureSchemaExists(context: TestContext, schemaName: string): Promise<void> {
  try {
    // Check if schema exists by trying to query it
    await context.database.selectAny(schemaName, { limit: 1 });
  } catch (error) {
    // Schema doesn't exist, try to create it
    console.log(`📋 Creating schema: ${schemaName}`);
    
    try {
      // Try to load schema definition
      const schemaPath = `../../spec/fixtures/schema/${schemaName}.yaml`;
      // TODO: Load and create schema
      console.log(`📋 Would load schema from: ${schemaPath}`);
    } catch (schemaError) {
      console.warn(`⚠️  Could not create schema ${schemaName}:`, schemaError.message);
    }
  }
}

/**
 * Interface for merged fixture information
 */
interface MergedFixture {
  allSchemas: string[];
  schemas: Record<string, any>;
  totalRecordCounts: Record<string, number>;
  relationships: Array<{from: string, to: string}>;
  dependencies: string[];
  conflicts: Array<{schema: string, fixtures: string[]}>;
}

/**
 * Fixture dependency information
 */
interface FixtureDependency {
  name: string;
  dependsOn: string[];
  provides: string[];
}

/**
 * Merge multiple fixtures into a single composite fixture
 */
async function mergeFixtures(fixtures: any[]): Promise<MergedFixture> {
  console.log(`🔀 Merging ${fixtures.length} fixtures`);
  
  const allSchemas: string[] = [];
  const schemas: Record<string, any> = {};
  const totalRecordCounts: Record<string, number> = {};
  const relationships: Array<{from: string, to: string}> = [];
  const dependencies: string[] = [];
  const conflicts: Array<{schema: string, fixtures: string[]}> = [];

  // Track which fixtures provide which schemas
  const schemaProviders: Record<string, string[]> = {};

  // First pass: collect all schemas and detect conflicts
  fixtures.forEach(fixture => {
    Object.keys(fixture.schemas || {}).forEach(schemaName => {
      if (!schemaProviders[schemaName]) {
        schemaProviders[schemaName] = [];
      }
      schemaProviders[schemaName].push(fixture.name);

      if (!allSchemas.includes(schemaName)) {
        allSchemas.push(schemaName);
      }
    });
  });

  // Detect schema conflicts
  Object.entries(schemaProviders).forEach(([schemaName, providers]) => {
    if (providers.length > 1) {
      conflicts.push({
        schema: schemaName,
        fixtures: providers
      });
      console.warn(`⚠️  Schema conflict detected: '${schemaName}' provided by ${providers.join(', ')}`);
    }
  });

  // Resolve conflicts using last-wins strategy
  fixtures.forEach((fixture, index) => {
    Object.entries(fixture.schemas || {}).forEach(([schemaName, schemaDefinition]) => {
      // Last fixture wins for conflicting schemas
      schemas[schemaName] = schemaDefinition;
    });

    // Merge record counts (sum for same schemas)
    Object.entries(fixture.recordCounts || {}).forEach(([schemaName, count]) => {
      totalRecordCounts[schemaName] = (totalRecordCounts[schemaName] || 0) + count;
    });

    // Collect relationships
    if (fixture.relationships) {
      relationships.push(...fixture.relationships);
    }

    // Collect dependencies
    if (fixture.dependencies) {
      dependencies.push(...fixture.dependencies);
    }
  });

  const result: MergedFixture = {
    allSchemas: allSchemas.sort(),
    schemas,
    totalRecordCounts,
    relationships: deduplicateRelationships(relationships),
    dependencies: [...new Set(dependencies)], // Deduplicate
    conflicts
  };

  console.log(`✅ Fixture merge complete:`, {
    schemas: result.allSchemas.length,
    relationships: result.relationships.length,
    conflicts: result.conflicts.length
  });

  return result;
}

/**
 * Remove duplicate relationships
 */
function deduplicateRelationships(relationships: Array<{from: string, to: string}>): Array<{from: string, to: string}> {
  const seen = new Set<string>();
  return relationships.filter(rel => {
    const key = `${rel.from}->${rel.to}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Resolve fixture dependencies and return ordered list
 */
export function resolveFixtureDependencies(fixtureNames: string[]): string[] {
  console.log(`🔍 Resolving dependencies for:`, fixtureNames);
  
  // Define known fixture dependencies
  const fixtureDependencies: Record<string, FixtureDependency> = {
    'basic': {
      name: 'basic',
      dependsOn: [],
      provides: ['account', 'contact']
    },
    'ecommerce': {
      name: 'ecommerce',
      dependsOn: ['basic'], // Ecommerce needs basic customer/account data
      provides: ['product', 'order', 'category', 'inventory']
    },
    'user-management': {
      name: 'user-management',
      dependsOn: [],
      provides: ['user', 'role', 'permission']
    },
    'content': {
      name: 'content',
      dependsOn: ['user-management'], // Content needs users as authors
      provides: ['article', 'comment', 'tag', 'media']
    },
    'complex-acl': {
      name: 'complex-acl',
      dependsOn: ['user-management'],
      provides: ['organization', 'group', 'access_policy']
    },
    'performance': {
      name: 'performance',
      dependsOn: ['basic', 'ecommerce'],
      provides: [] // Performance fixture provides large datasets of existing schemas
    }
  };

  // Topological sort to resolve dependencies
  const resolved: string[] = [];
  const visiting: Set<string> = new Set();
  const visited: Set<string> = new Set();

  function visit(fixtureName: string) {
    if (visited.has(fixtureName)) return;
    if (visiting.has(fixtureName)) {
      throw new Error(`Circular dependency detected involving fixture: ${fixtureName}`);
    }

    visiting.add(fixtureName);

    const fixture = fixtureDependencies[fixtureName];
    if (fixture) {
      fixture.dependsOn.forEach(dependency => {
        if (fixtureNames.includes(dependency) || resolved.includes(dependency)) {
          visit(dependency);
        }
      });
    }

    visiting.delete(fixtureName);
    visited.add(fixtureName);
    
    if (!resolved.includes(fixtureName)) {
      resolved.push(fixtureName);
    }
  }

  // Visit all requested fixtures
  fixtureNames.forEach(visit);

  console.log(`✅ Dependency resolution complete:`, resolved);
  return resolved;
}

/**
 * Validate fixture composition for conflicts and issues
 */
export function validateFixtureComposition(fixtureNames: string[]): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for known problematic combinations
  const problematicCombinations: Record<string, string[]> = {
    'performance': ['basic', 'ecommerce'], // Performance includes basic + ecommerce data
    'complex-acl': ['user-management'] // Complex-acl extends user-management
  };

  Object.entries(problematicCombinations).forEach(([fixture, conflicts]) => {
    if (fixtureNames.includes(fixture)) {
      const presentConflicts = conflicts.filter(conflict => fixtureNames.includes(conflict));
      if (presentConflicts.length > 0) {
        warnings.push(
          `Fixture '${fixture}' includes data from ${presentConflicts.join(', ')}. ` +
          `Consider using only '${fixture}' to avoid duplicate data.`
        );
      }
    }
  });

  // Check fixture existence (basic validation)
  const knownFixtures = ['basic', 'ecommerce', 'user-management', 'content', 'complex-acl', 'performance'];
  fixtureNames.forEach(fixture => {
    if (!knownFixtures.includes(fixture)) {
      warnings.push(`Unknown fixture '${fixture}' - will use default configuration`);
    }
  });

  // Check for too many fixtures (performance concern)
  if (fixtureNames.length > 4) {
    warnings.push(
      `Composing ${fixtureNames.length} fixtures may result in very large datasets. ` +
      `Consider using fewer, more targeted fixtures.`
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Create helper methods for test context
 */
function createTestDataHelpers(context: TestContext, fixture: any): TestDataHelpers {
  return {
    async getRecordCount(schemaName: string): Promise<number> {
      try {
        return await context.database.count(schemaName);
      } catch (error) {
        console.warn(`⚠️  Could not count records in ${schemaName}:`, error.message);
        return 0;
      }
    },

    async getRandomRecord(schemaName: string): Promise<any> {
      try {
        const records = await context.database.selectAny(schemaName, { limit: 10 });
        if (records.length === 0) return null;
        
        const randomIndex = Math.floor(Math.random() * records.length);
        return records[randomIndex];
      } catch (error) {
        console.warn(`⚠️  Could not get random record from ${schemaName}:`, error.message);
        return null;
      }
    },

    async findRecordWhere(schemaName: string, criteria: any): Promise<any> {
      try {
        return await context.database.selectOne(schemaName, criteria);
      } catch (error) {
        console.warn(`⚠️  Could not find record in ${schemaName}:`, error.message);
        return null;
      }
    },

    hasSchema(schemaName: string): boolean {
      return fixture?.schemas?.hasOwnProperty(schemaName) || false;
    },

    getSchemaNames(): string[] {
      return Object.keys(fixture?.schemas || {});
    },

    async getRelatedRecords(schemaName: string, recordId: string): Promise<Record<string, any[]>> {
      // TODO: Implement relationship following using fixture.relationships
      console.log(`🔗 Would find related records for ${schemaName}:${recordId}`);
      return {};
    },

    async assertRecordExists(schemaName: string, criteria: any): Promise<void> {
      const record = await this.findRecordWhere(schemaName, criteria);
      if (!record) {
        throw new Error(`Expected record not found in ${schemaName}: ${JSON.stringify(criteria)}`);
      }
    },

    async assertRecordCount(schemaName: string, expectedCount: number): Promise<void> {
      const actualCount = await this.getRecordCount(schemaName);
      if (actualCount !== expectedCount) {
        throw new Error(`Expected ${expectedCount} records in ${schemaName}, found ${actualCount}`);
      }
    }
  };
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