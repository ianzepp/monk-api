import { withTransaction } from '@src/lib/api-helpers.js';

/**
 * GET /api/data/:model/:id - Get single record by ID
 * @see docs/routes/DATA_API.md
 */
export default withTransaction(async ({ system, params, query }) => {
    const { model, record } = params;
    return await system.database.select404(model, { where: { id: record } }, undefined, {
        context: 'api' as const,
        trashed: query.trashed as any,
    });
});
