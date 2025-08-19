import type { Context } from 'hono';
import { SchemaManager } from '../lib/schema-manager.js';
import { withTransaction } from '../lib/route-helpers.js';
import { createValidationError } from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    const schemaName = c.req.param('name');

    try {
        const yamlContent = await c.req.text();
        
        // Validate YAML before transaction
        SchemaManager.parseYamlSchema(yamlContent);

        return withTransaction(c, async (tx) => {
            return await SchemaManager.updateSchema(tx, schemaName, yamlContent);
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('YAML parsing')) {
            return createValidationError(c, 'YAML parsing error', [{
                path: ['yaml'],
                message: error.message
            }]);
        }
        throw error; // Let withTransaction handle other errors
    }
}