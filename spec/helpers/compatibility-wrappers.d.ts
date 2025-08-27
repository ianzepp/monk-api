/**
 * Backward Compatibility Wrappers for Phase 4
 *
 * Provides compatibility functions that allow existing tests to gradually
 * migrate to the new fixture-based approach without breaking changes.
 */
import { TestContext, TestContextWithData, TestTenantManager } from './test-tenant.js';
/**
 * Enhanced createTestTenant that can optionally use fixtures
 */
export declare function createTestTenantWithFixture(fixtureName?: string, user?: string): Promise<TestTenantManager & {
    context?: TestContextWithData;
}>;
/**
 * Enhanced createTestContext that can detect and use fixtures
 */
export declare function createEnhancedTestContext(tenant: any, user?: string, autoFixture?: string): Promise<TestContext | TestContextWithData>;
/**
 * Wrapper that provides fixture benefits while maintaining old API
 */
export declare class TestContextWrapper {
    private context;
    constructor(context: TestContextWithData);
    get tenant(): import("../../src/lib/services/tenant.js").TenantInfo;
    get system(): import("../../src/lib/system.js").System;
    get database(): import("../../src/lib/database.js").Database;
    get metabase(): import("../../src/lib/metabase.js").Metabase;
    get tenantService(): typeof import("../../src/lib/services/tenant.js").TenantService;
    get fixture(): {
        name: string;
        version: string;
        description: string;
        schemas: Record<string, any>;
        recordCounts: Record<string, number>;
        relationships: Array<{
            from: string;
            to: string;
        }>;
    } | undefined;
    get helpers(): import("./test-tenant.js").TestDataHelpers;
    get recordCounts(): Record<string, number>;
    createAccount(data?: any): Promise<any>;
    createContact(data?: any): Promise<any>;
    findAccount(criteria: any): Promise<any>;
    findContact(criteria: any): Promise<any>;
    getAccountCount(): Promise<number>;
    getContactCount(): Promise<number>;
}
/**
 * Factory function for creating wrapped contexts
 */
export declare function createWrappedTestContext(fixtureName?: string, user?: string): Promise<TestContextWrapper>;
/**
 * Migration-friendly beforeAll setup function
 */
export declare function setupTestWithFixture(fixtureName?: string, user?: string): Promise<{
    context: TestContextWithData;
    wrapper: TestContextWrapper;
    cleanup: () => Promise<void>;
}>;
/**
 * Performance comparison utility
 */
export declare function compareTestSetupPerformance(testName: string, traditionalSetup: () => Promise<TestContext>, fixtureSetup: () => Promise<TestContextWithData>): Promise<{
    traditional: number;
    fixture: number;
    improvement: string;
    recommendation: string;
}>;
//# sourceMappingURL=compatibility-wrappers.d.ts.map