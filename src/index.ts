import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { checkDatabaseConnection, closeDatabaseConnection } from './db/index.js';
import { createSuccessResponse, createInternalError } from './lib/api/responses.js';
import dataRouter from './routes/data.js';
import metaRouter from './routes/meta.js';
import findRouter from './routes/find.js';
import bulkRouter from './routes/bulk.js';

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
            data: '/api/data/:schema[/:id]',
            meta: '/api/meta/*',
            find: '/api/find/:schema',
            bulk: '/api/bulk',
        },
    });
});

// API routes
app.route('/api/data', dataRouter);
app.route('/api/meta', metaRouter);
app.route('/api/find', findRouter);
app.route('/api/bulk', bulkRouter);

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

// Start server
console.log(`🚀 Starting Monk API (Hono) on port ${port}...`);

const server = serve({
    fetch: app.fetch,
    port,
});

console.log(`✅ Server running at http://localhost:${port}`);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close();
    await closeDatabaseConnection();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close();
    await closeDatabaseConnection();
    process.exit(0);
});

export default app;
