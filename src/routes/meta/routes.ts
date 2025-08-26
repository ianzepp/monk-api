/**
 * Meta API Route Barrel Export
 * 
 * Schema management operations using clean naming convention:
 * - Schema operations: SchemaGet, SchemaPost, SchemaPut, SchemaDelete
 */

// Schema management operations
export { default as SchemaGet } from '@src/routes/meta/schema/:name/GET.js';
export { default as SchemaPost } from '@src/routes/meta/schema/POST.js';
export { default as SchemaPut } from '@src/routes/meta/schema/:name/PUT.js';
export { default as SchemaDelete } from '@src/routes/meta/schema/:name/DELETE.js';