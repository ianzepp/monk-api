/**
 * Request Tracking Middleware
 *
 * Records all API requests to the database for analytics, monitoring,
 * and connection health verification. Runs early in middleware chain.
 */

import type { Context, Next } from 'hono';
import { DatabaseConnection } from '@src/lib/database-connection.js';

/**
 * Request tracking middleware - logs all requests to database
 *
 * Serves dual purpose:
 * 1. Records request information for analytics and error context
 * 2. Verifies PostgreSQL connectivity early in request lifecycle
 *
 * Should be applied early in middleware chain, before authentication.
 */
export async function requestTrackingMiddleware(context: Context, next: Next) {
    // Extract request information
    const method = context.req.method;
    const url = context.req.url;
    const path = context.req.path;
    const api = extractApiFromPath(path);

    // Extract client information from headers
    const ipAddress =
        context.req.header('x-forwarded-for') ||
        context.req.header('x-real-ip') ||
        context.req.header('cf-connecting-ip') || // Cloudflare
        'unknown';
    const userAgent = context.req.header('user-agent') || '';

    try {
        // Insert request record (connection health check + request logging)
        const pool = DatabaseConnection.getMainPool();
        const result = await pool.query(
            `
            INSERT INTO requests (method, url, path, api, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `,
            [method, url, path, api, ipAddress, userAgent]
        );

        // Store request ID for potential response updates (future enhancement)
        if (result.rows?.[0]?.id) {
            context.set('requestId', result.rows[0].id);
        }

        // Database connection verified - continue with request
        await next();
    } catch (error) {
        // Database connection failed - this is a critical system issue
        console.error('Database connection failed during request tracking:', error);

        // Return service unavailable (don't proceed if database is down)
        return context.json(
            {
                success: false,
                error: 'Service temporarily unavailable',
                error_code: 'DATABASE_UNAVAILABLE',
            },
            503
        );
    }
}

/**
 * Extract API category from request path
 * Used for request analytics and routing insights
 */
function extractApiFromPath(path: string): string | null {
    if (path.startsWith('/auth/')) return 'auth';
    if (path.startsWith('/api/data/')) return 'data';
    if (path.startsWith('/api/meta/')) return 'meta';
    if (path.startsWith('/api/file/')) return 'file';
    if (path.startsWith('/api/bulk')) return 'bulk';
    if (path.startsWith('/api/find/')) return 'find';
    if (path.startsWith('/docs/')) return 'docs';
    if (path.startsWith('/root/')) return 'root';
    if (path === '/') return 'root';
    if (path === '/README.md') return 'docs';
    return null;
}
