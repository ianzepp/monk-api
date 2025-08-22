import type { Context } from 'hono';
import { System } from '../lib/system.js';
import { type TxContext } from '../db/index.js';
import { SchemaManager } from '../lib/schema-manager.js';
import { createValidationError } from '../lib/api/responses.js';
import { handleContextTx } from '../lib/api/responses.js';

export default async function (context: Context): Promise<any> {
    return await handleContextTx(context, async (system: System) => {
        const yamlContent = await context.req.text();
        const tx = system.dtx as TxContext;
        
        console.debug('POST /api/meta/schema', yamlContent)

        // Validate YAML before transaction
        SchemaManager.parseYamlSchema(yamlContent);

        console.debug('Delegating to createSchema()')
        return await SchemaManager.createSchema(tx, yamlContent);
    });
}
