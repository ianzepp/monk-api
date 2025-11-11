// Set up global logger instance
import { logger } from '@src/lib/logger.js';
global.logger = logger;

// Import process environment as early as possible
import dotenv from 'dotenv';
dotenv.config({ debug: true });

// Sanity check for required env values
if (!process.env.DATABASE_URL) {
    throw Error('Fatal: environment is missing "DATABASE_URL"');
}

if (!process.env.PORT) {
    throw Error('Fatal: environment is missing "PORT"');
}

if (!process.env.JWT_SECRET) {
    throw Error('Fatal: environment is missing "JWT_SECRET"');
}

if (!process.env.NODE_ENV) {
    throw Error('Fatal: environment is missing "NODE_ENV"');
}

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
import { checkDatabaseConnection, closeDatabaseConnection } from '@src/db/index.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api-helpers.js';

// Observer preload
import { ObserverLoader } from '@src/lib/observers/loader.js';

// Middleware
import * as middleware from '@src/lib/middleware/index.js';

// Root API

// Public route handlers (no authentication required)
import * as publicAuthRoutes from '@src/public/auth/routes.js';

// Public docs  (no authentication required)
import * as publicDocsRoutes from '@src/public/docs/routes.js';

// Protected API handlers (JWT + user validation required)
import * as authRoutes from '@src/routes/auth/routes.js';
import * as dataRoutes from '@src/routes/data/routes.js';
import * as describeRoutes from '@src/routes/describe/routes.js';
import * as fileRoutes from '@src/routes/file/routes.js';
import * as aclsRoutes from '@src/routes/acls/routes.js';
import { rootRouter } from '@src/routes/root/index.js';

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
            home: ['/'],
            health: ['/health'],
            public_auth: ['/auth/login', '/auth/register', '/auth/refresh'],
            docs: ['/README.md', '/docs/:api'],
            auth: ['/api/auth/whoami', '/api/auth/sudo'],
            describe: ['/api/describe/:schema'],
            data: [
                '/api/data/:schema',
                '/api/data/:schema/:record',
                '/api/data/:schema/:record/:relationship',
                '/api/data/:schema/:record/:relationship/:child'
            ],
            find: ['/api/find/:schema'],
            bulk: ['/api/bulk'],
            file: [
                '/api/file/list',
                '/api/file/retrieve',
                '/api/file/store',
                '/api/file/stat',
                '/api/file/delete',
                '/api/file/size',
                '/api/file/modify-time'
            ],
            acls: ['/api/acls/:schema/:record'],
            root: ['/api/root/*']
        },
        documentation: {
            home: ['/README.md'],
            auth: ['/docs/auth', '/docs/public-auth'],
            describe: ['/docs/describe'],
            data: ['/docs/data'],
            find: ['/docs/find'],
            bulk: ['/docs/bulk'],
            file: ['/docs/file'],
            acls: ['/docs/acls'],
            root: ['/docs/root'],
        },
    };

    return createSuccessResponse(c, response);
});

// Health check endpoint (public, no authentication required)
app.get('/health', c => {
    return createSuccessResponse(c, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: packageJson.version,
        uptime: process.uptime()
    });
});

// Note: systemContextMiddleware only applied to protected routes that need it

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
app.use('/api/*', middleware.systemContextMiddleware);
app.use('/api/*', middleware.responseJsonMiddleware);

// 30-auth-api: Auth API routes (protected - user account management)
app.get('/api/auth/whoami', authRoutes.WhoamiGet); // GET /api/auth/whoami
app.post('/api/auth/sudo', authRoutes.SudoPost); // POST /api/auth/sudo

// 31-describe-api: Describe API routes
app.post('/api/describe/:schema', describeRoutes.SchemaPost); // Create schema (with URL name)
app.get('/api/describe/:schema', describeRoutes.SchemaGet); // Get schema
app.put('/api/describe/:schema', describeRoutes.SchemaPut); // Update schema
app.delete('/api/describe/:schema', describeRoutes.SchemaDelete); // Delete schema

// 32-data-api: Data API routes
app.post('/api/data/:schema', dataRoutes.SchemaPost); // Create records
app.get('/api/data/:schema', dataRoutes.SchemaGet); // List records
app.put('/api/data/:schema', dataRoutes.SchemaPut); // Bulk update records
app.delete('/api/data/:schema', dataRoutes.SchemaDelete); // Bulk delete records

app.get('/api/data/:schema/:record', dataRoutes.RecordGet); // Get single record
app.put('/api/data/:schema/:record', dataRoutes.RecordPut); // Update single record
app.delete('/api/data/:schema/:record', dataRoutes.RecordDelete); // Delete single record

app.get('/api/data/:schema/:record/:relationship', dataRoutes.RelationshipGet); // Get array of related records
app.post('/api/data/:schema/:record/:relationship', dataRoutes.RelationshipPost); // Create new related record
app.delete('/api/data/:schema/:record/:relationship', dataRoutes.RelationshipDelete); // Delete all related records
app.get('/api/data/:schema/:record/:relationship/:child', dataRoutes.NestedRecordGet); // Get specific related record
app.put('/api/data/:schema/:record/:relationship/:child', dataRoutes.NestedRecordPut); // Update specific related record
app.delete('/api/data/:schema/:record/:relationship/:child', dataRoutes.NestedRecordDelete); // Delete specific related record

// 33-find-api: Find API routes
app.post('/api/find/:schema', FindSchemaPost);

// 35-bulk-api: Bulk API routes
app.post('/api/bulk', BulkPost);

// 37-file-api: File API routes
app.post('/api/file/list', fileRoutes.ListPost); // Directory listing
app.post('/api/file/retrieve', fileRoutes.RetrievePost); // File retrieval
app.post('/api/file/store', fileRoutes.StorePost); // File storage
app.post('/api/file/stat', fileRoutes.StatPost); // File status
app.post('/api/file/delete', fileRoutes.DeletePost); // File deletion
app.post('/api/file/size', fileRoutes.SizePost); // File size
app.post('/api/file/modify-time', fileRoutes.ModifyTimePost); // File modification time

// 38-acls-api: Acls API routes
app.get('/api/acls/:schema/:record', aclsRoutes.RecordAclGet); // Get acls for a single record
app.post('/api/acls/:schema/:record', aclsRoutes.RecordAclPost); // Merge acls for a single record
app.put('/api/acls/:schema/:record', aclsRoutes.RecordAclPut); // Replace acls for a single record
app.delete('/api/acls/:schema/:record', aclsRoutes.RecordAclDelete); // Delete acls for a single record

// 39-root-api: Root API routes (require elevated root access)
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
