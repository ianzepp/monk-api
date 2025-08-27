/**
 * Test Migration Utilities for Phase 4
 *
 * Helps migrate existing tests from traditional setup patterns
 * to the new enhanced test helpers with fixture support.
 */
import { TestContext, TestContextWithData, TemplateLoadOptions } from './test-tenant.js';
/**
 * Migration plan for upgrading a test file
 */
export interface MigrationPlan {
    testFile: string;
    detectedPatterns: DetectedPattern[];
    recommendedFixtures: string[];
    migrationSteps: MigrationStep[];
    estimatedTimeReduction: string;
    complexity: 'simple' | 'moderate' | 'complex';
}
/**
 * Detected old test pattern
 */
export interface DetectedPattern {
    type: 'manual_schema_loading' | 'manual_data_creation' | 'repetitive_setup' | 'slow_setup';
    line: number;
    code: string;
    replacementSuggestion: string;
}
/**
 * Individual migration step
 */
export interface MigrationStep {
    order: number;
    action: string;
    description: string;
    oldCode?: string;
    newCode?: string;
    automated: boolean;
}
/**
 * Test pattern analysis result
 */
export interface TestAnalysis {
    schemasUsed: string[];
    dataCreationPatterns: string[];
    setupComplexity: number;
    estimatedSetupTime: number;
    migrationRecommendation: 'high' | 'medium' | 'low';
}
/**
 * Migrate existing test setup to use fixture-based approach
 */
export declare function migrateTestToFixture(oldTestSetup: () => Promise<TestContext>, fixtureName: string, options?: TemplateLoadOptions): Promise<TestContextWithData>;
/**
 * Detect required fixture based on test patterns
 */
export declare function detectRequiredFixture(testCode: string): string[];
/**
 * Generate comprehensive migration plan for a test file
 */
export declare function generateMigrationPlan(testCode: string, testFile?: string): MigrationPlan;
/**
 * Generate migration summary report
 */
export declare function generateMigrationReport(plans: MigrationPlan[]): string;
//# sourceMappingURL=migration-helpers.d.ts.map