// Import process environment as early as possible
import { loadEnv } from '@src/lib/env/load-env.js';

// Load environment-specific .env file
const envFile = process.env.NODE_ENV
    ? `.env.${process.env.NODE_ENV}`
    : '.env';
loadEnv({ path: envFile, debug: true });

// Default to standalone mode if DATABASE_URL not set
// This enables zero-config startup: just run the binary
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'sqlite:root';
}

// Import infrastructure management
import { Infrastructure, parseInfraConfig } from '@src/lib/infrastructure.js';

// Check infrastructure mode (sqlite vs postgresql)
const infraConfig = parseInfraConfig();
const isSqliteMode = infraConfig.dbType === 'sqlite';

// Set defaults for SQLite mode (zero-config standalone)
if (isSqliteMode) {
    // Set default SQLITE_DATA_DIR if not specified
    if (!process.env.SQLITE_DATA_DIR) {
        process.env.SQLITE_DATA_DIR = '.data';
    }
    // Set default PORT if not specified
    if (!process.env.PORT) {
        process.env.PORT = '9001';
    }
    // Set default JWT_SECRET if not specified (for standalone convenience)
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'standalone-dev-secret-change-in-production';
    }
    // Set default NODE_ENV if not specified
    if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'development';
    }
}

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

// Import package.json for version info (with fallback for compiled binary)
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

let packageJson = { name: 'monk-api', version: '4.0.1', description: 'Lightweight PaaS backend API' };
try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = join(__dirname, '../package.json');
    if (existsSync(pkgPath)) {
        packageJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
    }
} catch {
    // Use default values in compiled binary
}

// Imports
import { Hono } from 'hono';

import { DatabaseConnection } from '@src/lib/database-connection.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api-helpers.js';
import { setHonoApp as setInternalApiHonoApp } from '@src/lib/internal-api.js';

// Observer preload
import { ObserverLoader } from '@src/lib/observers/loader.js';

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
console.info('- Infrastructure mode:', infraConfig.dbType);

// Initialize infrastructure (creates tenants table if needed)
await Infrastructure.initialize();

if (!isSqliteMode) {
    // PostgreSQL mode: also verify connection pool health
    DatabaseConnection.healthCheck();
}

console.info('Infrastructure ready', {
    dbType: infraConfig.dbType,
    database: infraConfig.database,
});

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
            name: 'Monk API',
            version: packageJson.version,
            description: 'Lightweight PaaS backend API',
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
                '/auth/tenants'
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

// App packages - dynamically loaded from @monk-app/* packages on first request
// Apps mount under /app/* and use API-based data access
// Lazy loading ensures observers are ready before model creation
//
// Model namespace is per-model via the `external` field:
// - external: true  - Model installed in app's namespace (shared infrastructure)
// - external: false - Model installed in user's tenant (requires JWT auth)

// Track pending app load promises to prevent duplicate loads
const appLoadPromises = new Map<string, Promise<Hono | null>>();

