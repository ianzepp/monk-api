/**
 * Data API Route Barrel Export
 * 
 * Clean route organization using your preferred naming convention:
 * - Schema operations: SchemaGet, SchemaPost, SchemaPut, SchemaDelete
 * - Record operations: RecordGet, RecordPut, RecordDelete (with ID parameter)
 */

// Schema operations (no ID parameter)
export { default as SchemaGet } from '@src/routes/data/:schema/GET.js';
export { default as SchemaPost } from '@src/routes/data/:schema/POST.js';
export { default as SchemaPut } from '@src/routes/data/:schema/PUT.js';
export { default as SchemaDelete } from '@src/routes/data/:schema/DELETE.js';

// Record operations (with ID parameter)
export { default as RecordGet } from '@src/routes/data/:schema/:id/GET.js';
export { default as RecordPut } from '@src/routes/data/:schema/:id/PUT.js';
export { default as RecordDelete } from '@src/routes/data/:schema/:id/DELETE.js';