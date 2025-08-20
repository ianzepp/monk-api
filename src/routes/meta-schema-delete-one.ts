import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { type TxContext } from '../db/index.js';
import { SchemaManager } from '../lib/schema-manager.js';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system: System) => {
        const schemaName = context.req.param('name');

        try {
            return await SchemaManager.deleteSchema(system.dtx as TxContext, schemaName);
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
