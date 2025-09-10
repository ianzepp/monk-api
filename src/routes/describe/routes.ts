/**
 * Meta API Route Barrel Export
 *
 * Schema management operations using clean naming convention:
 * - Schema operations: SchemaGet, SchemaPost, SchemaPut, SchemaDelete
 */

// Schema management operations
export { default as SchemaGet } from '@src/routes/describe/:schema/GET.js';
export { default as SchemaPost } from '@src/routes/describe/:schema/POST.js';
export { default as SchemaPut } from '@src/routes/describe/:schema/PUT.js';
export { default as SchemaDelete } from '@src/routes/describe/:schema/DELETE.js';
