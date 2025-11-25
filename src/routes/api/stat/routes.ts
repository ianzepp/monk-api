/**
 * Stat API Route Barrel Export
 *
 * Clean route organization following the data API naming convention:
 * - Record stat operations: RecordGet (with model and record parameters)
 *
 * @see docs/39-stat-api.md
 */

// Record stat operation (with model and record parameters)
export { default as RecordGet } from '@src/routes/api/stat/:model/:record/GET.js';
