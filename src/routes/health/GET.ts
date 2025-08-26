import type { Context } from 'hono';
import { checkDatabaseConnection } from '@src/db/index.js';
import { createSuccessResponse, createInternalError } from '@src/lib/api/responses.js';

export default async function (c: Context) {
    try {
        const dbHealthy = await checkDatabaseConnection();

        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: dbHealthy ? 'connected' : 'disconnected',
            version: '1.0.0',
        };

        return createSuccessResponse(c, health);
    } 
    
    // Health check error handling
    catch (error) {
        logger.warn('Health check failed', { error });
        return createInternalError(c, 'Health check failed');
    }
}