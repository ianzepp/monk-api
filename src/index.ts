// Load monk configuration before other imports
import { MonkEnv } from './lib/monk-env.js';
MonkEnv.load();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { checkDatabaseConnection, closeDatabaseConnection } from './db/index.js';
import { createSuccessResponse, createInternalError } from './lib/api/responses.js';
// Data API handlers
import DataSchemaPost from './routes/data/:schema/POST.js';           // POST /api/data/:schema
import DataSchemaGet from './routes/data/:schema/GET.js';             // GET /api/data/:schema
import DataSchemaPut from './routes/data/:schema/PUT.js';             // PUT /api/data/:schema
import DataSchemaDelete from './routes/data/:schema/DELETE.js';       // DELETE /api/data/:schema
import DataSchemaIdGet from './routes/data/:schema/:id/GET.js';       // GET /api/data/:schema/:id
import DataSchemaIdPut from './routes/data/:schema/:id/PUT.js';       // PUT /api/data/:schema/:id
import DataSchemaIdDelete from './routes/data/:schema/:id/DELETE.js'; // DELETE /api/data/:schema/:id

// Meta API handlers  
import MetaSchemaPost from './routes/meta/schema/POST.js';             // POST /api/meta/schema
import MetaSchemaNameGet from './routes/meta/schema/:name/GET.js';     // GET /api/meta/schema/:name
import MetaSchemaNamePut from './routes/meta/schema/:name/PUT.js';     // PUT /api/meta/schema/:name
import MetaSchemaNameDelete from './routes/meta/schema/:name/DELETE.js'; // DELETE /api/meta/schema/:name

// Auth handlers
import AuthLoginPost from './routes/auth/login/POST.js';               // POST /auth/login
import AuthRefreshPost from './routes/auth/refresh/POST.js';           // POST /auth/refresh
import AuthMeGet from './routes/auth/me/GET.js';                       // GET /auth/me

// FTP Middleware handlers
import FtpListPost from '@src/routes/ftp/list.js';                        // POST /ftp/list
import FtpRetrievePost from '@src/routes/ftp/retrieve.js';                // POST /ftp/retrieve  
import FtpStorePost from '@src/routes/ftp/store.js';                      // POST /ftp/store
import FtpStatPost from '@src/routes/ftp/stat.js';                        // POST /ftp/stat

// Special endpoints
import BulkPost from './routes/bulk/POST.js';                          // POST /api/bulk
import FindSchemaPost from './routes/find/:schema/POST.js';            // POST /api/find/:schema
import PingGet from './routes/ping/GET.js';                            // GET /ping
import { AuthService } from './lib/auth.js';
import { logger } from './lib/logger.js';
import { ObserverLoader } from '@observers/loader.js';
import { 
    systemContextMiddleware, 
    responseJsonMiddleware, 
    responseYamlMiddleware,
    responseFileMiddleware 
} from '@lib/middleware/system-context.js';

// Create Hono app
const app = new Hono();

// Health check endpoint
app.get('/health', async (c) => {
    try {
        const dbHealthy = await checkDatabaseConnection();

        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: dbHealthy ? 'connected' : 'disconnected',
            version: '1.0.0',
        };

        return createSuccessResponse(c, health);
    } catch (error) {
        console.error('Health check failed:', error);
        return createInternalError(c, 'Health check failed');
    }
});

// Root endpoint
app.get('/', (c) => {
    return createSuccessResponse(c, {
        name: 'Monk API (Hono)',
        version: '1.0.0',
        description: 'Lightweight PaaS backend API built with Hono',
        endpoints: {
            health: '/health',
            auth: '/auth/*',
            ping: '/ping',
            data: '/api/data/:schema[/:id] (protected)',
            meta: '/api/meta/* (protected)',
            find: '/api/find/:schema (protected)',
            bulk: '/api/bulk (protected)',
            root: '/api/root/* (protected, admin only)',
        },
    });
});

// Request logging middleware
app.use('*', async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    
    logger.info('Request completed', { method, path, status, duration });
});