// Lazy app loader - initializes app on first request
app.all('/app/:appName/*', async (c) => {
    const appName = c.req.param('appName');

    // Import loader functions
    const { loadHybridApp, appHasTenantModels } = await import('@src/lib/apps/loader.js');

    // Check if app has tenant models (requires JWT auth)
    // Note: This check may return false on first load before models are cached,
    // so we also check after loading if auth is needed for tenant model installation
    const needsAuth = appHasTenantModels(appName);

    // If app has tenant models, ensure user is authenticated
    if (needsAuth) {
        const jwtPayload = c.get('jwtPayload');
        if (!jwtPayload) {
            try {
                await middleware.jwtValidationMiddleware(c, async () => {});
            } catch (error) {
                return c.json({
                    success: false,
                    error: 'Authentication required for this app',
                    error_code: 'AUTH_REQUIRED'
                }, 401);
            }
        }
    }

    // Load app (handles both external and tenant models)
    let loadPromise = appLoadPromises.get(appName);
    if (!loadPromise) {
        loadPromise = loadHybridApp(appName, app, c);
        appLoadPromises.set(appName, loadPromise);
    }

    let appInstance: Hono | null = null;
    try {
        appInstance = await loadPromise;
    } finally {
        appLoadPromises.delete(appName);
    }

    // After first load, check again if auth is needed (models now cached)
    if (!needsAuth && appHasTenantModels(appName)) {
        const jwtPayload = c.get('jwtPayload');
        if (!jwtPayload) {
            try {
                await middleware.jwtValidationMiddleware(c, async () => {});
                // Re-load to install tenant models now that we have auth
                appInstance = await loadHybridApp(appName, app, c);
            } catch (error) {
                return c.json({
                    success: false,
                    error: 'Authentication required for this app',
                    error_code: 'AUTH_REQUIRED'
                }, 401);
            }
        }
    }

    if (!appInstance) {
        return c.json({ success: false, error: `App not found: ${appName}`, error_code: 'APP_NOT_FOUND' }, 404);
    }

    // Rewrite URL to remove /app/{appName} prefix for the sub-app
    const originalPath = c.req.path;
    const appPrefix = `/app/${appName}`;
    const subPath = originalPath.slice(appPrefix.length) || '/';

    // Create new request with rewritten path
    const url = new URL(c.req.url);
    url.pathname = subPath;

    // Forward the original Authorization header
    const headers = new Headers(c.req.raw.headers);

    const newRequest = new Request(url.toString(), {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
        // @ts-ignore - duplex is needed for streaming bodies
        duplex: 'half',
    });

    return appInstance.fetch(newRequest);
});

// Internal API (for fire-and-forget background jobs)
setInternalApiHonoApp(app);

// 30-auth-api: Public auth routes (token acquisition)
app.post('/auth/login', authRoutes.LoginPost); // POST /auth/login
app.post('/auth/register', authRoutes.RegisterPost); // POST /auth/register
app.post('/auth/refresh', authRoutes.RefreshPost); // POST /auth/refresh
app.get('/auth/tenants', authRoutes.TenantsGet); // GET /auth/tenants

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
    ObserverLoader.preloadObservers();
    console.info('Observer system ready', {
        observerCount: ObserverLoader.getObserverCount()
    });
} catch (error) {
    console.error(`Observer system initialization failed:`, error);
    console.warn('Continuing without observer system');
}

// Check for --no-startup flag
if (process.argv.includes('--no-startup')) {
    console.info('✅ Startup test successful - all modules loaded without errors');
    process.exit(0);
}

// Start HTTP server
console.info('Starting Monk HTTP API Server');
console.info('Related ecosystem projects:')
console.info('- monk-cli: Terminal commands for the API (https://github.com/ianzepp/monk-cli)');
console.info('- monk-uix: Web browser admin interface (https://github.com/ianzepp/monk-uix)');
console.info('- monk-api-bindings-ts: Typescript API bindings (https://github.com/ianzepp/monk-api-bindings-ts)');

// Log available app packages (lazy-loaded on first request)
try {
    const { discoverApps } = await import('@src/lib/apps/loader.js');
    const availableApps = await discoverApps();
    if (availableApps.length > 0) {
        console.info('Available app packages (lazy-loaded on first request):');
        for (const appName of availableApps) {
            console.info(`- @monk-app/${appName} → /app/${appName}`);
        }
    } else {
        console.info('No app packages installed');
    }
} catch (error) {
    console.info('No app packages installed');
}

// Start Bun HTTP server
const server = Bun.serve({
    fetch: app.fetch,
    port,
});
console.info('HTTP API server running', { port, url: `http://localhost:${port}` });

// Graceful shutdown
const gracefulShutdown = async () => {
    console.info('Shutting down HTTP API server gracefully');

    server.stop();
    console.info('HTTP server stopped');

    // Close database connections
    await DatabaseConnection.closeConnections();
    console.info('Database connections closed');

    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Named export for testing (avoid default export - Bun auto-serves default exports with fetch())
export { app };
