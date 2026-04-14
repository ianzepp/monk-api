import { withTransaction } from '@src/lib/api-helpers.js';
import { addTenantKey } from '@src/lib/public-key-auth.js';

export default withTransaction(async ({ system, body }) => {
    return await addTenantKey(system, body || {});
});
