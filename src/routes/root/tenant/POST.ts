import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { TenantValidation } from '@src/lib/tenant-validation.js';
import { logger } from '@src/lib/logger.js';

/**
 * POST /api/root/tenant - Create new tenant (localhost development only)
 * 
 * Creates a new tenant with database initialization.
 * This endpoint bypasses authentication for UIX development convenience.
 * 
 * Security: Only available on localhost with NODE_ENV=development
 */
export default async function (context: Context): Promise<any> {
  
  try {
    const body = await context.req.json();
    const { name, host = 'localhost' } = body;
    
    // Validate tenant name using shared validation
    const validation = TenantValidation.validateTenantName(name);
    if (!validation.isValid) {
      return context.json({
        success: false,
        error: validation.error
      }, 400);
    }
    
    logger.info('Creating tenant via root API', { tenantName: name, host });
    
    // Create tenant using existing TenantService
    const tenantInfo = await TenantService.createTenant(name, host);
    
    logger.info('Tenant created successfully via root API', { 
      tenantName: name, 
      database: tenantInfo.database 
    });
    
    return context.json({
      success: true,
      tenant: tenantInfo.name,
      database: tenantInfo.database,
      host: tenantInfo.host,
      created_at: new Date().toISOString()
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant creation failed via root API', { 
      error: errorMessage
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}