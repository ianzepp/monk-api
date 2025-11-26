// Import process environment as early as possible
import dotenv from 'dotenv';

// Load environment-specific .env file
const envFile = process.env.NODE_ENV
    ? `.env.${process.env.NODE_ENV}`
    : '.env';
dotenv.config({ path: envFile, debug: true });

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
import * as mcpRoutes from '@src/routes/mcp/routes.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api-helpers.js';
import { setHonoApp as setInternalApiHonoApp } from '@src/lib/internal-api.js';

// Observer preload
import { ObserverLoader } from '@src/lib/observers/loader.js';
import { ObserverValidator } from '@src/lib/observers/validator.js';

// Middleware
import * as middleware from '@src/lib/middleware/index.js';

// Route handlers
import * as authRoutes from '@src/routes/auth/routes.js';
import * as testRoutes from '@src/routes/test/routes.js';
import * as userRoutes from '@src/routes/api/user/routes.js';
import * as dataRoutes from '@src/routes/api/data/routes.js';
import * as describeRoutes from '@src/routes/api/describe/routes.js';
import * as aclsRoutes from '@src/routes/api/acls/routes.js';
import * as statRoutes from '@src/routes/api/stat/routes.js';
import * as docsRoutes from '@src/routes/docs/routes.js';
import * as historyRoutes from '@src/routes/api/history/routes.js';
import * as extractRoutes from '@src/routes/api/extracts/routes.js';
import * as restoreRoutes from '@src/routes/api/restores/routes.js';
import * as gridRoutes from '@src/routes/api/grids/routes.js';
import { sudoRouter } from '@src/routes/api/sudo/index.js';

// Special protected endpoints
import BulkPost from '@src/routes/api/bulk/POST.js'; // POST /api/bulk
import FindModelPost from '@src/routes/api/find/:model/POST.js'; // POST /api/find/:model
import FindTargetGet from '@src/routes/api/find/:model/:target/GET.js'; // GET /api/find/:model/:target
import AggregateModelGet from '@src/routes/api/aggregate/:model/GET.js'; // GET /api/aggregate/:model
import AggregateModelPost from '@src/routes/api/aggregate/:model/POST.js'; // POST /api/aggregate/:model

// Check database connection before doing anything else
console.info('Checking database connection:');
console.info('- NODE_ENV:', process.env.NODE_ENV);
console.info('- PORT:', process.env.PORT);
console.info('- DATABASE_URL:', process.env.DATABASE_URL);
console.info('- SQLITE_DATA_DIR:', process.env.SQLITE_DATA_DIR);
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

    console.info('Request completed', { method, path, status, duration });

    return result;
});

// Apply response pipeline to root and health endpoints
app.use('/', middleware.formatDetectionMiddleware);
app.use('/', middleware.responsePipelineMiddleware);
app.use('/health', middleware.formatDetectionMiddleware);
app.use('/health', middleware.responsePipelineMiddleware);

