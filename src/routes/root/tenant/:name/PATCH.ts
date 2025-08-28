import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { TenantValidation } from '@src/lib/tenant-validation.js';
import { logger } from '@src/lib/logger.js';

/**
 * PATCH /api/root/tenant/:name - Update tenant properties (localhost development only)
 * 
 * Updates tenant properties like host, activation status, etc.
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
    
    const body = await context.req.json();
    const { host, is_active } = body;
    
    // Validate that we have something to update
    if (!host && is_active === undefined) {
      return context.json({
        success: false,
        error: 'At least one property (host, is_active) must be provided for update'
      }, 400);
    }
    
    logger.info('Updating tenant via root API', { tenantName, updates: body });
    
    // Check if tenant exists
    const existingTenant = await TenantService.getTenant(tenantName);
    if (!existingTenant) {
      return context.json({
        success: false,
        error: `Tenant '${tenantName}' not found`
      }, 404);
    }
    
    // Since TenantService doesn't have an update method, we'll implement it directly
    // This is a placeholder for the actual update logic that would need to be added
    // to TenantService or implemented here with direct database access
    
    // For now, return a not implemented response
    return context.json({
      success: false,
      error: 'Tenant updates not yet implemented - TenantService.updateTenant() method needed'
    }, 501);
    
    // TODO: Implement this once TenantService.updateTenant() is available:
    // await TenantService.updateTenant(tenantName, { host, is_active });
    // 
    // const updatedTenant = await TenantService.getTenant(tenantName);
    // 
    // return context.json({
    //   success: true,
    //   tenant: updatedTenant,
    //   updated_at: new Date().toISOString()
    // });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant update failed via root API', { 
      tenantName: context.req.param('name'),
      error: errorMessage 
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}