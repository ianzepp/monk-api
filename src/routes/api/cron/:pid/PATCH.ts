import { withTransaction } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
/**
 * PATCH /api/cron/:pid - Update a cron job
 *
 * Cron execution is temporarily unavailable while the old shell-backed
 * execution backend is being replaced.
 */
export default withTransaction(async ({ system, params, body }) => {
    if (!system.isSudo()) {
        throw HttpErrors.forbidden(
            'Updating cron jobs requires sudo access',
            'SUDO_REQUIRED'
        );
    }

    const pid = parseInt(params.pid, 10);
    if (isNaN(pid)) {
        throw HttpErrors.badRequest('Invalid job ID', 'INVALID_PID');
    }

    const { schedule, command } = body || {};

    if (!schedule && !command) {
        throw HttpErrors.badRequest(
            'At least one of schedule or command is required',
            'MISSING_FIELDS'
        );
    }

    throw HttpErrors.notImplemented(
        'Cron execution backend is temporarily unavailable after shell removal',
        'CRON_EXECUTION_UNAVAILABLE'
    );
});
