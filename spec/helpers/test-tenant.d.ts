/**
 * Test Tenant Management for Vitest
 *
 * Creates fresh tenants using TenantManager and provides TypeScript-based
 * testing utilities without external CLI dependencies
 */
import { TenantService, TenantInfo } from '../../src/lib/services/tenant.js';
import { System } from '../../src/lib/system.js';
import { Database } from '../../src/lib/database.js';
import { Metabase } from '../../src/lib/metabase.js';
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
    fixtureName: string;
    availableSchemas: string[];
    recordCounts: Record<string, number>;
    testDatabase: string;
    templateSource: 'cloned' | 'manual' | 'mock';
    fixture?: {
        name: string;
        version: string;
        description: string;
        schemas: Record<string, any>;
        recordCounts: Record<string, number>;
        relationships: Array<{
            from: string;
            to: string;
        }>;
    };
    helpers: TestDataHelpers;
}
/**
 * Convenience methods for common test operations
 */
export interface TestDataHelpers {
    getRecordCount(schemaName: string): Promise<number>;
    getRandomRecord(schemaName: string): Promise<any>;
    findRecordWhere(schemaName: string, criteria: any): Promise<any>;
    hasSchema(schemaName: string): boolean;
    getSchemaNames(): string[];
    getRelatedRecords(schemaName: string, recordId: string): Promise<Record<string, any[]>>;
    assertRecordExists(schemaName: string, criteria: any): Promise<void>;
    assertRecordCount(schemaName: string, expectedCount: number): Promise<void>;
    createTestRecord(schemaName: string, overrides?: any): Promise<any>;
    seedCustomData(schemaName: string, count: number, template?: any): Promise<any[]>;
    cleanupTestData(schemaName: string, criteria?: any): Promise<number>;
    findRecordsWhere(schemaName: string, criteria: any, limit?: number): Promise<any[]>;
    getPerformanceMetrics(): TestPerformanceMetrics;
    startTimer(label: string): void;
    endTimer(label: string): number;
}
/**
 * Template loading options
 */
export interface TemplateLoadOptions {
    user?: string;
    mockTemplate?: boolean;
    customData?: Record<string, any[]>;
    skipValidation?: boolean;
    customFixture?: CustomFixtureDefinition;
}
/**
 * Custom fixture definition for inline fixture creation
 */
export interface CustomFixtureDefinition {
    name: string;
    description?: string;
    schemas: string[];
    data: Record<string, any[]>;
    relationships?: Array<{
        from: string;
        to: string;
    }>;
    options?: {
        seedRandom?: number;
        includeEdgeCases?: boolean;
        recordMultiplier?: number;
    };
}
/**
 * Performance metrics for test execution monitoring
 */
export interface TestPerformanceMetrics {
    setupTime: number;
    dataLoadTime: number;
    testExecutionTime: number;
    totalTime: number;
    templateSource: 'cloned' | 'manual' | 'mock';
    recordCounts: Record<string, number>;
    customTimers: Record<string, number>;
}
/**
 * Create a fresh test tenant with unique name
 */
export declare function createTestTenant(): Promise<TestTenantManager>;
/**
 * Create a test context for the tenant
 */
export declare function createTestContext(tenant: TenantInfo, username?: string): Promise<TestContext>;
/**
 * Create additional user in test tenant using direct database connection
 */
export declare function createTestUser(tenant: TenantInfo, username: string, access?: string): Promise<void>;
/**
 * Test database connectivity using TypeScript Database class
 */
export declare function testDatabaseConnectivity(database: Database): Promise<boolean>;
/**
 * Create test context with fixture data
 * Main entry point for Phase 4 enhanced testing
 */
export declare function createTestContextWithFixture(fixtureName: string, options?: TemplateLoadOptions): Promise<TestContextWithData>;
/**
 * Create test context with multiple fixtures (composition)
 */
export declare function createMultiFixtureContext(fixtureNames: string[], options?: TemplateLoadOptions): Promise<TestContextWithData>;
/**
 * Resolve fixture dependencies and return ordered list
 */
export declare function resolveFixtureDependencies(fixtureNames: string[]): string[];
/**
 * Validate fixture composition for conflicts and issues
 */
export declare function validateFixtureComposition(fixtureNames: string[]): {
    valid: boolean;
    warnings: string[];
    errors: string[];
};
/**
 * Create test context with custom inline fixture
 */
export declare function createTestContextWithCustomFixture(customFixture: CustomFixtureDefinition, options?: Omit<TemplateLoadOptions, 'customFixture'>): Promise<TestContextWithData>;
/**
 * Test metabase connectivity using TypeScript Metabase class
 */
export declare function testMetabaseConnectivity(metabase: Metabase): Promise<boolean>;
/**
 * Create test tenant from template database (fast cloning)
 */
export declare function createTestTenantFromTemplate(templateName: string): Promise<TestTenantManager>;
/**
 * Create test context with template-based tenant and JWT token
 */
export declare function createTestContextWithTemplate(templateName: string, user?: string): Promise<TestContextWithTemplate>;
//# sourceMappingURL=test-tenant.d.ts.map