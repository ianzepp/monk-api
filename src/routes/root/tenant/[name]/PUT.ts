import type { Context } from 'hono';
import { TenantService } from '@lib/services/tenant.js';
import { logger } from '@lib/logger.js';

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
    
    if (!tenantName) {
      return context.json({
        success: false,
        error: 'Tenant name parameter is required'
      }, 400);
    }
    
    // Validate tenant name format
    if (!/^[a-z0-9-]+$/.test(tenantName)) {
      return context.json({
        success: false,
        error: 'Invalid tenant name format'
      }, 400);
    }
    
    logger.info('Restoring tenant via root API', { tenantName });
    
    // Restore tenant using TenantService
    await TenantService.restoreTenant(tenantName);
    
    logger.info('Tenant restored successfully via root API', { tenantName });
    
    return context.json({
      success: true,
      tenant: tenantName,
      restored: true,
      restored_at: new Date().toISOString()
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