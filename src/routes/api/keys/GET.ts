import { withTransaction } from '@src/lib/api-helpers.js';
import { listTenantKeys } from '@src/lib/public-key-auth.js';

export default withTransaction(async ({ system }) => {
    return await listTenantKeys(system);
});
