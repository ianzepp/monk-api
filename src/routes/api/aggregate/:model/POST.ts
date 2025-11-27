import { withTransaction } from '@src/lib/api-helpers.js';

export default withTransaction(async ({ system, params, query, body }) => {
    const { model } = params;

    console.debug('routes/aggregate-model: model=%j', model);

    const options = { context: 'api' as const, trashed: query.trashed as any };
    const result = await system.database.aggregate(model!, body, options);

    return result;
});
