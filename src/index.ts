// Set up global logger instance
import { logger } from '@src/lib/logger.js';
global.logger = logger;

// Import process environment as early as possible
import dotenv from 'dotenv';
dotenv.config({ debug: true });

// Import package.json for version info
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

// Imports
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { checkDatabaseConnection, closeDatabaseConnection } from '@src/lib/database-connection.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api-helpers.js';
import { AuthService } from '@src/lib/auth.js';

// Observer preload
import { ObserverLoader } from '@src/lib/observers/loader.js';

// Middleware
import * as middleware from '@src/lib/middleware/index.js';

// Root API
import { rootRouter } from '@src/routes/root/index.js';

// Public route handlers (no authentication required)
import * as publicAuthRoutes from '@src/public/auth/routes.js';

// Public docs  (no authentication required)
import * as publicDocsRoutes from '@src/public/docs/routes.js';

// Protected API handlers (JWT + user validation required)
import * as authRoutes from '@src/routes/auth/routes.js';
import * as dataRoutes from '@src/routes/data/routes.js';
import * as metaRoutes from '@src/routes/meta/routes.js';
import * as fileRoutes from '@src/routes/file/routes.js';

// Special protected endpoints
import BulkPost from '@src/routes/bulk/POST.js'; // POST /api/bulk
import FindSchemaPost from '@src/routes/find/:schema/POST.js'; // POST /api/find/:schema

// Check database connection before doing anything else
logger.info('Checking database connection:');
logger.info('- NODE_ENV:', process.env.NODE_ENV);
logger.info('- DATABASE_URL:', process.env.DATABASE_URL);
checkDatabaseConnection();

// Create Hono app
const app = new Hono();

// Request tracking middleware (first - database health check + analytics)
app.use('*', middleware.requestTrackingMiddleware);

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
            public_auth: '/auth/* (public - token acquisition)',
            docs: '/docs[/:api] (public)',
            root: undefined as string | undefined,
            auth: '/api/auth/* (protected - user management)',
            data: '/api/data/:schema[/:record] (protected)',
            meta: '/api/meta/:schema (protected)',
            find: '/api/find/:schema (protected)',
            bulk: '/api/bulk (protected)',
            file: '/api/file/* (protected)',
        },
        documentation: {
            auth: ['/docs/auth', '/docs/public-auth'],
            data: ['/docs/data'],
            meta: ['/docs/meta'],
            file: ['/docs/file'],
            bulk: ['/docs/bulk'],
            find: ['/docs/find'],
            root: ['/docs/root'],
        },
    };

    if (process.env.NODE_ENV === 'development') {
        response.endpoints.root = '/api/root/* (protected - requires root JWT)';
    }

    return createSuccessResponse(c, response);
});

// All requests generate a system context, which starts out as an unauthenticated
// user. This is to allow consistency in internal expectations around what structures
// exist at any given moment.
app.use('/*', middleware.systemContextMiddleware);

// Public routes (no authentication required)
app.use('/auth/*', middleware.responseJsonMiddleware); // Public auth: JSON responses
app.use('/docs/*' /* no auth middleware */); // Docs: plain text responses

// Public auth routes (token acquisition)
app.post('/auth/login', publicAuthRoutes.LoginPost); // POST /auth/login
app.post('/auth/register', publicAuthRoutes.RegisterPost); // POST /auth/register
app.post('/auth/refresh', publicAuthRoutes.RefreshPost); // POST /auth/refresh

// Public docs routes
app.get('/README.md', publicDocsRoutes.ReadmeGet); // GET /README.md
app.get('/docs/:api', publicDocsRoutes.ApiGet); // GET /docs/:api

// Protected API routes - require JWT authentication from /auth
app.use('/api/*', middleware.jwtValidationMiddleware);
app.use('/api/*', middleware.userValidationMiddleware);
app.use('/api/*', middleware.responseJsonMiddleware);

// Auth API routes (protected - user account management)
app.get('/api/auth/whoami', authRoutes.WhoamiGet); // GET /api/auth/whoami
app.post('/api/auth/sudo', authRoutes.SudoPost); // POST /api/auth/sudo

// Meta API routes
app.post('/api/meta/:schema', metaRoutes.SchemaPost); // Create schema (with URL name)
app.get('/api/meta/:schema', metaRoutes.SchemaGet); // Get schema
app.put('/api/meta/:schema', metaRoutes.SchemaPut); // Update schema
app.delete('/api/meta/:schema', metaRoutes.SchemaDelete); // Delete schema

// Data API routes
app.post('/api/data/:schema', dataRoutes.SchemaPost); // Create records
app.get('/api/data/:schema', dataRoutes.SchemaGet); // List records
app.put('/api/data/:schema', dataRoutes.SchemaPut); // Bulk update records
app.delete('/api/data/:schema', dataRoutes.SchemaDelete); // Bulk delete records
app.get('/api/data/:schema/:record', dataRoutes.RecordGet); // Get single record
app.put('/api/data/:schema/:record', dataRoutes.RecordPut); // Update single record
app.delete('/api/data/:schema/:record', dataRoutes.RecordDelete); // Delete single record

// Find API routes
app.post('/api/find/:schema', FindSchemaPost);

// File API routes
app.post('/api/file/list', fileRoutes.ListPost); // Directory listing
app.post('/api/file/retrieve', fileRoutes.RetrievePost); // File retrieval
app.post('/api/file/store', fileRoutes.StorePost); // File storage
app.post('/api/file/stat', fileRoutes.StatPost); // File status
app.post('/api/file/delete', fileRoutes.DeletePost); // File deletion
app.post('/api/file/size', fileRoutes.SizePost); // File size
app.post('/api/file/modify-time', fileRoutes.ModifyTimePost); // File modification time

// Bulk API routes
app.post('/api/bulk', BulkPost);

// Find API routes
app.post('/api/find/:schema', FindSchemaPost);

// Root API routes (require elevated root access)
app.use('/api/root/*', middleware.rootAccessMiddleware);
app.route('/api/root', rootRouter);

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
logger.info('For FS server, see monk-ftp project: https://github.com/ianzepp/monk-ftp');
logger.info('For FS-like interaction via the commandline, see monk-cli project: https://github.com/ianzepp/monk-cli');

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
