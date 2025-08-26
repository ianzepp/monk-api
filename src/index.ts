// Load monk configuration into process.env before other imports
import { MonkEnv } from '@src/lib/monk-env.js';
MonkEnv.loadIntoProcessEnv();

// Set up global logger instance
import { logger } from '@src/lib/logger.js';
global.logger = logger;

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { checkDatabaseConnection, closeDatabaseConnection } from '@src/db/index.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api/responses.js';
// Data API handlers (clean barrel exports)
import * as dataRoutes from '@src/routes/data/routes.js';

// Meta API handlers (clean barrel exports)
import * as metaRoutes from '@src/routes/meta/routes.js';

// Auth handlers
import AuthLoginPost from '@src/routes/auth/login/POST.js';               // POST /auth/login
import AuthRefreshPost from '@src/routes/auth/refresh/POST.js';           // POST /auth/refresh
import AuthMeGet from '@src/routes/auth/me/GET.js';                       // GET /auth/me

// FTP Middleware handlers
import FtpListPost from '@src/routes/ftp/list.js';                        // POST /ftp/list
import FtpRetrievePost from '@src/routes/ftp/retrieve.js';                // POST /ftp/retrieve  
import FtpStorePost from '@src/routes/ftp/store.js';                      // POST /ftp/store
import FtpStatPost from '@src/routes/ftp/stat.js';                        // POST /ftp/stat

// Special endpoints
import BulkPost from '@src/routes/bulk/POST.js';                          // POST /api/bulk
import FindSchemaPost from '@src/routes/find/:schema/POST.js';            // POST /api/find/:schema
import PingGet from '@src/routes/ping/GET.js';                            // GET /ping
import { AuthService } from '@src/lib/auth.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { 
    systemContextMiddleware, 
    responseJsonMiddleware, 
    responseYamlMiddleware,
    responseFileMiddleware 
} from '@src/lib/middleware/system-context.js';
import { localhostDevelopmentOnlyMiddleware } from '@src/lib/middleware/localhost-development-only.js';
import { rootRouter } from '@src/routes/root/index.js';

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
            root: '/api/root/* (localhost development only)',
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
app.use('/auth/*', responseJsonMiddleware);      // Auth API: JSON responses

// Public routes
app.post('/auth/login', AuthLoginPost);                             // POST /auth/login
app.post('/auth/refresh', AuthRefreshPost);                         // POST /auth/refresh
app.get('/auth/me', AuthService.getJWTMiddleware(), AuthService.getUserContextMiddleware(), AuthMeGet); // GET /auth/me
app.get('/ping', PingGet);                                          // GET /ping

// Root API routes - localhost development only (no authentication)
app.use('/api/root/*', localhostDevelopmentOnlyMiddleware);
app.use('/api/root/*', responseJsonMiddleware);
app.route('/api/root', rootRouter);

// Protected API routes - require JWT authentication
app.use('/api/*', AuthService.getJWTMiddleware());
app.use('/api/*', AuthService.getUserContextMiddleware());
app.use('/api/*', systemContextMiddleware);

// FTP Middleware routes - require JWT authentication  
app.use('/ftp/*', AuthService.getJWTMiddleware());
app.use('/ftp/*', AuthService.getUserContextMiddleware());
app.use('/ftp/*', systemContextMiddleware);

// Data API routes (clean barrel export organization)
app.post('/api/data/:schema', dataRoutes.SchemaPost);               // Create records
app.get('/api/data/:schema', dataRoutes.SchemaGet);                 // List records
app.put('/api/data/:schema', dataRoutes.SchemaPut);                 // Bulk update records
app.delete('/api/data/:schema', dataRoutes.SchemaDelete);           // Bulk delete records
app.get('/api/data/:schema/:id', dataRoutes.RecordGet);             // Get single record
app.put('/api/data/:schema/:id', dataRoutes.RecordPut);             // Update single record
app.delete('/api/data/:schema/:id', dataRoutes.RecordDelete);       // Delete single record

// Meta API routes (clean barrel export organization)
app.post('/api/meta/schema', metaRoutes.SchemaPost);                // Create schema
app.get('/api/meta/schema/:name', metaRoutes.SchemaGet);            // Get schema
app.put('/api/meta/schema/:name', metaRoutes.SchemaPut);            // Update schema
app.delete('/api/meta/schema/:name', metaRoutes.SchemaDelete);      // Delete schema

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
const port = Number(MonkEnv.get('PORT', '9001'));

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
