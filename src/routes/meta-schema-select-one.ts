import type { Context } from 'hono';
import { SchemaMetaYAML } from '@lib/schema-meta-yaml.js';

export default async function (context: Context): Promise<Response> {
    const schemaName = context.req.param('name');
    
    console.debug(`GET /api/meta/schema/${schemaName}`);
    
    // Direct call to SchemaMetaYAML - handles all logic and returns Response
    return await SchemaMetaYAML.getSchemaAsYaml(context, schemaName);
}
