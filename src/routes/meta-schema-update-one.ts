import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { type TxContext } from '../db/index.js';
import { SchemaManager } from '../lib/schema-manager.js';
import { createValidationError } from '../lib/api/responses.js';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system: System) => {
        const schemaName = context.req.param('name');
        const tx = system.dtx as TxContext;
        const yamlContent = await context.req.text();
        
        // Validate YAML before transaction
        SchemaManager.parseYamlSchema(yamlContent);

        return await SchemaManager.updateSchema(tx, schemaName, yamlContent);
    });
}
