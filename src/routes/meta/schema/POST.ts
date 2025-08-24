import type { Context } from 'hono';
import { SchemaMetaYAML } from '@lib/schema-meta-yaml.js';

export default async function (context: Context): Promise<Response> {
    const yamlContent = await context.req.text();
    
    console.debug('POST /api/meta/schema', yamlContent);
    
    // Direct call to SchemaMetaYAML - handles all logic and returns Response
    return await SchemaMetaYAML.createSchemaFromYaml(context, yamlContent);
}
