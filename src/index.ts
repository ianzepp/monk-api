// Import package.json for version info
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

// Set up global logger instance
import { logger } from '@src/lib/logger.js';
global.logger = logger;

// Imports
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { checkDatabaseConnection, closeDatabaseConnection } from '@src/db/index.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api/responses.js';
import { AuthService } from '@src/lib/auth.js';
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { 
    systemContextMiddleware, 
    responseJsonMiddleware, 
    responseFileMiddleware,
    localhostDevelopmentOnlyMiddleware 
} from '@src/lib/middleware/index.js';
import { rootRouter } from '@src/routes/root/index.js';

// Auth API handlers (clean barrel exports)
import * as authRoutes from '@src/routes/auth/routes.js';

// Data API handlers (clean barrel exports)
import * as dataRoutes from '@src/routes/data/routes.js';

// Meta API handlers (clean barrel exports)
import * as metaRoutes from '@src/routes/meta/routes.js';

// FTP Middleware handlers
import FtpListPost from '@src/routes/ftp/list.js'; // POST /ftp/list
import FtpRetrievePost from '@src/routes/ftp/retrieve.js'; // POST /ftp/retrieve
import FtpStorePost from '@src/routes/ftp/store.js'; // POST /ftp/store
import FtpStatPost from '@src/routes/ftp/stat.js'; // POST /ftp/stat
import FtpDeletePost from '@src/routes/ftp/delete.js'; // POST /ftp/delete
import FtpSizePost from '@src/routes/ftp/size.js'; // POST /ftp/size
import FtpModifyTimePost from '@src/routes/ftp/modify-time.js'; // POST /ftp/modify-time

// Special endpoints
import BulkPost from '@src/routes/bulk/POST.js'; // POST /api/bulk
import FindSchemaPost from '@src/routes/find/:schema/POST.js'; // POST /api/find/:schema
import DocsGet from '@src/routes/docs/:api/GET.js'; // GET /docs/:api.id

// Create Hono app
const app = new Hono();

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

// Root endpoint
app.get('/', c => {
    const response = {
        name: 'Monk API (Hono)',
        version: packageJson.version,
        description: 'Lightweight PaaS backend API built with Hono',
        endpoints: {
            auth: '/auth/*',
            docs: '/docs[/:api]',
            root: undefined as string | undefined,
            data: '/api/data/:schema[/:record] (protected)',
            meta: '/api/meta/:schema (protected)',
            find: '/api/find/:schema (protected)',
            bulk: '/api/bulk (protected)',
        },
        documentation: {
            auth: '/docs/auth (markdown format)',
            data: '/docs/data (markdown format)',
            meta: '/docs/meta (markdown format)',
        },
    };

    if (process.env.NODE_ENV === 'development') {
        response.endpoints.root = '/root/* (localhost development only)';
    }

    return createSuccessResponse(c, response);
});

// Docs are up front, since they require no auth
// app.get('/README.md', c => {});
app.get('/docs/:api', DocsGet);

// Auth API middleware
app.use('/auth/*', responseJsonMiddleware); // Auth API: JSON responses

// Auth API routes
app.post('/auth/login', authRoutes.LoginPost); // POST /auth/login
app.post('/auth/register', authRoutes.RegisterPost); // POST /auth/register
app.post('/auth/refresh', authRoutes.RefreshPost); // POST /auth/refresh
app.get('/auth/whoami', AuthService.getJWTMiddleware(), AuthService.getUserContextMiddleware(), authRoutes.WhoamiGet); // GET /auth/me

// Root API middleware (must come before protected routes)
app.use('/root/*', localhostDevelopmentOnlyMiddleware);
app.use('/root/*', responseJsonMiddleware);

// Root API routes - Must be before JWT middleware
app.route('/root', rootRouter);

// Protected API routes - require JWT authentication from /auth
app.use('/api/*', AuthService.getJWTMiddleware());
app.use('/api/*', AuthService.getUserContextMiddleware());
app.use('/api/*', systemContextMiddleware);

// Meta API middleware
app.use('/api/meta/*', responseJsonMiddleware); // Meta API: JSON responses

// Meta API routes (clean barrel export organization)
app.post('/api/meta/:schema', metaRoutes.SchemaPost); // Create schema (with URL name)
app.get('/api/meta/:schema', metaRoutes.SchemaGet); // Get schema
app.put('/api/meta/:schema', metaRoutes.SchemaPut); // Update schema
app.delete('/api/meta/:schema', metaRoutes.SchemaDelete); // Delete schema

// Data API middleware
app.use('/api/data/*', responseJsonMiddleware); // Data API: JSON responses

// Data API routes (clean barrel export organization)
app.post('/api/data/:schema', dataRoutes.SchemaPost); // Create records
app.get('/api/data/:schema', dataRoutes.SchemaGet); // List records
app.put('/api/data/:schema', dataRoutes.SchemaPut); // Bulk update records
app.delete('/api/data/:schema', dataRoutes.SchemaDelete); // Bulk delete records
app.get('/api/data/:schema/:record', dataRoutes.RecordGet); // Get single record
app.put('/api/data/:schema/:record', dataRoutes.RecordPut); // Update single record
app.delete('/api/data/:schema/:record', dataRoutes.RecordDelete); // Delete single record

// File API middleware (TODO)
app.use('/api/file/*', responseFileMiddleware); // Future: File responses

// Bulk API middleware
app.use('/api/bulk/*', responseJsonMiddleware); // Bulk API: JSON responses

// Bulk API routes
app.post('/api/bulk', BulkPost);

// Find API middleware
app.use('/api/find/*', responseJsonMiddleware); // Bulk API: JSON responses

// Find API routes
app.post('/api/find/:schema', FindSchemaPost);

// FTP middleware
app.use('/ftp/*', AuthService.getJWTMiddleware());
app.use('/ftp/*', AuthService.getUserContextMiddleware());
app.use('/ftp/*', systemContextMiddleware);
app.use('/ftp/*', responseJsonMiddleware);

// FTP routes
app.post('/ftp/list', FtpListPost); // Directory listing
app.post('/ftp/retrieve', FtpRetrievePost); // File retrieval
app.post('/ftp/store', FtpStorePost); // File storage
app.post('/ftp/stat', FtpStatPost); // File status
app.post('/ftp/delete', FtpDeletePost); // File deletion
app.post('/ftp/size', FtpSizePost); // File size
app.post('/ftp/modify-time', FtpModifyTimePost); // File modification time

// Error handling
app.onError((err, c) => createInternalError(c, err));

// 404 handler
app.notFound(c => {
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
const port = Number(process.env.PORT || 9001);

// Initialize observer system
logger.info('Preloading observer system');
try {
    await ObserverLoader.preloadObservers();
    logger.info('Observer system ready');
} catch (error) {
    console.error(`❌ Observer system initialization failed:`, error);
    logger.warn('Continuing without observer system');
}

// Check for --no-startup flag
if (process.argv.includes('--no-startup')) {
    logger.info('✅ Startup test successful - all modules loaded without errors');
    process.exit(0);
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
