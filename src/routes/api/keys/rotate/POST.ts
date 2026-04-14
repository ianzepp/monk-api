import { withTransaction } from '@src/lib/api-helpers.js';
import { rotateTenantKey } from '@src/lib/public-key-auth.js';

export default withTransaction(async ({ system, body }) => {
    return await rotateTenantKey(system, body || {});
});
