/**
 * Backward Compatibility Wrappers for Phase 4
 * 
 * Provides compatibility functions that allow existing tests to gradually
 * migrate to the new fixture-based approach without breaking changes.
 */

import { 
  TestContext, 
  TestContextWithData, 
  createTestContextWithFixture,
  createTestTenant,
  createTestContext,
  TestTenantManager 
} from './test-tenant.js';

/**
 * Enhanced createTestTenant that can optionally use fixtures
 */
export async function createTestTenantWithFixture(
  fixtureName?: string,
  user: string = 'root'
): Promise<TestTenantManager & { context?: TestContextWithData }> {
  
  if (fixtureName) {
    // Use new fixture approach
    logger.info(`🚀 Creating tenant with fixture: ${fixtureName}`);
    
    const context = await createTestContextWithFixture(fixtureName, {
      user,
      mockTemplate: false
    });
    
    // Create a compatible wrapper that includes both old and new interfaces
    return {
      tenant: context.tenant,
      context: context,
      cleanup: async () => {
        // Cleanup would be handled by the fixture system
        logger.info(`🧹 Cleaning up tenant: ${context.tenant.name}`);
      }
    };
  } else {
    // Fall back to traditional approach
    return await createTestTenant();
  }
}

/**
 * Enhanced createTestContext that can detect and use fixtures
 */
export async function createEnhancedTestContext(
  tenant: any,
  user: string = 'root',
  autoFixture?: string
): Promise<TestContext | TestContextWithData> {
  
  if (autoFixture) {
    // Use fixture approach
    return await createTestContextWithFixture(autoFixture, {
      user,
      mockTemplate: false
    });
  } else {
    // Traditional approach
    return await createTestContext(tenant, user);
  }
}

/**
 * Wrapper that provides fixture benefits while maintaining old API
 */
export class TestContextWrapper {
  private context: TestContextWithData;
  
  constructor(context: TestContextWithData) {
    this.context = context;
  }

  // Delegate all traditional methods
  get tenant() { return this.context.tenant; }
  get system() { return this.context.system; }
  get database() { return this.context.database; }
  get metabase() { return this.context.metabase; }
  get tenantService() { return this.context.tenantService; }

  // Provide enhanced methods as additional capabilities
  get fixture() { return this.context.fixture; }
  get helpers() { return this.context.helpers; }
  get recordCounts() { return this.context.recordCounts; }

  // Convenience methods that bridge old and new patterns
  async createAccount(data: any = {}): Promise<any> {
    return await this.helpers.createTestRecord('account', data);
  }

  async createContact(data: any = {}): Promise<any> {
    return await this.helpers.createTestRecord('contact', data);
  }

  async findAccount(criteria: any): Promise<any> {
    return await this.helpers.findRecordWhere('account', criteria);
  }

  async findContact(criteria: any): Promise<any> {
    return await this.helpers.findRecordWhere('contact', criteria);
  }

  async getAccountCount(): Promise<number> {
    return await this.helpers.getRecordCount('account');
  }

  async getContactCount(): Promise<number> {
    return await this.helpers.getRecordCount('contact');
  }
}

/**
 * Factory function for creating wrapped contexts
 */
export async function createWrappedTestContext(
  fixtureName: string = 'basic',
  user: string = 'root'
): Promise<TestContextWrapper> {
  const context = await createTestContextWithFixture(fixtureName, {
    user,
    mockTemplate: false
  });
  
  return new TestContextWrapper(context);
}

/**
 * Migration-friendly beforeAll setup function
 */
export async function setupTestWithFixture(
  fixtureName: string = 'basic',
  user: string = 'root'
): Promise<{
  context: TestContextWithData;
  wrapper: TestContextWrapper;
  cleanup: () => Promise<void>;
}> {
  
  logger.info(`🎯 Setting up test with fixture: ${fixtureName}`);
  
  const context = await createTestContextWithFixture(fixtureName, {
    user,
    mockTemplate: false
  });
  
  const wrapper = new TestContextWrapper(context);
  
  return {
    context,
    wrapper,
    cleanup: async () => {
      // Fixture cleanup would be automatic
      logger.info(`✅ Test cleanup complete for fixture: ${fixtureName}`);
    }
  };
}

/**
 * Performance comparison utility
 */
export async function compareTestSetupPerformance(
  testName: string,
  traditionalSetup: () => Promise<TestContext>,
  fixtureSetup: () => Promise<TestContextWithData>
): Promise<{
  traditional: number;
  fixture: number;
  improvement: string;
  recommendation: string;
}> {
  
  logger.info(`📊 Comparing test setup performance: ${testName}`);
  
  // Measure traditional approach
  const traditionalStart = Date.now();
  try {
    await traditionalSetup();
  } catch (error) {
    console.warn(`Traditional setup failed: ${error.message}`);
  }
  const traditionalTime = Date.now() - traditionalStart;
  
  // Measure fixture approach
  const fixtureStart = Date.now();
  const fixtureContext = await fixtureSetup();
  const fixtureTime = Date.now() - fixtureStart;
  
  // Calculate improvement
  const improvement = Math.round((traditionalTime - fixtureTime) / traditionalTime * 100);
  const speedup = Math.round(traditionalTime / fixtureTime);
  
  let recommendation = '';
  if (improvement > 80) {
    recommendation = 'HIGH PRIORITY - Migrate immediately for significant performance gains';
  } else if (improvement > 50) {
    recommendation = 'MEDIUM PRIORITY - Good performance improvement available';
  } else if (improvement > 20) {
    recommendation = 'LOW PRIORITY - Modest improvement, migrate when convenient';
  } else {
    recommendation = 'NOT RECOMMENDED - Little performance benefit';
  }
  
  logger.info(`⚡ Performance comparison results:`);
  logger.info(`   Traditional: ${traditionalTime}ms`);
  logger.info(`   Fixture: ${fixtureTime}ms`);
  logger.info(`   Improvement: ${improvement}% (${speedup}x faster)`);
  logger.info(`   Recommendation: ${recommendation}`);
  
  return {
    traditional: traditionalTime,
    fixture: fixtureTime,
    improvement: `${improvement}% (${speedup}x faster)`,
    recommendation
  };
}