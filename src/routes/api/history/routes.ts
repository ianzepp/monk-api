/**
 * History API Route Barrel Export
 *
 * Routes for accessing change history and audit trails for tracked fields.
 */

// Record history operations
export { default as RecordHistoryGet } from '@src/routes/api/history/:model/:id/GET.js';

// Specific change operations
export { default as ChangeGet } from '@src/routes/api/history/:model/:id/:change/GET.js';
