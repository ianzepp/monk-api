import { describe, test, expect } from 'vitest';
import { MonkEnv } from '@lib/monk-env.js';
import { TenantService } from '@lib/services/tenant.js';
describe('TenantService Debug - Isolate SCRAM Issue', () => {
    test('should isolate which TenantService method fails', async () => {
        // Load monk configuration
        MonkEnv.load();
        try {
            console.log(`🔍 Step 1: Testing tenantExists()`);
            const exists = await TenantService.tenantExists('debug-test-001');
            console.log(`✅ tenantExists() works: ${exists}`);
            console.log(`🔍 Step 2: Testing databaseExists()`);
            const dbExists = await TenantService.databaseExists('monk-api$debug-test-001');
            console.log(`✅ databaseExists() works: ${dbExists}`);
            console.log(`🔍 Step 3: Testing TenantService.createTenant()`);
            const tenant = await TenantService.createTenant('debug-test-002', 'localhost', false);
            console.log(`✅ createTenant() works:`, tenant);
            // Clean up
            await TenantService.deleteTenant('debug-test-002');
            console.log(`✅ Cleanup completed`);
        }
        catch (error) {
            console.error(`❌ Isolated method failed:`, error);
            throw error;
        }
    });
});
//# sourceMappingURL=tenant-service-debug.test.js.map