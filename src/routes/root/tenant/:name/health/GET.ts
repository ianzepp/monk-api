import type { Context } from 'hono';
import { TenantService } from '@src/lib/services/tenant.js';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { logger } from '@src/lib/logger.js';

/**
 * GET /api/root/tenant/:name/health - Check tenant database connectivity (localhost development only)
 * 
 * Performs a health check on the tenant's database connectivity and basic functionality.
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
    
    logger.info('Checking tenant health via root API', { tenantName });
    
    const healthCheck = {
      tenant: tenantName,
      timestamp: new Date().toISOString(),
      checks: {
        tenant_exists: false,
        database_exists: false,
        database_connection: false,
        schema_table_exists: false,
        users_table_exists: false,
        root_user_exists: false
      },
      status: 'unknown' as 'healthy' | 'warning' | 'error' | 'unknown',
      errors: [] as string[]
    };
    
    try {
      // 1. Check if tenant exists in registry
      const tenant = await TenantService.getTenant(tenantName);
      if (tenant) {
        healthCheck.checks.tenant_exists = true;
        
        // 2. Check if database exists
        if (await TenantService.databaseExists(tenant.database)) {
          healthCheck.checks.database_exists = true;
          
          try {
            // 3. Test database connection
            const pool = DatabaseConnection.getTenantPool(tenant.database);
            const client = await pool.connect();
            
            try {
              // 4. Check if schema table exists
              const schemaResult = await client.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = 'schema'");
              healthCheck.checks.schema_table_exists = parseInt(schemaResult.rows[0].count) > 0;
              
              // 5. Check if users table exists
              const usersResult = await client.query("SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = 'users'");
              healthCheck.checks.users_table_exists = parseInt(usersResult.rows[0].count) > 0;
              
              // 6. Check if root user exists (if users table exists)
              if (healthCheck.checks.users_table_exists) {
                const rootUserResult = await client.query("SELECT COUNT(*) as count FROM users WHERE name = 'root'");
                healthCheck.checks.root_user_exists = parseInt(rootUserResult.rows[0].count) > 0;
              }
              
              healthCheck.checks.database_connection = true;
              
            } finally {
              client.release();
            }
            
          } catch (dbError) {
            healthCheck.errors.push(`Database connection failed: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
          }
          
        } else {
          healthCheck.errors.push('Database does not exist');
        }
        
      } else {
        healthCheck.errors.push('Tenant not found in registry');
      }
      
    } catch (error) {
      healthCheck.errors.push(`Tenant check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Determine overall status
    if (healthCheck.errors.length === 0) {
      const allChecks = Object.values(healthCheck.checks);
      if (allChecks.every(check => check === true)) {
        healthCheck.status = 'healthy';
      } else if (healthCheck.checks.tenant_exists && healthCheck.checks.database_connection) {
        healthCheck.status = 'warning';
      } else {
        healthCheck.status = 'error';
      }
    } else {
      healthCheck.status = 'error';
    }
    
    logger.info('Tenant health check completed via root API', { 
      tenantName, 
      status: healthCheck.status,
      errorCount: healthCheck.errors.length 
    });
    
    const httpStatus = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'warning' ? 200 : 503;
    
    return context.json({
      success: healthCheck.status !== 'error',
      health: healthCheck
    }, httpStatus);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.warn('Tenant health check failed via root API', { 
      tenantName: context.req.param('name'),
      error: errorMessage 
    });
    
    return context.json({
      success: false,
      error: errorMessage
    }, 500);
  }
}