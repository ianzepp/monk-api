import { HttpErrors } from '@src/lib/errors/http-error.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a user path parameter that may be "me" or a UUID.
 *
 * Invalid identifiers fail closed with a 404 so the route does not leak
 * database-level UUID parse errors to callers.
 */
export function resolveUserTargetId(id: string | undefined, currentUserId: string): string {
    if (id === 'me') {
        return currentUserId;
    }

    if (id && UUID_REGEX.test(id)) {
        return id;
    }

    throw HttpErrors.notFound('User not found', 'USER_NOT_FOUND');
}