// Root endpoint
app.get('/', context => {
    return context.json({
        success: true,
        data: {
            name: 'Monk API (Hono)',
            version: packageJson.version,
            description: 'Lightweight PaaS backend API built with Hono',
            endpoints: {
                health: ['/health'],
            docs: [
                '/docs',
                '/docs/auth',
                '/docs/describe',
                '/docs/data',
                '/docs/find',
                '/docs/aggregate',
                '/docs/bulk',
                '/docs/user',
                '/docs/acls',
                '/docs/stat',
                '/docs/history',
                '/docs/sudo',
            ],
            auth: [
                '/auth/login',
                '/auth/register',
                '/auth/refresh',
                '/auth/tenants',
                '/auth/templates'
            ],
            describe: [
                '/api/describe',
                '/api/describe/:model',
                '/api/describe/:model/fields',
                '/api/describe/:model/fields/:field'
            ],
            data: [
                '/api/data/:model',
                '/api/data/:model/:record',
                '/api/data/:model/:record/:relationship',
                '/api/data/:model/:record/:relationship/:child'
            ],
            find: [
                '/api/find/:model'
            ],
            aggregate: [
                '/api/aggregate/:model'
            ],
            bulk: [
                '/api/bulk'
            ],
            user: [
                '/api/user/whoami',
                '/api/user/sudo',
                '/api/user/profile',
                '/api/user/deactivate'
            ],
            acls: [
                '/api/acls/:model/:record'
            ],
            stat: [
                '/api/stat/:model/:record'
            ],
            history: [
                '/api/history/:model/:record',
                '/api/history/:model/:record/:change'
            ],
            sudo: [
                '/api/sudo/sandboxes/',
                '/api/sudo/sandboxes/:name',
                '/api/sudo/sandboxes/:name/extend',
                '/api/sudo/snapshots/',
                '/api/sudo/snapshots/:name',
                '/api/sudo/templates/',
                '/api/sudo/templates/:name',
                '/api/sudo/users/',
                '/api/sudo/users/:id',
            ],
            extracts: [
                '/api/extracts/:record/run',
                '/api/extracts/:record/cancel',
                '/api/extracts/runs/:runId/download',
                '/api/extracts/artifacts/:artifactId/download'
            ],
            restores: [
                '/api/restores/:record/run',
                '/api/restores/:record/cancel',
                '/api/restores/import'
            ],
            grids: [
                '/api/grids/:id/:range',
                '/api/grids/:id/cells'
            ]
        }
        }
    });
});

// Health check endpoint (public, no authentication required)
app.get('/health', context => {
    return context.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }
    });
});

// Note: systemContextMiddleware only applied to protected routes that need it

// Public routes (no authentication required)
app.use('/auth/*', middleware.requestBodyParserMiddleware); // Parse request bodies (TOON, YAML, JSON)
app.use('/auth/*', middleware.formatDetectionMiddleware); // Detect format for responses
app.use('/auth/*', middleware.responsePipelineMiddleware); // Response pipeline: extract → format → encrypt
app.use('/test/*', middleware.requestBodyParserMiddleware); // Parse request bodies (TOON, YAML, JSON)
app.use('/test/*', middleware.formatDetectionMiddleware); // Detect format for responses
app.use('/test/*', middleware.responsePipelineMiddleware); // Response pipeline: extract → format → encrypt
app.use('/docs/*' /* no auth middleware */); // Docs: plain text responses

// Protected API routes - require JWT authentication from /auth
app.use('/api/*', middleware.requestBodyParserMiddleware);
app.use('/api/*', middleware.jwtValidationMiddleware);
app.use('/api/*', middleware.userValidationMiddleware);
app.use('/api/*', middleware.formatDetectionMiddleware);
app.use('/api/*', middleware.responsePipelineMiddleware); // Response pipeline: extract → format → encrypt
app.use('/api/*', middleware.systemContextMiddleware);

// 40-docs-api: Public docs routes (no authentication required)
app.get('/docs', docsRoutes.ReadmeGet); // GET /docs
app.get('/docs/:endpoint{.*}', docsRoutes.ApiEndpointGet); // GET /docs/* (endpoint-specific docs)

// MCP route (public, uses internal auth via tool calls)
app.use('/mcp', middleware.requestBodyParserMiddleware);
mcpRoutes.setHonoApp(app);
app.post('/mcp', mcpRoutes.McpPost); // POST /mcp (JSON-RPC)

// Internal API (for fire-and-forget background jobs)
setInternalApiHonoApp(app);

// 30-auth-api: Public auth routes (token acquisition)
app.post('/auth/login', authRoutes.LoginPost); // POST /auth/login
app.post('/auth/register', authRoutes.RegisterPost); // POST /auth/register
app.post('/auth/refresh', authRoutes.RefreshPost); // POST /auth/refresh
app.get('/auth/tenants', authRoutes.TenantsGet); // GET /auth/tenants
app.get('/auth/templates', authRoutes.TemplatesGet); // GET /auth/templates

// Test utilities (dev/test environments only)
app.get('/test/pools', testRoutes.PoolsGet); // GET /test/pools
app.delete('/test/pools', testRoutes.PoolsDelete); // DELETE /test/pools

