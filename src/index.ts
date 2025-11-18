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
import { ObserverValidator } from '@src/lib/observers/validator.js';

// Middleware
import * as middleware from '@src/lib/middleware/index.js';

// Root API

// Route handlers
import * as authRoutes from '@src/routes/auth/routes.js';
import * as dataRoutes from '@src/routes/data/routes.js';
import * as describeRoutes from '@src/routes/describe/routes.js';
import * as aclsRoutes from '@src/routes/acls/routes.js';
import * as statRoutes from '@src/routes/stat/routes.js';
import * as docsRoutes from '@src/routes/docs/routes.js';
import * as historyRoutes from '@src/routes/history/routes.js';
import { sudoRouter } from '@src/routes/sudo/index.js';

// Special protected endpoints
import BulkPost from '@src/routes/bulk/POST.js'; // POST /api/bulk
import FindSchemaPost from '@src/routes/find/:schema/POST.js'; // POST /api/find/:schema
import AggregateSchemaPost from '@src/routes/aggregate/:schema/POST.js'; // POST /api/aggregate/:schema

// Check database connection before doing anything else
logger.info('Checking database connection:');
logger.info('- NODE_ENV:', process.env.NODE_ENV);
logger.info('- DATABASE_URL:', process.env.DATABASE_URL);
logger.info('- TENANT_NAMING_MODE:', process.env.TENANT_NAMING_MODE || 'default (enterprise)');
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

    const result = await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    logger.info('Request completed', { method, path, status, duration });

    return result;
});

// Root endpoint
app.get('/', c => {
    const response = {
        name: 'Monk API (Hono)',
        version: packageJson.version,
        description: 'Lightweight PaaS backend API built with Hono',
        endpoints: {
            home: ['/', '/health'],
            docs: ['/README.md', '/docs/:api'],
            auth: [
                '/auth/login',
                '/auth/register',
                '/auth/refresh',
                '/auth/tenants',
                '/auth/templates',
                '/api/auth/whoami',
                '/api/auth/sudo'
            ],
            describe: ['/api/describe/:schema'],
            data: [
                '/api/data/:schema',
                '/api/data/:schema/:record',
                '/api/data/:schema/:record/:relationship',
                '/api/data/:schema/:record/:relationship/:child'
            ],
            find: ['/api/find/:schema'],
            aggregate: ['/api/aggregate/:schema'],
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
            sudo: ['/api/sudo/*']
        },
        documentation: {
            home: ['/README.md'],
            auth: ['/docs/auth'],
            describe: ['/docs/describe'],
            data: ['/docs/data'],
            find: ['/docs/find'],
            aggregate: ['/docs/aggregate'],
            bulk: ['/docs/bulk'],
            file: ['/docs/file'],
            acls: ['/docs/acls'],
            sudo: ['/docs/sudo'],
            stat: ['/docs/stat'],
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
app.use('/auth/*', middleware.requestBodyParserMiddleware); // Parse request bodies (TOON, YAML, JSON)
app.use('/auth/*', middleware.formatDetectionMiddleware); // Detect format for responses
app.use('/auth/*', middleware.fieldExtractionMiddleware); // Extract/unwrap data via ?unwrap or ?select=
app.use('/auth/*', middleware.responseFormatterMiddleware); // Format responses (JSON, TOON, YAML, Brainfuck)
app.use('/docs/*' /* no auth middleware */); // Docs: plain text responses

// Protected API routes - require JWT authentication from /auth
app.use('/api/*', middleware.requestBodyParserMiddleware);
app.use('/api/*', middleware.jwtValidationMiddleware);
app.use('/api/*', middleware.userValidationMiddleware);
app.use('/api/*', middleware.formatDetectionMiddleware);
app.use('/api/*', middleware.fieldExtractionMiddleware); // Extract/unwrap data via ?unwrap or ?select=
app.use('/api/*', middleware.responseFormatterMiddleware);
app.use('/api/*', middleware.systemContextMiddleware);

// 40-docs-api: Public docs routes (no authentication required)
app.get('/README.md', docsRoutes.ReadmeGet); // GET /README.md
app.get('/docs/:api', docsRoutes.ApiGet); // GET /docs/:api

// 30-auth-api: Public auth routes (token acquisition)
app.post('/auth/login', authRoutes.LoginPost); // POST /auth/login
app.post('/auth/register', authRoutes.RegisterPost); // POST /auth/register
app.post('/auth/refresh', authRoutes.RefreshPost); // POST /auth/refresh
app.get('/auth/tenants', authRoutes.TenantsGet); // GET /auth/tenants
app.get('/auth/templates', authRoutes.TemplatesGet); // GET /auth/templates

// 30-auth-api: Auth API routes (protected - user account management)
app.get('/api/auth/whoami', authRoutes.WhoamiGet); // GET /api/auth/whoami
app.post('/api/auth/sudo', authRoutes.SudoPost); // POST /api/auth/sudo

// 31-describe-api: Describe API routes
app.get('/api/describe', describeRoutes.SchemaList); // Lists all schemas
app.post('/api/describe/:schema', describeRoutes.SchemaPost); // Create schema (with URL name)
app.get('/api/describe/:schema', describeRoutes.SchemaGet); // Get schema
app.put('/api/describe/:schema', describeRoutes.SchemaPut); // Update schema
app.delete('/api/describe/:schema', describeRoutes.SchemaDelete); // Delete schema

// 31-describe-api: Column-level Describe API routes
app.post('/api/describe/:schema/:column', describeRoutes.ColumnPost); // Create column
app.get('/api/describe/:schema/:column', describeRoutes.ColumnGet); // Get column
app.put('/api/describe/:schema/:column', describeRoutes.ColumnPut); // Update column
app.delete('/api/describe/:schema/:column', describeRoutes.ColumnDelete); // Delete column

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

// 34-aggregate-api: Aggregate API routes
app.post('/api/aggregate/:schema', AggregateSchemaPost);

// 35-bulk-api: Bulk API routes
app.post('/api/bulk', BulkPost);

// 38-acls-api: Acls API routes
app.get('/api/acls/:schema/:record', aclsRoutes.RecordAclGet); // Get acls for a single record
app.post('/api/acls/:schema/:record', aclsRoutes.RecordAclPost); // Merge acls for a single record
app.put('/api/acls/:schema/:record', aclsRoutes.RecordAclPut); // Replace acls for a single record
app.delete('/api/acls/:schema/:record', aclsRoutes.RecordAclDelete); // Delete acls for a single record

// 39-stat-api: Stat API routes (record metadata without user data)
app.get('/api/stat/:schema/:record', statRoutes.RecordGet); // Get record metadata (timestamps, etag, size)

// 41-sudo-api: Sudo API routes (require sudo token from /api/auth/sudo)
app.use('/api/sudo/*', middleware.sudoAccessMiddleware);
app.route('/api/sudo', sudoRouter);

// 42-history-api: History API routes (change tracking and audit trails)
app.get('/api/history/:schema/:record', historyRoutes.RecordHistoryGet); // List all changes for a record
app.get('/api/history/:schema/:record/:change', historyRoutes.ChangeGet); // Get specific change by change_id

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
    // Validate observer files before loading
    const validationResult = await ObserverValidator.validateAll();
    if (!validationResult.valid) {
        console.error(ObserverValidator.formatErrors(validationResult));
        throw new Error(`Observer validation failed with ${validationResult.errors.length} errors`);
    }

    await ObserverLoader.preloadObservers();
    logger.info('Observer system ready', {
        observersValidated: validationResult.filesChecked,
        warnings: validationResult.warnings.length
    });
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
