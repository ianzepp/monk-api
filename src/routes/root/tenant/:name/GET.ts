import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { logger } from '@src/lib/logger.js';

/**
 * GET /api/root/tenant/:name - Get individual tenant details (localhost development only)
 * 
 * Returns detailed information about a specific tenant.
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
    
    // Validate tenant name format (updated for new underscore naming)
    if (!/^[a-z0-9_-]+$/.test(tenantName)) {
      return context.json({
        success: false,
        error: 'Invalid tenant name format'
      }, 400);
    }
    
    logger.info('Getting tenant details via root API', { tenantName });
    
    // Get tenant information
    const tenant = await TenantService.getTenant(tenantName);
    
    if (!tenant) {
      return context.json({
        success: false,
        error: `Tenant '${tenantName}' not found`
      }, 404);
    }
    
    logger.info('Tenant details retrieved successfully via root API', { tenantName });
    
    return context.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        database: tenant.database,
        host: tenant.host,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at,
        trashed_at: tenant.trashed_at,
        deleted_at: tenant.deleted_at,
        status: tenant.trashed_at ? 'trashed' : tenant.deleted_at ? 'deleted' : 'active'
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant details retrieval failed via root API', { 
      tenantName: context.req.param('name'),
      error: errorMessage 
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}