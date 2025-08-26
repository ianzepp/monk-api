import type { Context } from 'hono';
import { TenantService } from '@lib/services/tenant.js';
import { logger } from '@lib/logger.js';

/**
 * DELETE /api/root/tenant/:name - Delete tenant (localhost development only)
 * 
 * Deletes specified tenant and its database.
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
    
    logger.info('Soft deleting tenant via root API', { tenantName });
    
    // Soft delete tenant (sets trashed_at timestamp)
    await TenantService.trashTenant(tenantName);
    
    logger.info('Tenant soft deleted successfully via root API', { tenantName });
    
    return context.json({
      success: true,
      tenant: tenantName,
      trashed: true,
      trashed_at: new Date().toISOString()
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant deletion failed via root API', { 
      tenantName: context.req.param('name'),
      error: errorMessage 
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}