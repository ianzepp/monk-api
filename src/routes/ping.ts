import { Hono } from 'hono';
import { AuthService } from '../lib/auth.js';
import { DatabaseManager } from '../lib/database-manager.js';

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
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = await AuthService.verifyToken(token);
            domain = payload.domain;
            jwtUserId = payload.user_id;
            jwtAccess = payload.access;
            
            // Test database connection for the domain
            if (domain) {
                try {
                    db = await DatabaseManager.getDatabaseForDomain(domain);
                    
                    // Execute a fast connection test query
                    await db.query('SELECT 1 as test_connection');
                    
                    databaseStatus = 'ok';
                } catch (dbError) {
                    databaseStatus = dbError instanceof Error ? dbError.message : 'Database connection failed';
                }
            }
        }
    } catch (error) {
        // JWT verification failed, but ping should still work
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