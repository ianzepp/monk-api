import type { Context } from 'hono';
import { SchemaMetaYAML } from '../lib/schema-meta-yaml.js';

export default async function (context: Context): Promise<Response> {
    const schemaName = context.req.param('name');
    const yamlContent = await context.req.text();
    
    console.debug(`PUT /api/meta/schema/${schemaName}`);
    
    // Direct call to SchemaMetaYAML - handles all logic and returns Response
    return await SchemaMetaYAML.updateSchemaFromYaml(context, schemaName, yamlContent);
}
