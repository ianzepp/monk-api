import type { Context } from 'hono';
import { SchemaManager } from '../lib/schema-manager.js';
import { withTransaction } from '../lib/route-helpers.js';
import { createDependencyError } from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    const schemaName = c.req.param('name');

    return withTransaction(c, async (tx) => {
        try {
            return await SchemaManager.deleteSchema(tx, schemaName);
        } catch (error) {
            if (error instanceof Error && error.message.includes('referenced by:')) {
                const dependencyMatch = error.message.match(/referenced by: ([^.]+)/);
                const dependencies = dependencyMatch ? dependencyMatch[1].split(', ') : [];
                throw new Error(`Cannot delete schema '${schemaName}' - referenced by: ${dependencies.join(', ')}. Delete dependent schemas first.`);
            }
            throw error;
        }
    });
}