import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { type TxContext } from '../db/index.js';
import { SchemaManager } from '../lib/schema-manager.js';
import { createValidationError } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await System.handleTx(context, async (system: System) => {
        const schemaName = context.req.param('name');
        const tx = system.dtx as TxContext;

        try {
            const yamlContent = await context.req.text();
            
            // Validate YAML before transaction
            SchemaManager.parseYamlSchema(yamlContent);

            return await SchemaManager.updateSchema(tx, schemaName, yamlContent);
        } catch (error) {
            if (error instanceof Error && error.message.includes('YAML parsing')) {
                return createValidationError(context, 'YAML parsing error', [{
                    path: ['yaml'],
                    message: error.message
                }]);
            }
            throw error; // Let withTransaction handle other errors
        }

    });
}