// 31-describe-api: Describe API routes
app.get('/api/describe', describeRoutes.ModelList); // Lists all models
app.post('/api/describe/:model', describeRoutes.ModelPost); // Create model (with URL name)
app.get('/api/describe/:model', describeRoutes.ModelGet); // Get model
app.put('/api/describe/:model', describeRoutes.ModelPut); // Update model
app.delete('/api/describe/:model', describeRoutes.ModelDelete); // Delete model

// 31-describe-api: Field-level Describe API routes
app.get('/api/describe/:model/fields', describeRoutes.FieldsList); // List all fields in model
app.post('/api/describe/:model/fields', describeRoutes.FieldsPost); // Create fields in bulk
app.put('/api/describe/:model/fields', describeRoutes.FieldsPut); // Update fields in bulk
app.post('/api/describe/:model/fields/:field', describeRoutes.FieldPost); // Create field
app.get('/api/describe/:model/fields/:field', describeRoutes.FieldGet); // Get field
app.put('/api/describe/:model/fields/:field', describeRoutes.FieldPut); // Update field
app.delete('/api/describe/:model/fields/:field', describeRoutes.FieldDelete); // Delete field

// 32-data-api: Data API routes
app.post('/api/data/:model', dataRoutes.ModelPost); // Create records
app.get('/api/data/:model', dataRoutes.ModelGet); // List records
app.put('/api/data/:model', dataRoutes.ModelPut); // Bulk update records
app.delete('/api/data/:model', dataRoutes.ModelDelete); // Bulk delete records

app.get('/api/data/:model/:record', dataRoutes.RecordGet); // Get single record
app.put('/api/data/:model/:record', dataRoutes.RecordPut); // Update single record
app.delete('/api/data/:model/:record', dataRoutes.RecordDelete); // Delete single record

app.get('/api/data/:model/:record/:relationship', dataRoutes.RelationshipGet); // Get array of related records
app.post('/api/data/:model/:record/:relationship', dataRoutes.RelationshipPost); // Create new related record
app.put('/api/data/:model/:record/:relationship', dataRoutes.RelationshipPut); // Bulk update related records (stub)
app.delete('/api/data/:model/:record/:relationship', dataRoutes.RelationshipDelete); // Delete all related records
app.get('/api/data/:model/:record/:relationship/:child', dataRoutes.NestedRecordGet); // Get specific related record
app.put('/api/data/:model/:record/:relationship/:child', dataRoutes.NestedRecordPut); // Update specific related record
app.delete('/api/data/:model/:record/:relationship/:child', dataRoutes.NestedRecordDelete); // Delete specific related record

// 33-find-api: Find API routes
app.post('/api/find/:model', FindModelPost);
app.get('/api/find/:model/:target', FindTargetGet);

// 34-aggregate-api: Aggregate API routes
app.get('/api/aggregate/:model', AggregateModelGet);
app.post('/api/aggregate/:model', AggregateModelPost);

// 35-bulk-api: Bulk API routes
app.post('/api/bulk', BulkPost);

// 36-user-api: User API routes (user identity and self-service management)
app.get('/api/user/whoami', userRoutes.WhoamiGet); // GET /api/user/whoami
app.post('/api/user/sudo', userRoutes.SudoPost); // POST /api/user/sudo
app.get('/api/user/profile', userRoutes.ProfileGet); // GET /api/user/profile
app.put('/api/user/profile', userRoutes.ProfilePut); // PUT /api/user/profile
app.post('/api/user/deactivate', userRoutes.DeactivatePost); // POST /api/user/deactivate

// 38-acls-api: Acls API routes
app.get('/api/acls/:model/:record', aclsRoutes.RecordAclGet); // Get acls for a single record
app.post('/api/acls/:model/:record', aclsRoutes.RecordAclPost); // Merge acls for a single record
app.put('/api/acls/:model/:record', aclsRoutes.RecordAclPut); // Replace acls for a single record
app.delete('/api/acls/:model/:record', aclsRoutes.RecordAclDelete); // Delete acls for a single record

