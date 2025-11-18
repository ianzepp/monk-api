/**
 * History API Route Barrel Export
 *
 * Routes for accessing change history and audit trails for tracked columns.
 */

// Record history operations
export { default as RecordHistoryGet } from '@src/routes/history/:schema/:record/GET.js';

// Specific change operations
export { default as ChangeGet } from '@src/routes/history/:schema/:record/:change/GET.js';
