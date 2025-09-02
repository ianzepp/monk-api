/**
 * Data API Route Barrel Export
 *
 * Clean route organization using your preferred naming convention:
 * - Schema operations: SchemaGet, SchemaPost, SchemaPut, SchemaDelete
 * - Record operations: RecordGet, RecordPut, RecordDelete (with ID parameter)
 * @see docs/routes/DATA_API.md
 */

// Schema operations (no ID parameter)
export { default as SchemaGet } from '@src/routes/data/:schema/GET.js';
export { default as SchemaPost } from '@src/routes/data/:schema/POST.js';
export { default as SchemaPut } from '@src/routes/data/:schema/PUT.js';
export { default as SchemaDelete } from '@src/routes/data/:schema/DELETE.js';

// Record operations (with ID parameter)
export { default as RecordGet } from '@src/routes/data/:schema/:record/GET.js';
export { default as RecordPut } from '@src/routes/data/:schema/:record/PUT.js';
export { default as RecordDelete } from '@src/routes/data/:schema/:record/DELETE.js';

// Relationship operations
export { default as RelationshipGet } from '@src/routes/data/:schema/:record/:relationship/GET.js';
export { default as RelationshipPost } from '@src/routes/data/:schema/:record/:relationship/POST.js';
export { default as RelationshipDelete } from '@src/routes/data/:schema/:record/:relationship/DELETE.js';

// Nested record operations
export { default as NestedRecordGet } from '@src/routes/data/:schema/:record/:relationship/:child/GET.js';
export { default as NestedRecordPut } from '@src/routes/data/:schema/:record/:relationship/:child/PUT.js';
export { default as NestedRecordDelete } from '@src/routes/data/:schema/:record/:relationship/:child/DELETE.js';
