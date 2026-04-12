import { withTransaction } from '@src/lib/api-helpers.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
/**
 * POST /api/cron - Create a new cron job
 *
 * Cron execution is temporarily unavailable while the old shell-backed
 * execution backend is being replaced.
 */
export default withTransaction(async ({ system, body }) => {
    if (!system.isSudo()) {
        throw HttpErrors.forbidden(
            'Creating cron jobs requires sudo access',
            'SUDO_REQUIRED'
        );
    }

    const { schedule, command, enabled } = body || {};

    if (!schedule) {
        throw HttpErrors.badRequest(
            'Schedule is required',
            'MISSING_SCHEDULE'
        );
    }

    if (!command) {
        throw HttpErrors.badRequest(
            'Command is required',
            'MISSING_COMMAND'
        );
    }

    void enabled;
    throw HttpErrors.notImplemented(
        'Cron execution backend is temporarily unavailable after shell removal',
        'CRON_EXECUTION_UNAVAILABLE'
    );
});
