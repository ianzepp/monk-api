import type { Context } from 'hono';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { createTenantChallenge } from '@src/lib/public-key-auth.js';

export default async function (context: Context) {
    const body = await context.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw HttpErrors.badRequest('Request body must be an object', 'BODY_NOT_OBJECT');
    }

    const result = await createTenantChallenge(body);
    return context.json({ success: true, data: result });
}
