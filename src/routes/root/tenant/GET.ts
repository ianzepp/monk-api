import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { logger } from '@src/lib/logger.js';

/**
 * GET /api/root/tenant - List all tenants (localhost development only)
 * 
 * Returns list of all tenants in the system.
 * This endpoint bypasses authentication for UIX development convenience.
 * 
 * Security: Only available on localhost with NODE_ENV=development
 */
export default async function (context: Context): Promise<any> {
  
  try {
    logger.info('Listing tenants via root API');
    
    // Get query parameters for filtering
    const includeTrashed = context.req.query('include_trashed') === 'true';
    const includeDeleted = context.req.query('include_deleted') === 'true';
    
    // Get tenants with soft delete awareness
    const tenants = await TenantService.listTenantsWithStatus(includeTrashed, includeDeleted);
    
    // Transform to include status information
    const tenantsWithMetadata = tenants.map(tenant => ({
      name: tenant.name,
      database: tenant.database,
      host: tenant.host,
      created_at: tenant.created_at,
      updated_at: tenant.updated_at,
      trashed_at: tenant.trashed_at,
      deleted_at: tenant.deleted_at,
      status: tenant.trashed_at ? 'trashed' : tenant.deleted_at ? 'deleted' : 'active'
    }));
    
    logger.info('Tenants listed successfully via root API', { 
      tenantCount: tenants.length 
    });
    
    return context.json({
      success: true,
      tenants: tenantsWithMetadata,
      count: tenants.length
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant listing failed via root API', { 
      error: errorMessage 
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}