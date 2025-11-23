/**
 * User Context Validation Middleware
 * 
 * Uses JWT context values to validate user exists in tenant database.
 * Requires jwtValidationMiddleware to run first to populate context.
 */

import type { Context, Next } from 'hono';
import { DatabaseConnection } from '@src/lib/database-connection.js';
import { TenantService } from '@src/lib/services/tenant.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import type { JWTPayload } from './jwt-validation.js';

/**
 * User validation middleware - validates user exists in tenant database
 * 
 * Reads tenant/database/user_id from context (set by jwtValidationMiddleware).
 * Validates user exists and is active, then enriches context with user data.
 */
export async function userValidationMiddleware(context: Context, next: Next) {
    // Get JWT context values (set by jwtValidationMiddleware)
    const tenant = context.get('tenant');
    const dbName = context.get('dbName');
    const nsName = context.get('nsName');
    const jwtPayload = context.get('jwtPayload');
    const userId = jwtPayload?.user_id;

    if (!tenant || !dbName || !nsName || !userId) {
        throw HttpErrors.unauthorized('Invalid JWT context - missing required fields', 'TOKEN_CONTEXT_INVALID');
    }

    try {
        // TODO: Add tenant status validation here
        // const tenantInfo = await TenantService.getTenant(tenant);
        // if (!tenantInfo) {
        //     throw HttpErrors.unauthorized('Tenant not found or inactive', 'TENANT_INACTIVE');
        // }

        // Set up database and namespace connection for the tenant
        DatabaseConnection.setDatabaseAndNamespaceForRequest(context, dbName, nsName);

        // Look up user in the specific tenant namespace
        const userResult = await DatabaseConnection.queryInNamespace(
            dbName,
            nsName,
            'SELECT id, name, access, access_read, access_edit, access_full FROM users WHERE id = $1 AND trashed_at IS NULL',
            [userId]
        );

        if (userResult.rows.length === 0) {
            throw HttpErrors.unauthorized('User not found or inactive', 'USER_NOT_FOUND');
        }

        const user = userResult.rows[0];

        // Enrich context with actual user data from database
        context.set('user', {
            id: user.id,
            name: user.name,
            access: user.access,
            tenant: tenant,
            dbName: dbName,
            nsName: nsName,
            access_read: user.access_read || [],
            access_edit: user.access_edit || [],
            access_full: user.access_full || []
        });
        context.set('userId', user.id);
        context.set('accessReadIds', user.access_read || []);
        context.set('accessEditIds', user.access_edit || []);
        context.set('accessFullIds', user.access_full || []);

        return await next();

    } catch (error) {
        if (error instanceof Error && error.name === 'HttpError') {
            throw error; // Re-throw HttpErrors
        }

        console.error('User validation failed:', error);
        throw HttpErrors.unauthorized('User validation failed', 'USER_VALIDATION_ERROR');
    }
}