/**
 * ACLs API Route Barrel Export
 *
 * Access Control Lists management routes for record-level permissions.
 * These routes allow administrators to manage user access to specific records.
 * 
 * Route Structure:
 * - Record ACL operations: /api/acls/:schema/:record (GET, POST, PUT, DELETE)
 * 
 * @see docs/routes/ACLS_API.md
 */

// Record ACL operations (with schema and record ID parameters)
export { default as RecordAclGet } from '@src/routes/acls/:schema/:record/GET.js';
export { default as RecordAclPost } from '@src/routes/acls/:schema/:record/POST.js';
export { default as RecordAclPut } from '@src/routes/acls/:schema/:record/PUT.js';
export { default as RecordAclDelete } from '@src/routes/acls/:schema/:record/DELETE.js';