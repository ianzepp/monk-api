/**
 * Test Migration Utilities for Phase 4
 *
 * Helps migrate existing tests from traditional setup patterns
 * to the new enhanced test helpers with fixture support.
 */
import { TestContext, TestContextWithData, createTestContextWithFixture, TemplateLoadOptions } from './test-tenant.js';
/**
 * Migrate existing test setup to use fixture-based approach
 */
export async function migrateTestToFixture(oldTestSetup, fixtureName, options = {}) {
    console.log(`🔄 Migrating test setup to fixture: ${fixtureName}`);
    try {
        // Try the new fixture-based approach
        const newContext = await createTestContextWithFixture(fixtureName, {
            mockTemplate: true, // Use mock until JSON issue resolved
            ...options
        });
        console.log(`✅ Migration successful - using fixture approach`);
        return newContext;
    }
    catch (error) {
        console.warn(`⚠️  Fixture migration failed, falling back to old setup:`, error.message);
        // Fallback to old approach but wrap it in new interface
        const oldContext = await oldTestSetup();
        // Convert old context to new format
        return await wrapLegacyContext(oldContext, fixtureName);
    }
}
/**
 * Detect required fixture based on test patterns
 */
export function detectRequiredFixture(testCode) {
    const fixtures = [];
    // Analyze schema usage patterns
    const schemaPatterns = [
        { pattern: /createOne\(['"`]account['"`]/, fixture: 'basic' },
        { pattern: /createOne\(['"`]contact['"`]/, fixture: 'basic' },
        { pattern: /createOne\(['"`]user['"`]/, fixture: 'user-management' },
        { pattern: /createOne\(['"`]product['"`]/, fixture: 'ecommerce' },
        { pattern: /createOne\(['"`]order['"`]/, fixture: 'ecommerce' },
        { pattern: /createOne\(['"`]article['"`]/, fixture: 'content' },
        { pattern: /createOne\(['"`]permission['"`]/, fixture: 'complex-acl' }
    ];
    for (const { pattern, fixture } of schemaPatterns) {
        if (pattern.test(testCode) && !fixtures.includes(fixture)) {
            fixtures.push(fixture);
        }
    }
    // Default to basic if no specific patterns detected
    if (fixtures.length === 0) {
        fixtures.push('basic');
    }
    return fixtures;
}
/**
 * Generate comprehensive migration plan for a test file
 */
export function generateMigrationPlan(testCode, testFile = 'test.ts') {
    const detectedPatterns = detectOldPatterns(testCode);
    const analysis = analyzeTestComplexity(testCode);
    const recommendedFixtures = detectRequiredFixture(testCode);
    const migrationSteps = generateMigrationSteps(detectedPatterns, recommendedFixtures);
    return {
        testFile,
        detectedPatterns,
        recommendedFixtures,
        migrationSteps,
        estimatedTimeReduction: calculateTimeReduction(analysis),
        complexity: determineComplexity(detectedPatterns, analysis)
    };
}
/**
 * Detect old test patterns that can be migrated
 */
function detectOldPatterns(testCode) {
    const patterns = [];
    const lines = testCode.split('\n');
    lines.forEach((line, index) => {
        // Manual schema loading
        if (line.includes('readFile') && line.includes('.yaml')) {
            patterns.push({
                type: 'manual_schema_loading',
                line: index + 1,
                code: line.trim(),
                replacementSuggestion: 'Use createTestContextWithFixture() - schemas loaded automatically'
            });
        }
        // Manual tenant creation
        if (line.includes('createTestTenant()') || line.includes('createTestContext(')) {
            patterns.push({
                type: 'repetitive_setup',
                line: index + 1,
                code: line.trim(),
                replacementSuggestion: 'Replace with createTestContextWithFixture(\'basic\')'
            });
        }
        // Manual data creation loops
        if (line.includes('for') && (line.includes('createOne') || line.includes('database.create'))) {
            patterns.push({
                type: 'manual_data_creation',
                line: index + 1,
                code: line.trim(),
                replacementSuggestion: 'Use fixture with pre-generated data'
            });
        }
        // Schema creation calls
        if (line.includes('metabase.createOne') && line.includes('yaml')) {
            patterns.push({
                type: 'slow_setup',
                line: index + 1,
                code: line.trim(),
                replacementSuggestion: 'Schema automatically created with fixture'
            });
        }
    });
    return patterns;
}
/**
 * Analyze test complexity and setup time
 */
function analyzeTestComplexity(testCode) {
    const schemasUsed = [];
    const dataCreationPatterns = [];
    let setupComplexity = 0;
    // Find schema usage
    const schemaMatches = testCode.match(/createOne\(['"`](\w+)['"`]/g) || [];
    schemaMatches.forEach(match => {
        const schema = match.match(/createOne\(['"`](\w+)['"`]/)?.[1];
        if (schema && !schemasUsed.includes(schema)) {
            schemasUsed.push(schema);
        }
    });
    // Count setup operations
    const setupOperations = [
        /createTestTenant/g,
        /createTestContext/g,
        /readFile.*\.yaml/g,
        /metabase\.createOne/g,
        /database\.createOne/g
    ];
    setupOperations.forEach(pattern => {
        const matches = testCode.match(pattern);
        if (matches) {
            setupComplexity += matches.length;
        }
    });
    // Detect data creation patterns
    if (testCode.includes('for') && testCode.includes('createOne')) {
        dataCreationPatterns.push('loop_creation');
    }
    if (testCode.match(/createOne.*createOne.*createOne/)) {
        dataCreationPatterns.push('multiple_records');
    }
    // Estimate setup time based on complexity
    const baseTime = 500; // Base tenant creation time
    const perSchema = 2000; // Time per schema creation
    const perRecord = 100; // Time per record creation
    const estimatedSetupTime = baseTime + (schemasUsed.length * perSchema) + (setupComplexity * perRecord);
    // Determine migration recommendation
    let migrationRecommendation = 'low';
    if (estimatedSetupTime > 10000 || schemasUsed.length > 2) {
        migrationRecommendation = 'high';
    }
    else if (estimatedSetupTime > 5000 || setupComplexity > 5) {
        migrationRecommendation = 'medium';
    }
    return {
        schemasUsed,
        dataCreationPatterns,
        setupComplexity,
        estimatedSetupTime,
        migrationRecommendation
    };
}
/**
 * Generate step-by-step migration instructions
 */
function generateMigrationSteps(patterns, fixtures) {
    const steps = [];
    let order = 1;
    // Step 1: Add import
    steps.push({
        order: order++,
        action: 'Add import',
        description: 'Import the new test helpers',
        newCode: `import { createTestContextWithFixture, TestContextWithData } from '../helpers/test-tenant.js';`,
        automated: true
    });
    // Step 2: Replace beforeAll setup
    if (patterns.some(p => p.type === 'repetitive_setup' || p.type === 'manual_schema_loading')) {
        const primaryFixture = fixtures[0] || 'basic';
        steps.push({
            order: order++,
            action: 'Replace beforeAll setup',
            description: `Replace manual setup with fixture-based approach using '${primaryFixture}'`,
            oldCode: `beforeAll(async () => {
  tenantManager = await createTestTenant();
  testContext = await createTestContext(tenantManager.tenant!, 'root');
  // ... manual schema/data creation
});`,
            newCode: `beforeAll(async () => {
  testContext = await createTestContextWithFixture('${primaryFixture}', {
    mockTemplate: true // Remove when JSON issue is resolved
  });
});`,
            automated: false
        });
    }
    // Step 3: Update context type
    steps.push({
        order: order++,
        action: 'Update context type',
        description: 'Change TestContext to TestContextWithData for enhanced features',
        oldCode: `let testContext: TestContext;`,
        newCode: `let testContext: TestContextWithData;`,
        automated: true
    });
    // Step 4: Remove manual schema/data creation
    if (patterns.some(p => p.type === 'manual_data_creation' || p.type === 'slow_setup')) {
        steps.push({
            order: order++,
            action: 'Remove manual setup',
            description: 'Remove manual schema and data creation - now handled by fixture',
            oldCode: `// Manual schema loading
const accountYaml = await readFile('schema/account.yaml', 'utf-8');
await testContext.metabase.createOne('account', accountYaml);

// Manual data creation
for (let i = 0; i < 10; i++) {
  await testContext.database.createOne('account', {...});
}`,
            newCode: `// Data automatically available via fixture
// Use testContext.helpers.getRecordCount('account') to verify`,
            automated: false
        });
    }
    // Step 5: Add helper usage examples
    steps.push({
        order: order++,
        action: 'Use enhanced helpers',
        description: 'Take advantage of new helper methods for better tests',
        newCode: `// Use enhanced helpers
const accountCount = await testContext.helpers.getRecordCount('account');
const randomAccount = await testContext.helpers.getRandomRecord('account');
await testContext.helpers.assertRecordExists('account', { account_type: 'personal' });`,
        automated: false
    });
    return steps;
}
/**
 * Calculate estimated time reduction from migration
 */
function calculateTimeReduction(analysis) {
    const oldTime = analysis.estimatedSetupTime;
    const newTime = 500; // Fixture loading time
    const reduction = oldTime - newTime;
    const percentage = Math.round((reduction / oldTime) * 100);
    if (reduction > 10000) {
        return `${Math.round(reduction / 1000)}s → 0.5s (${percentage}x faster)`;
    }
    else {
        return `${oldTime}ms → ${newTime}ms (${percentage}% faster)`;
    }
}
/**
 * Determine migration complexity
 */
function determineComplexity(patterns, analysis) {
    const patternCount = patterns.length;
    const schemaCount = analysis.schemasUsed.length;
    if (patternCount <= 3 && schemaCount <= 2) {
        return 'simple';
    }
    else if (patternCount <= 7 && schemaCount <= 4) {
        return 'moderate';
    }
    else {
        return 'complex';
    }
}
/**
 * Wrap legacy test context in new interface
 */
async function wrapLegacyContext(oldContext, fixtureName) {
    console.log(`🔧 Wrapping legacy context for fixture: ${fixtureName}`);
    // Create basic helpers for legacy context
    const helpers = {
        async getRecordCount(schemaName) {
            try {
                return await oldContext.database.count(schemaName);
            }
            catch {
                return 0;
            }
        },
        async getRandomRecord(schemaName) {
            try {
                const records = await oldContext.database.selectAny(schemaName, { limit: 5 });
                return records.length > 0 ? records[Math.floor(Math.random() * records.length)] : null;
            }
            catch {
                return null;
            }
        },
        async findRecordWhere(schemaName, criteria) {
            try {
                return await oldContext.database.selectOne(schemaName, criteria);
            }
            catch {
                return null;
            }
        },
        hasSchema(schemaName) {
            // Assume basic schemas exist
            return ['account', 'contact', 'user', 'schema'].includes(schemaName);
        },
        getSchemaNames() {
            return ['account', 'contact']; // Default assumption
        },
        async getRelatedRecords() {
            return {};
        },
        async assertRecordExists(schemaName, criteria) {
            const record = await this.findRecordWhere(schemaName, criteria);
            if (!record) {
                throw new Error(`Expected record not found in ${schemaName}: ${JSON.stringify(criteria)}`);
            }
        },
        async assertRecordCount(schemaName, expectedCount) {
            const actualCount = await this.getRecordCount(schemaName);
            if (actualCount !== expectedCount) {
                throw new Error(`Expected ${expectedCount} records in ${schemaName}, found ${actualCount}`);
            }
        }
    };
    return {
        ...oldContext,
        fixtureName,
        availableSchemas: ['account', 'contact'],
        recordCounts: {},
        testDatabase: oldContext.tenant.database,
        templateSource: 'manual',
        helpers
    };
}
/**
 * Generate migration summary report
 */
export function generateMigrationReport(plans) {
    const totalFiles = plans.length;
    const complexFiles = plans.filter(p => p.complexity === 'complex').length;
    const highPriorityFiles = plans.filter(p => p.detectedPatterns.some(pattern => pattern.type === 'slow_setup' || pattern.type === 'manual_data_creation')).length;
    const report = `
# Test Migration Report

## Summary
- **Total test files analyzed**: ${totalFiles}
- **High-priority migrations**: ${highPriorityFiles}
- **Complex migrations**: ${complexFiles}

## Recommended Migration Order
${plans
        .sort((a, b) => {
        const priorities = { 'complex': 3, 'moderate': 2, 'simple': 1 };
        return priorities[b.complexity] - priorities[a.complexity];
    })
        .slice(0, 5)
        .map((plan, i) => `${i + 1}. **${plan.testFile}** (${plan.complexity}) - ${plan.estimatedTimeReduction}`)
        .join('\n')}

## Migration Benefits
- **Reduced setup time**: Average ${plans.reduce((sum, p) => {
        const match = p.estimatedTimeReduction.match(/(\d+)s → 0\.5s/);
        return sum + (match ? parseInt(match[1]) : 0);
    }, 0) / plans.length}s per test
- **Cleaner test code**: Fewer setup lines, more focus on test logic
- **Realistic test data**: Pre-generated fixtures with relationships
`;
    return report;
}
//# sourceMappingURL=migration-helpers.js.map