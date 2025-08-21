import { Hono } from 'hono';
import { AuthService } from '../lib/auth.js';
import { DatabaseManager } from '../lib/database-manager.js';

const app = new Hono();

// GET /ping - Simple health check with optional JWT domain and database connection test
app.get('/', async (c) => {
    const timestamp = new Date().toISOString();
    
    // Try to get domain from JWT if Authorization header is present
    let domain = null;
    let databaseStatus = null;
    
    try {
        const authHeader = c.req.header('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = await AuthService.verifyToken(token);
            domain = payload.domain;
            
            // Test database connection for the domain
            if (domain) {
                try {
                    const db = await DatabaseManager.getDatabaseForDomain(domain);
                    
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