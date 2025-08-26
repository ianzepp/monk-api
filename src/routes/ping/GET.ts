import type { Context } from 'hono';
import { AuthService } from '@lib/auth.js';
import { DatabaseManager } from '@lib/database-manager.js';
import { logger } from '@lib/logger.js';

// GET /ping - Simple health check with optional JWT domain and database connection test
export default async function (c: Context): Promise<any> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    // Get request information
    const clientIpRaw = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || '127.0.0.1';
    const clientIp = clientIpRaw.split(',')[0].trim(); // Handle comma-separated IPs from proxies
    const userAgent = c.req.header('user-agent') || 'unknown';
    const requestId = c.req.header('x-request-id') || 'unknown';
    
    // Try to get domain from JWT if Authorization header is present
    let domain = null;
    let databaseStatus = null;
    let jwtUserId = null;
    let jwtAccess = null;
    let db = null;
    
    try {
        const authHeader = c.req.header('Authorization');
        logger.info('Auth header validation', { hasAuth: !!authHeader });
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            logger.info('JWT token extracted', { tokenLength: token.length });
            
            const payload = await AuthService.verifyToken(token);
            logger.info('JWT verification successful', { tenant: payload.tenant, access: payload.access });
            
            domain = payload.tenant;  // JWT uses 'tenant' field, not 'domain'
            jwtUserId = payload.user_id;
            jwtAccess = payload.access;
            
            // Test database connection using full database name from JWT
            if (payload.database) {
                try {
                    db = await DatabaseManager.getDatabaseForDomain(payload.database);
                    
                    // Execute a fast connection test query
                    await db.query('SELECT 1 as test_connection');
                    
                    databaseStatus = 'ok';
                    logger.info('Database connection test passed', { domain });
                } catch (dbError) {
                    databaseStatus = dbError instanceof Error ? dbError.message : 'Database connection failed';
                    logger.warn('Database connection failed', { domain, error: dbError });
                }
            }
        } else {
            logger.info('No authorization header found');
        }
    } catch (error) {
        // JWT verification failed, but ping should still work
        logger.info('JWT verification failed', { error });
        // domain remains null
    }
    
    // Calculate response time
    const responseTimeMs = Date.now() - startTime;
    
    // Log ping request to database (non-transactional, best effort)
    if (db && databaseStatus === 'ok') {
        try {
            await db.query(
                `INSERT INTO pings (
                    timestamp, client_ip, user_agent, request_id, response_time_ms,
                    jwt_domain, jwt_user_id, jwt_access, database_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    timestamp,
                    clientIp,
                    userAgent,
                    requestId,
                    responseTimeMs,
                    domain,
                    jwtUserId,
                    jwtAccess,
                    databaseStatus
                ]
            );
        } catch (logError) {
            // Ignore logging errors - ping should still succeed
            logger.warn('Failed to log ping request', { error: logError instanceof Error ? logError.message : String(logError) });
        }
    }
    
    const response: any = {
        pong: timestamp,
        domain: domain
    };
    
    // Include database status if we tested a connection
    if (databaseStatus !== null) {
        response.database = databaseStatus;
    }
    
    return c.json(response);
}