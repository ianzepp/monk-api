import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { TenantValidation } from '@src/lib/tenant-validation.js';
import { logger } from '@src/lib/logger.js';

/**
 * DELETE /api/root/tenant/:name - Delete tenant (localhost development only)
 * 
 * Soft deletes specified tenant by default (sets trashed_at).
 * Use ?force=true query parameter for permanent deletion (removes database).
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
    
    // Check if force delete is requested
    const force = context.req.query('force') === 'true';
    
    if (force) {
      logger.info('Hard deleting tenant via root API', { tenantName });
      
      // Hard delete tenant (removes database and record)
      await TenantService.deleteTenant(tenantName, true);
      
      logger.info('Tenant hard deleted successfully via root API', { tenantName });
      
      return context.json({
        success: true,
        tenant: {
          name: tenantName,
          deleted: true,
          deleted_at: new Date().toISOString()
        }
      });
    } else {
      logger.info('Soft deleting tenant via root API', { tenantName });
      
      // Soft delete tenant (sets trashed_at timestamp)
      await TenantService.trashTenant(tenantName);
      
      logger.info('Tenant soft deleted successfully via root API', { tenantName });
      
      return context.json({
        success: true,
        tenant: {
          name: tenantName,
          trashed: true,
          trashed_at: new Date().toISOString()
        }
      });
    }
    
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