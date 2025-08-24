import { Hono } from 'hono';
import { AuthService } from '@lib/auth.js';
import { DatabaseManager } from '@lib/database-manager.js';

const app = new Hono();

// GET /ping - Simple health check with optional JWT domain and database connection test
app.get('/', async (c) => {
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
        console.debug(`🔐 Auth header present: ${!!authHeader}`);
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            console.debug(`🎫 JWT token extracted (${token.length} chars)`);
            
            const payload = await AuthService.verifyToken(token);
            console.debug(`✅ JWT verified, payload:`, payload);
            
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
                    console.debug(`✅ Database connection test passed for domain: ${domain}`);
                } catch (dbError) {
                    databaseStatus = dbError instanceof Error ? dbError.message : 'Database connection failed';
                    console.debug(`❌ Database connection failed:`, dbError);
                }
            }
        } else {
            console.debug(`🚫 No valid Authorization header found`);
        }
    } catch (error) {
        // JWT verification failed, but ping should still work
        console.debug(`❌ JWT verification failed:`, error);
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
            console.warn('Failed to log ping request:', logError);
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
});

export default app;