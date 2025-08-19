import type { Context } from 'hono';
import { SchemaManager } from '../lib/schema-manager.js';
import { withTransaction } from '../lib/route-helpers.js';
import { createValidationError } from '../lib/api/responses.js';

export default async function (c: Context): Promise<any> {
    try {
        const yamlContent = await c.req.text();
        
        // Validate YAML before transaction
        SchemaManager.parseYamlSchema(yamlContent);

        return withTransaction(c, async (tx) => {
            return await SchemaManager.createSchema(tx, yamlContent);
        }, 201);
    } catch (error) {
        if (error instanceof Error && error.message.includes('YAML parsing')) {
            return createValidationError(c, 'YAML parsing error', [{
                path: ['yaml'],
                message: error.message
            }]);
        }
        if (error instanceof Error && error.message.includes('Schema must have')) {
            return createValidationError(c, error.message, []);
        }
        throw error; // Let withTransaction handle other errors
    }
}