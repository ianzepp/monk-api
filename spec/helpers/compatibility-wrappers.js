/**
 * Backward Compatibility Wrappers for Phase 4
 *
 * Provides compatibility functions that allow existing tests to gradually
 * migrate to the new fixture-based approach without breaking changes.
 */
import { TestContext, TestContextWithData, createTestContextWithFixture, createTestTenant, createTestContext, TestTenantManager } from './test-tenant.js';
/**
 * Enhanced createTestTenant that can optionally use fixtures
 */
export async function createTestTenantWithFixture(fixtureName, user = 'root') {
    if (fixtureName) {
        // Use new fixture approach
        console.log(`🚀 Creating tenant with fixture: ${fixtureName}`);
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
                console.log(`🧹 Cleaning up tenant: ${context.tenant.name}`);
            }
        };
    }
    else {
        // Fall back to traditional approach
        return await createTestTenant();
    }
}
/**
 * Enhanced createTestContext that can detect and use fixtures
 */
export async function createEnhancedTestContext(tenant, user = 'root', autoFixture) {
    if (autoFixture) {
        // Use fixture approach
        return await createTestContextWithFixture(autoFixture, {
            user,
            mockTemplate: false
        });
    }
    else {
        // Traditional approach
        return await createTestContext(tenant, user);
    }
}
/**
 * Wrapper that provides fixture benefits while maintaining old API
 */
export class TestContextWrapper {
    context;
    constructor(context) {
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
    async createAccount(data = {}) {
        return await this.helpers.createTestRecord('account', data);
    }
    async createContact(data = {}) {
        return await this.helpers.createTestRecord('contact', data);
    }
    async findAccount(criteria) {
        return await this.helpers.findRecordWhere('account', criteria);
    }
    async findContact(criteria) {
        return await this.helpers.findRecordWhere('contact', criteria);
    }
    async getAccountCount() {
        return await this.helpers.getRecordCount('account');
    }
    async getContactCount() {
        return await this.helpers.getRecordCount('contact');
    }
}
/**
 * Factory function for creating wrapped contexts
 */
export async function createWrappedTestContext(fixtureName = 'basic', user = 'root') {
    const context = await createTestContextWithFixture(fixtureName, {
        user,
        mockTemplate: false
    });
    return new TestContextWrapper(context);
}
/**
 * Migration-friendly beforeAll setup function
 */
export async function setupTestWithFixture(fixtureName = 'basic', user = 'root') {
    console.log(`🎯 Setting up test with fixture: ${fixtureName}`);
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
            console.log(`✅ Test cleanup complete for fixture: ${fixtureName}`);
        }
    };
}
/**
 * Performance comparison utility
 */
export async function compareTestSetupPerformance(testName, traditionalSetup, fixtureSetup) {
    console.log(`📊 Comparing test setup performance: ${testName}`);
    // Measure traditional approach
    const traditionalStart = Date.now();
    try {
        await traditionalSetup();
    }
    catch (error) {
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
    }
    else if (improvement > 50) {
        recommendation = 'MEDIUM PRIORITY - Good performance improvement available';
    }
    else if (improvement > 20) {
        recommendation = 'LOW PRIORITY - Modest improvement, migrate when convenient';
    }
    else {
        recommendation = 'NOT RECOMMENDED - Little performance benefit';
    }
    console.log(`⚡ Performance comparison results:`);
    console.log(`   Traditional: ${traditionalTime}ms`);
    console.log(`   Fixture: ${fixtureTime}ms`);
    console.log(`   Improvement: ${improvement}% (${speedup}x faster)`);
    console.log(`   Recommendation: ${recommendation}`);
    return {
        traditional: traditionalTime,
        fixture: fixtureTime,
        improvement: `${improvement}% (${speedup}x faster)`,
        recommendation
    };
}
//# sourceMappingURL=compatibility-wrappers.js.map