// Granular response formatting middleware by API path
app.use('/api/data/*', responseJsonMiddleware);  // Data API: JSON responses
app.use('/api/meta/*', responseYamlMiddleware);  // Meta API: YAML responses  
app.use('/api/file/*', responseFileMiddleware);  // Future: File responses
app.use('/ftp/*', responseJsonMiddleware);       // FTP Middleware: JSON responses

// Public routes
app.post('/auth/login', AuthLoginPost);                             // POST /auth/login
app.post('/auth/refresh', AuthRefreshPost);                         // POST /auth/refresh
app.get('/auth/me', AuthService.getJWTMiddleware(), AuthService.getUserContextMiddleware(), AuthMeGet); // GET /auth/me
app.get('/ping', PingGet);                                          // GET /ping

// Protected API routes - require JWT authentication
app.use('/api/*', AuthService.getJWTMiddleware());
app.use('/api/*', AuthService.getUserContextMiddleware());
app.use('/api/*', systemContextMiddleware);

// FTP Middleware routes - require JWT authentication  
app.use('/ftp/*', AuthService.getJWTMiddleware());
app.use('/ftp/*', AuthService.getUserContextMiddleware());
app.use('/ftp/*', systemContextMiddleware);

// Data API routes
app.post('/api/data/:schema', DataSchemaPost);                      // Create records
app.get('/api/data/:schema', DataSchemaGet);                        // List records
app.put('/api/data/:schema', DataSchemaPut);                        // Bulk update records
app.delete('/api/data/:schema', DataSchemaDelete);                  // Bulk delete records
app.get('/api/data/:schema/:id', DataSchemaIdGet);                  // Get single record
app.put('/api/data/:schema/:id', DataSchemaIdPut);                  // Update single record
app.delete('/api/data/:schema/:id', DataSchemaIdDelete);            // Delete single record

// Meta API routes
app.post('/api/meta/schema', MetaSchemaPost);                       // Create schema
app.get('/api/meta/schema/:name', MetaSchemaNameGet);               // Get schema
app.put('/api/meta/schema/:name', MetaSchemaNamePut);               // Update schema
app.delete('/api/meta/schema/:name', MetaSchemaNameDelete);         // Delete schema

// FTP Middleware routes
app.post('/ftp/list', FtpListPost);                                 // Directory listing
app.post('/ftp/retrieve', FtpRetrievePost);                         // File retrieval
app.post('/ftp/store', FtpStorePost);                               // File storage
app.post('/ftp/stat', FtpStatPost);                                 // File status

// Special API routes
app.post('/api/bulk', BulkPost);                                    // Bulk operations
app.post('/api/find/:schema', FindSchemaPost);                     // Advanced search

// Error handling
app.onError((err, c) => {
    console.error('Unhandled error:', err);
    return createInternalError(c, 'An unexpected error occurred');
});

// 404 handler
app.notFound((c) => {
    return c.json(
        {
            success: false,
            error: 'Not found',
            error_code: 'NOT_FOUND',
        },
        404
    );
});

// Server configuration
const port = Number(process.env.PORT) || 9001;

// Initialize observer system
logger.info('Preloading observer system');
try {
    await ObserverLoader.preloadObservers();
    logger.info('Observer system ready');
} catch (error) {
    console.error(`❌ Observer system initialization failed:`, error);
    logger.warn('Continuing without observer system');
}

// Start HTTP server only
logger.info('Starting Monk HTTP API Server (Hono)');
logger.info('For FTP server, see monk-ftp project: https://github.com/ianzepp/monk-ftp');

const server = serve({
    fetch: app.fetch,
    port,
});

logger.info('HTTP API server running', { port, url: `http://localhost:${port}` });

// Graceful shutdown
const gracefulShutdown = async () => {
    logger.info('Shutting down HTTP API server gracefully');
    
    // Stop HTTP server
    server.close();
    logger.info('HTTP server stopped');
    
    // Close database connections
    await closeDatabaseConnection();
    logger.info('Database connections closed');
    
    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default app;
