/**
 * Stat API Route Barrel Export
 *
 * Clean route organization following the data API naming convention:
 * - Record stat operations: RecordGet (with schema and record parameters)
 *
 * @see docs/39-stat-api.md
 */

// Record stat operation (with schema and record parameters)
export { default as RecordGet } from '@src/routes/stat/:schema/:record/GET.js';
