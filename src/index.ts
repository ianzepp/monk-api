// Load monk configuration before other imports
import { MonkEnv } from './lib/monk-env.js';
MonkEnv.load();

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { checkDatabaseConnection, closeDatabaseConnection } from './db/index.js';
import { createSuccessResponse, createInternalError } from './lib/api/responses.js';
import dataRouter from './routes/data.js';
import metaRouter from './routes/meta.js';
import findRouter from './routes/find.js';
import bulkRouter from './routes/bulk.js';
import authRouter from './routes/auth.js';
import pingRouter from './routes/ping.js';
import rootRouter from './routes/root.js';
import { AuthService } from './lib/auth.js';
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
    
    console.log(`${method} ${path} - ${status} (${duration}ms)`);
});

// System context middleware - sets up System instance for all requests
app.use('*', systemContextMiddleware);

// Granular response formatting middleware by API path
app.use('/api/data/*', responseJsonMiddleware);  // Data API: JSON responses
app.use('/api/meta/*', responseYamlMiddleware);  // Meta API: YAML responses  
app.use('/api/file/*', responseFileMiddleware);  // Future: File responses

// Public routes
app.route('/auth', authRouter);
app.route('/ping', pingRouter);

// Protected API routes - require JWT authentication
app.use('/api/*', AuthService.getJWTMiddleware());
app.use('/api/*', AuthService.getUserContextMiddleware());

// API routes
app.route('/api/data', dataRouter);
app.route('/api/meta', metaRouter);
app.route('/api/find', findRouter);
app.route('/api/bulk', bulkRouter);
app.route('/api/root', rootRouter);

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
console.log(`🔄 Preloading observer system...`);
try {
    await ObserverLoader.preloadObservers();
    console.log(`✅ Observer system ready`);
} catch (error) {
    console.error(`❌ Observer system initialization failed:`, error);
    console.log(`⚠️  Continuing without observer system`);
}

// Start HTTP server only
console.log(`🚀 Starting Monk HTTP API Server (Hono)...`);
console.log(`📡 For FTP server, use: npm run ftp:start`);

const server = serve({
    fetch: app.fetch,
    port,
});

console.log(`✅ HTTP API server running at http://localhost:${port}`);

// Graceful shutdown
const gracefulShutdown = async () => {
    console.log('\n🛑 Shutting down HTTP API server gracefully...');
    
    // Stop HTTP server
    server.close();
    console.log('✅ HTTP server stopped');
    
    // Close database connections
    await closeDatabaseConnection();
    console.log('✅ Database connections closed');
    
    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default app;
