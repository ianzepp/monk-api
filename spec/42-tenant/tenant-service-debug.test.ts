import { describe, test, expect } from 'vitest';
import { TenantService } from '@src/lib/services/tenant.js';

describe('TenantService Debug - Isolate SCRAM Issue', () => {
  
  test('should isolate which TenantService method fails', async () => {
    try {
      console.info(`🔍 Step 1: Testing tenantExists()`);
      const exists = await TenantService.tenantExists('debug-test-001');
      console.info(`✅ tenantExists() works: ${exists}`);
      
      console.info(`🔍 Step 2: Testing databaseExists()`);
      const dbExists = await TenantService.databaseExists('debug_test_001');
      console.info(`✅ databaseExists() works: ${dbExists}`);
      
      console.info(`🔍 Step 3: Testing TenantService.createTenant()`);
      const tenant = await TenantService.createTenant('debug-test-002', 'localhost', false);
      console.info(`✅ createTenant() works:`, tenant);
      
      // Clean up
      await TenantService.deleteTenant('debug-test-002');
      console.info(`✅ Cleanup completed`);
      
    } catch (error) {
      console.error(`❌ Isolated method failed:`, error);
      throw error;
    }
  });
});