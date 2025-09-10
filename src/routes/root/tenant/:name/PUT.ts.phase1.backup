import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { TenantValidation } from '@src/lib/tenant-validation.js';
import { logger } from '@src/lib/logger.js';

/**
 * PUT /api/root/tenant/:name - Restore soft deleted tenant (localhost development only)
 * 
 * Restores a soft deleted tenant by clearing the trashed_at timestamp.
 * This endpoint bypasses authentication for UIX development convenience.
 * 
 * Security: Only available on localhost with NODE_ENV=development
 */
export default async function (context: Context): Promise<any> {
  
  try {
    const tenantName = context.req.param('name');
    
    // Validate tenant name using shared validation
    const validation = TenantValidation.validateTenantName(tenantName);
    if (!validation.isValid) {
      return context.json({
        success: false,
        error: validation.error
      }, 400);
    }
    
    logger.info('Restoring tenant via root API', { tenantName });
    
    // Restore tenant using TenantService
    await TenantService.restoreTenant(tenantName);
    
    logger.info('Tenant restored successfully via root API', { tenantName });
    
    return context.json({
      success: true,
      tenant: {
        name: tenantName,
        restored: true,
        restored_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant restoration failed via root API', { 
      tenantName: context.req.param('name'),
      error: errorMessage 
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}