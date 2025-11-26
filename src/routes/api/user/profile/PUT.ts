import type { Context } from 'hono';
import { withTransactionParams, withSelfServiceSudo } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * PUT /api/user/profile - Update authenticated user's profile
 *
 * Self-service endpoint - users can update their own name and auth identifier.
 * Does not require sudo access.
 *
 * Cannot update: access, access_read, access_edit, access_full (admin only)
 *
 * Request body:
 * {
 *   "name": "Jane Doe",           // Optional: Update display name
 *   "auth": "jane@example.com"    // Optional: Update auth identifier
 * }
 *
 * Validation:
 * - name: 2-100 characters
 * - auth: 2-255 characters, must be unique across tenant
 */
export default withTransactionParams(async (context: Context, { system, body }) => {
    const user = context.get('user');

    // Validate that body only contains allowed fields
    const allowedFields = ['name', 'auth'];
    const updates: Record<string, any> = {};

    // Validate name if provided
    if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.length < 2 || body.name.length > 100) {
            throw HttpErrors.badRequest(
                'Name must be between 2 and 100 characters',
                'VALIDATION_ERROR',
                { field: 'name' }
            );
        }
        updates.name = body.name;
    }

    // Validate auth if provided
    if (body.auth !== undefined) {
        if (typeof body.auth !== 'string' || body.auth.length < 2 || body.auth.length > 255) {
            throw HttpErrors.badRequest(
                'Auth identifier must be between 2 and 255 characters',
                'VALIDATION_ERROR',
                { field: 'auth' }
            );
        }

        // Check for duplicate auth identifier
        const existing = await system.database.selectOne('users', {
            where: {
                auth: body.auth,
                id: { $ne: user.id }  // Exclude current user
            }
        });

        if (existing) {
            throw HttpErrors.conflict(
                'Auth identifier already exists',
                'AUTH_CONFLICT',
                { field: 'auth' }
            );
        }

        updates.auth = body.auth;
    }

    // Check for disallowed fields
    const disallowedFields = Object.keys(body).filter(key => !allowedFields.includes(key));
    if (disallowedFields.length > 0) {
        throw HttpErrors.badRequest(
            `Cannot update fields: ${disallowedFields.join(', ')}. Use admin endpoints to modify access levels.`,
            'VALIDATION_ERROR',
            { disallowed_fields: disallowedFields }
        );
    }

    // If no updates provided, return current profile
    if (Object.keys(updates).length === 0) {
        const profile = await system.database.select404(
            'users',
            { where: { id: user.id } }
        );
        setRouteResult(context, profile);
        return;
    }

    // Update user profile with self-service sudo
    const updated = await withSelfServiceSudo(system, async () => {
        updates.updated_at = new Date().toISOString();
        return await system.database.updateOne('users', user.id, updates);
    });

    setRouteResult(context, updated);
});
