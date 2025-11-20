/**
 * Grid API Route Barrel Export
 *
 * Grid API provides Excel-like spreadsheet functionality within Monk API.
 * Fills the gap between unstructured data (JSONB) and formal schemas.
 *
 * Grid Management:
 * - Grids managed via Data API: /api/data/grids
 * - Inherits: CRUD, ACLs, history, observers, multi-tenant isolation
 *
 * Cell Operations:
 * - RangeGet - Read cells (A1, A1:Z100, A:A, 5:5)
 * - RangePut - Update cells/range
 * - RangeDelete - Clear cells/range
 * - CellsPost - Bulk upsert (body contains cells)
 *
 * External Schema:
 * - grid_cells table is marked as external schema
 * - Data managed via Grid API only (not Data API)
 * - Uses raw SQL (bypasses observer pipeline)
 *
 * Range Notation (Excel-style):
 * - Single cell: A1, B5, Z100
 * - Range: A1:Z100, B2:D10
 * - Entire column: A:A, B:Z
 * - Entire row: 5:5, 1:10
 */

// Cell operations
export { default as RangeGet } from '@src/routes/app/grids/:id/:range/GET.js';
export { default as RangePut } from '@src/routes/app/grids/:id/:range/PUT.js';
export { default as RangeDelete } from '@src/routes/app/grids/:id/:range/DELETE.js';
export { default as CellsPost } from '@src/routes/app/grids/:id/cells/POST.js';
