import { withTransaction } from '@src/lib/api-helpers.js';
import { revokeTenantKey } from '@src/lib/public-key-auth.js';

export default withTransaction(async ({ system, params }) => {
    return await revokeTenantKey(system, params.key_id);
});
