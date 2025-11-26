import type { Context } from 'hono';
import { withTransactionParams, withSelfServiceSudo } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/user/deactivate - Deactivate own account
 *
 * Self-service endpoint - users can deactivate their own account (soft delete).
 * Does not require sudo access.
 *
 * Request body:
 * {
 *   "confirm": true,           // Required: Must be true
 *   "reason": "Leaving team"   // Optional: Reason for audit log
 * }
 *
 * Notes:
 * - Sets trashed_at to current timestamp
 * - User can no longer authenticate
 * - Admin can reactivate using POST /api/user/:id/activate
 */
export default withTransactionParams(async (context: Context, { system, body }) => {
    const user = context.get('user');

    // Require explicit confirmation
    if (body.confirm !== true) {
        throw HttpErrors.badRequest(
            'Account deactivation requires explicit confirmation',
            'CONFIRMATION_REQUIRED',
            { field: 'confirm', required_value: true }
        );
    }

    // Soft delete - set trashed_at timestamp with self-service sudo
    const deactivatedAt = new Date().toISOString();
    await withSelfServiceSudo(system, async () => {
        await system.database.updateOne('users', user.id, {
            trashed_at: deactivatedAt,
            updated_at: deactivatedAt
        });
    });

    // Return confirmation
    setRouteResult(context, {
        message: 'Account deactivated successfully',
        deactivated_at: deactivatedAt,
        reason: body.reason || null
    });
});
