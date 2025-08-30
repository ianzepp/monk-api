/**
 * Examples demonstrating migration utilities and multi-fixture composition
 * 
 * This file showcases:
 * 1. Migration utilities for converting old test patterns
 * 2. Multi-fixture composition capabilities  
 * 3. Dependency resolution and conflict handling
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { 
  createMultiFixtureContext,
  resolveFixtureDependencies,
  validateFixtureComposition,
  type TestContextWithData 
} from '../helpers/test-tenant.js';
import { 
  generateMigrationPlan,
  detectRequiredFixture,
  migrateTestToFixture,
  generateMigrationReport
} from '../helpers/migration-helpers.js';

describe('Migration Utilities Examples', () => {
  
  test('should detect required fixtures from test code', () => {
    const testCode = `
      beforeAll(async () => {
        const tenantManager = await createTestTenant();
        const testContext = await createTestContext(tenantManager.tenant!, 'root');
        
        // Manual schema loading
        const accountJson = await readFile('account.json', 'utf-8');
        await testContext.metabase.createOne('account', accountJson);
        
        // Manual data creation
        await testContext.database.createOne('account', {
          name: 'Test User',
          email: 'test@example.com'
        });
        
        await testContext.database.createOne('product', {
          name: 'Test Product',
          price: 19.99
        });
      });
    `;

    const fixtures = detectRequiredFixture(testCode);
    expect(fixtures).toContain('basic'); // account usage detected
    expect(fixtures).toContain('ecommerce'); // product usage detected
  });

  test('should generate migration plan', () => {
    const testCode = `
      describe('Old Test Pattern', () => {
        let testContext: TestContext;
        
        beforeAll(async () => {
          const tenantManager = await createTestTenant();
          testContext = await createTestContext(tenantManager.tenant!, 'root');
          
          // Load schemas manually
          const accountJson = await readFile('schema/account.json', 'utf-8');
          await testContext.metabase.createOne('account', accountJson);
          
          // Create test data manually
          for (let i = 0; i < 10; i++) {
            await testContext.database.createOne('account', {
              name: \`User \${i}\`,
              email: \`user\${i}@example.com\`
            });
          }
        });
        
        test('should work with accounts', async () => {
          const accounts = await testContext.database.selectAny('account');
          expect(accounts.length).toBeGreaterThan(0);
        });
      });
    `;

    const plan = generateMigrationPlan(testCode, 'old-test.ts');
    
    expect(plan.testFile).toBe('old-test.ts');
    expect(plan.detectedPatterns.length).toBeGreaterThan(0);
    expect(plan.recommendedFixtures).toContain('basic');
    expect(plan.migrationSteps.length).toBeGreaterThan(0);
    expect(plan.complexity).toMatch(/simple|moderate|complex/);
    expect(plan.estimatedTimeReduction).toMatch(/\d+.*→.*0\.5s/);
  });

  test('should generate migration report', () => {
    const plans = [
      generateMigrationPlan('await createOne("account")', 'test1.ts'),
      generateMigrationPlan('await createOne("product")', 'test2.ts')
    ];

    const report = generateMigrationReport(plans);
    expect(report).toContain('Test Migration Report');
    expect(report).toContain('Total test files analyzed');
    expect(report).toContain('Migration Benefits');
  });

  test('should migrate test function to fixture approach', async () => {
    // Simulate old test setup function
    const oldTestSetup = async () => {
      // This would normally create tenant, context, schemas, etc.
      throw new Error('Simulating old setup failure');
    };

    // Migrate to new approach with fallback
    const context = await migrateTestToFixture(oldTestSetup, 'basic', {
      mockTemplate: true
    });

    expect(context.fixtureName).toBe('basic');
    expect(context.helpers).toBeDefined();
    expect(context.templateSource).toBe('mock'); // Should fallback to mock
  });
});

describe('Multi-Fixture Composition Examples', () => {
  
  test('should resolve fixture dependencies', () => {
    // Test dependency resolution
    const resolved = resolveFixtureDependencies(['content', 'ecommerce', 'basic']);
    
    // Should resolve in dependency order
    expect(resolved.indexOf('basic')).toBeLessThan(resolved.indexOf('ecommerce'));
    expect(resolved.indexOf('user-management')).toBeLessThan(resolved.indexOf('content'));
    
    expect(resolved).toContain('basic');
    expect(resolved).toContain('ecommerce');
    expect(resolved).toContain('content');
    expect(resolved).toContain('user-management'); // Dependency of content
  });

  test('should validate fixture composition', () => {
    // Test valid composition
    const validResult = validateFixtureComposition(['basic', 'ecommerce']);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    // Test problematic composition
    const problematicResult = validateFixtureComposition(['performance', 'basic', 'ecommerce']);
    expect(problematicResult.valid).toBe(true); // Still valid, but with warnings
    expect(problematicResult.warnings.length).toBeGreaterThan(0);
    expect(problematicResult.warnings[0]).toContain('Performance');

    // Test unknown fixture
    const unknownResult = validateFixtureComposition(['unknown-fixture']);
    expect(unknownResult.warnings.some(w => w.includes('Unknown fixture'))).toBe(true);
  });

  test('should create multi-fixture context', async () => {
    const context = await createMultiFixtureContext(['basic', 'user-management'], {
      mockTemplate: true
    });

    expect(context.fixtureName).toBe('basic+user-management');
    expect(context.availableSchemas).toContain('account');
    expect(context.availableSchemas).toContain('contact');
    expect(context.availableSchemas).toContain('user');
    expect(context.availableSchemas).toContain('role');
    
    expect(context.fixture?.name).toBe('basic+user-management');
    expect(context.fixture?.description).toContain('Composite fixture');
  });

  test('should handle single fixture (no composition needed)', async () => {
    const context = await createMultiFixtureContext(['basic'], {
      mockTemplate: true
    });

    expect(context.fixtureName).toBe('basic');
    expect(context.availableSchemas).toContain('account');
    expect(context.availableSchemas).toContain('contact');
  });

  test('should throw error for empty fixture list', async () => {
    await expect(createMultiFixtureContext([])).rejects.toThrow('At least one fixture name is required');
  });
});

describe('Complex Composition Scenarios', () => {
  let context: TestContextWithData;

  beforeAll(async () => {
    // Create a complex multi-fixture context for testing
    context = await createMultiFixtureContext(['basic', 'ecommerce', 'user-management'], {
      mockTemplate: true
    });
  });

  test('should provide comprehensive schema coverage', () => {
    // Should have schemas from all three fixtures
    const schemas = context.availableSchemas;
    
    // From basic
    expect(schemas).toContain('account');
    expect(schemas).toContain('contact');
    
    // From ecommerce  
    expect(schemas).toContain('product');
    expect(schemas).toContain('order');
    
    // From user-management
    expect(schemas).toContain('user');
    expect(schemas).toContain('role');
  });

  test('should provide merged fixture metadata', () => {
    expect(context.fixture?.name).toBe('basic+ecommerce+user-management');
    expect(context.fixture?.relationships).toBeDefined();
    expect(context.availableSchemas.length).toBeGreaterThan(4);
  });

  test('should support helper methods across all schemas', async () => {
    // Test helpers work with schemas from different fixtures
    expect(context.helpers.hasSchema('account')).toBe(true); // basic
    expect(context.helpers.hasSchema('product')).toBe(true); // ecommerce  
    expect(context.helpers.hasSchema('user')).toBe(true);    // user-management
    
    const schemaNames = context.helpers.getSchemaNames();
    expect(schemaNames.length).toBeGreaterThan(5);
  });
});

describe('Migration Workflow Examples', () => {

  test('should demonstrate complete migration workflow', async () => {
    // 1. Analyze existing test
    const oldTestCode = `
      beforeAll(async () => {
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant!, 'root');
        
        const accountJson = await readFile('account.json', 'utf-8');
        await testContext.metabase.createOne('account', accountJson);
        
        for (let i = 0; i < 5; i++) {
          await testContext.database.createOne('account', { name: 'User' + i });
        }
      });
    `;

    // 2. Generate migration plan
    const plan = generateMigrationPlan(oldTestCode, 'legacy-test.ts');
    expect(plan.recommendedFixtures).toContain('basic');

    // 3. Validate recommended fixtures
    const validation = validateFixtureComposition(plan.recommendedFixtures);
    expect(validation.valid).toBe(true);

    // 4. Create new test context using recommendations
    const newContext = await createMultiFixtureContext(plan.recommendedFixtures, {
      mockTemplate: true
    });

    expect(newContext.fixtureName).toContain('basic');
    expect(newContext.helpers).toBeDefined();
  });

  test('should handle complex migration scenarios', () => {
    const complexTestCode = `
      // Complex test with multiple schemas and operations
      beforeAll(async () => {
        // Setup tenant
        tenantManager = await createTestTenant();
        testContext = await createTestContext(tenantManager.tenant!, 'root');
        
        // Load multiple schemas
        const accountJson = await readFile('account.json', 'utf-8');
        await testContext.metabase.createOne('account', accountJson);
        
        const productJson = await readFile('product.json', 'utf-8');
        await testContext.metabase.createOne('product', productJson);
        
        const userJson = await readFile('user.json', 'utf-8');
        await testContext.metabase.createOne('user', userJson);
        
        // Create lots of test data
        for (let i = 0; i < 50; i++) {
          await testContext.database.createOne('account', {...});
          await testContext.database.createOne('product', {...});
          await testContext.database.createOne('user', {...});
        }
      });
    `;

    const plan = generateMigrationPlan(complexTestCode, 'complex-test.ts');
    
    expect(plan.complexity).toMatch(/moderate|complex/);
    expect(plan.recommendedFixtures).toContain('basic');
    expect(plan.recommendedFixtures).toContain('ecommerce');
    expect(plan.recommendedFixtures).toContain('user-management');
    
    expect(plan.estimatedTimeReduction).toMatch(/\d+s → 0\.5s/); // Should show significant improvement
  });
});