// 39-stat-api: Stat API routes (record metadata without user data)
app.get('/api/stat/:model/:record', statRoutes.RecordGet); // Get record metadata (timestamps, etag, size)

// 41-sudo-api: Sudo API routes (require sudo token from /api/user/sudo)
app.use('/api/sudo/*', middleware.sudoAccessMiddleware);
app.route('/api/sudo', sudoRouter);

// 42-history-api: History API routes (change tracking and audit trails)
app.get('/api/history/:model/:record', historyRoutes.RecordHistoryGet); // List all changes for a record
app.get('/api/history/:model/:record/:change', historyRoutes.ChangeGet); // Get specific change by change_id

// 50-extracts-app: Extract application (data export jobs)
app.post('/api/extracts/:record/run', extractRoutes.ExtractRun); // Queue extract job
app.post('/api/extracts/:record/execute', extractRoutes.ExtractExecute); // Execute extract (internal, long-running)
app.post('/api/extracts/:record/cancel', extractRoutes.ExtractCancel); // Cancel running extract
app.get('/api/extracts/runs/:runId/download', extractRoutes.RunDownload); // Download all artifacts as ZIP
app.get('/api/extracts/artifacts/:artifactId/download', extractRoutes.ArtifactDownload); // Download single artifact

// 51-restores-app: Restore application (data import jobs)
app.post('/api/restores/:record/run', restoreRoutes.RestoreRun); // Queue restore job
app.post('/api/restores/:record/execute', restoreRoutes.RestoreExecute); // Execute restore (internal, long-running)
app.post('/api/restores/:record/cancel', restoreRoutes.RestoreCancel); // Cancel running restore
app.post('/api/restores/import', restoreRoutes.RestoreImport); // Upload and run in one call

// 52-grids-app: Grid application (spreadsheet-like cell storage)
app.get('/api/grids/:id/:range', gridRoutes.RangeGet); // Read cells (A1, A1:Z100, A:A, 5:5)
app.put('/api/grids/:id/:range', gridRoutes.RangePut); // Update cells/range
app.delete('/api/grids/:id/:range', gridRoutes.RangeDelete); // Clear cells/range
app.post('/api/grids/:id/cells', gridRoutes.CellsPost); // Bulk upsert cells

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
console.info('Preloading observer system');
try {
    // Validate observer files before loading
    const validationResult = await ObserverValidator.validateAll();
    if (!validationResult.valid) {
        console.error(ObserverValidator.formatErrors(validationResult));
        throw new Error(`Observer validation failed with ${validationResult.errors.length} errors`);
    }

    await ObserverLoader.preloadObservers();
    console.info('Observer system ready', {
        observersValidated: validationResult.filesChecked,
        warnings: validationResult.warnings.length
    });
} catch (error) {
    console.error(`❌ Observer system initialization failed:`, error);
    console.warn('Continuing without observer system');
}

// Check for --no-startup flag
if (process.argv.includes('--no-startup')) {
    console.info('✅ Startup test successful - all modules loaded without errors');
    process.exit(0);
}

// Start HTTP server
console.info('Starting Monk HTTP API Server (Hono)');
console.info('Related ecosystem projects:')
console.info('- monk-cli: Terminal commands for the API (https://github.com/ianzepp/monk-cli)');
console.info('- monk-uix: Web browser admin interface (https://github.com/ianzepp/monk-uix)');
console.info('- monk-api-bindings-ts: Typescript API bindings (https://github.com/ianzepp/monk-api-bindings-ts)');

// Start server using Hono's serve() - MCP is handled as a regular route via app.post('/mcp')
const server = serve({ fetch: app.fetch, port });

console.info('HTTP API server running', { port, url: `http://localhost:${port}` });
console.info('MCP endpoint available at POST /mcp (JSON-RPC)');

// Graceful shutdown
const gracefulShutdown = async () => {
    console.info('Shutting down HTTP API server gracefully');

    // Stop HTTP server
    server.close();
    console.info('HTTP server stopped');

    // Close database connections
    await closeDatabaseConnection();
    console.info('Database connections closed');

    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default app;
