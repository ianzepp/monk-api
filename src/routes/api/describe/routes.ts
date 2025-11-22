/**
 * Describe API Route Barrel Export
 *
 * Schema management operations using clean naming convention:
 * - Schema operations: SchemaGet, SchemaPost, SchemaPut, SchemaDelete
 * - Column operations: ColumnsList, ColumnGet, ColumnPost, ColumnPut, ColumnDelete
 */

// Schema management operations
export { default as SchemaList } from '@src/routes/api/describe/GET.js';
export { default as SchemaGet } from '@src/routes/api/describe/:schema/GET.js';
export { default as SchemaPost } from '@src/routes/api/describe/:schema/POST.js';
export { default as SchemaPut } from '@src/routes/api/describe/:schema/PUT.js';
export { default as SchemaDelete } from '@src/routes/api/describe/:schema/DELETE.js';

// Column management operations
export { default as ColumnsList } from '@src/routes/api/describe/:schema/columns/GET.js';
export { default as ColumnGet } from '@src/routes/api/describe/:schema/columns/:column/GET.js';
export { default as ColumnPost } from '@src/routes/api/describe/:schema/columns/:column/POST.js';
export { default as ColumnPut } from '@src/routes/api/describe/:schema/columns/:column/PUT.js';
export { default as ColumnDelete } from '@src/routes/api/describe/:schema/columns/:column/DELETE.js';
