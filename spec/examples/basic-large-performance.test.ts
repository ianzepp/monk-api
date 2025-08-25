/**
 * Basic Large Template Performance Testing
 * 
 * Tests the basic-large template with 100x datasets to verify
 * performance targets and large dataset handling.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { createTestContextWithFixture, TestContextWithData } from '../helpers/test-tenant.js';

describe('Basic Large Template Performance', () => {
  let context: TestContextWithData;
  let setupStartTime: number;

  beforeAll(async () => {
    console.log('🧪 Testing basic-large template performance...');
    setupStartTime = Date.now();
    
    context = await createTestContextWithFixture('basic-large', {
      mockTemplate: false // Use real template cloning
    });
  });

  test('should provide fast setup even with large datasets', () => {
    const setupTime = Date.now() - setupStartTime;
    console.log(`⚡ Large template setup completed in ${setupTime}ms`);
    
    // Should still be under 2 seconds even with 4,000+ records
    expect(setupTime).toBeLessThan(2000);
    expect(context.templateSource).toBe('cloned');
  });

  test('should have 100x larger datasets than basic', async () => {
    const accountCount = await context.helpers.getRecordCount('account');
    const contactCount = await context.helpers.getRecordCount('contact');
    
    console.log(`📊 Large dataset loaded: ${accountCount} accounts, ${contactCount} contacts`);
    
    // Should have ~1500 accounts and ~2500 contacts (100x basic template)
    expect(accountCount).toBeGreaterThan(1400); // Allow for edge cases
    expect(accountCount).toBeLessThan(1600);
    expect(contactCount).toBeGreaterThan(2400);
    expect(contactCount).toBeLessThan(2600);
    
    const totalRecords = accountCount + contactCount;
    expect(totalRecords).toBeGreaterThan(3900);
    console.log(`📈 Total records: ${totalRecords}`);
  });

  test('should handle complex queries efficiently on large dataset', async () => {
    const queryStart = Date.now();
    
    // Test complex filter query on large dataset
    const businessAccounts = await context.helpers.findRecordsWhere('account', {
      account_type: 'business'
    }, 100);
    
    const queryTime = Date.now() - queryStart;
    console.log(`🔍 Business accounts query: ${businessAccounts.length} results in ${queryTime}ms`);
    
    // Should complete quickly even with large dataset
    expect(queryTime).toBeLessThan(1000); // Under 1 second
    expect(businessAccounts.length).toBeGreaterThan(0);
  });

  test('should maintain data quality at scale', async () => {
    // Test data diversity in large dataset
    const accounts = await context.helpers.findRecordsWhere('account', {}, 50);
    
    const accountTypes = accounts.map(a => a.account_type);
    const uniqueTypes = [...new Set(accountTypes)];
    
    console.log(`📋 Account type diversity: ${uniqueTypes.join(', ')}`);
    expect(uniqueTypes.length).toBeGreaterThan(2); // Should have variety
    
    // Test relationship integrity
    const contactsWithAccounts = await context.database.selectAny('contact', {
      account_id: { $ne: null },
      limit: 100
    });
    
    console.log(`🔗 ${contactsWithAccounts.length}/100 contacts have account relationships`);
    expect(contactsWithAccounts.length).toBeGreaterThan(50); // Should maintain ~70% linkage
  });

  test('should support bulk operations on large dataset', async () => {
    const bulkStart = Date.now();
    
    // Create additional test data on top of large template
    const newAccounts = await context.helpers.seedCustomData('account', 10, {
      name: 'Performance Test Account',
      account_type: 'trial'
    });
    
    const bulkTime = Date.now() - bulkStart;
    console.log(`🔧 Bulk creation: ${newAccounts.length} records in ${bulkTime}ms`);
    
    expect(newAccounts.length).toBe(10);
    expect(bulkTime).toBeLessThan(5000); // Should be reasonable even with large existing dataset
  });

  test('should provide performance metrics for large template', () => {
    const metrics = context.helpers.getPerformanceMetrics();
    
    console.log(`📊 Performance metrics:`, {
      templateSource: metrics.templateSource,
      totalRecords: Object.values(metrics.recordCounts).reduce((sum, count) => sum + count, 0),
      recordCounts: metrics.recordCounts
    });
    
    expect(metrics.templateSource).toBe('cloned');
    expect(metrics.recordCounts.account).toBeGreaterThan(1400);
    expect(metrics.recordCounts.contact).toBeGreaterThan(2400);
  });
});