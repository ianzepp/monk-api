/**
 * Describe API Route Barrel Export
 *
 * Schema management operations using clean naming convention:
 * - Schema operations: SchemaGet, SchemaPost, SchemaPut, SchemaDelete
 * - Column operations: ColumnGet, ColumnPost, ColumnPut, ColumnDelete
 */

// Schema management operations
export { default as SchemaList } from '@src/routes/describe/GET.js';
export { default as SchemaGet } from '@src/routes/describe/:schema/GET.js';
export { default as SchemaPost } from '@src/routes/describe/:schema/POST.js';
export { default as SchemaPut } from '@src/routes/describe/:schema/PUT.js';
export { default as SchemaDelete } from '@src/routes/describe/:schema/DELETE.js';

// Column management operations
export { default as ColumnGet } from '@src/routes/describe/:schema/:column/GET.js';
export { default as ColumnPost } from '@src/routes/describe/:schema/:column/POST.js';
export { default as ColumnPut } from '@src/routes/describe/:schema/:column/PUT.js';
export { default as ColumnDelete } from '@src/routes/describe/:schema/:column/DELETE.js';
