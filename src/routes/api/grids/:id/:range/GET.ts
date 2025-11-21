import type { Context } from 'hono';
import { withParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { parseRange, validateRangeBounds, formatCells } from '@src/routes/api/grids/range-parser.js';

/**
 * GET /api/grids/:id/:range - Read cells from grid
 *
 * Supports Excel-style range notation:
 * - Single cell: /api/grids/:id/A1
 * - Range: /api/grids/:id/A1:Z100
 * - Row: /api/grids/:id/5:5
 * - Column: /api/grids/:id/A:A
 *
 * Returns sparse array (only non-empty cells)
 */
export default withParams(async (context, { system }) => {
    const gridId = context.req.param('id');
    const rangeStr = context.req.param('range');
    const format = context.req.query('format');

    // 1. Load grid (validates existence + gets constraints)
    const grid = await system.database.select404('grids', {
        where: { id: gridId }
    });

    // 2. Parse range
    const range = parseRange(rangeStr);

    // 3. Validate against grid constraints
    validateRangeBounds(range, grid.row_max, grid.col_max);

    // 4. Build SQL query (transaction-aware)
    const dbContext = system.tx || system.db;
    const { query, params } = buildSelectQuery(gridId, range);

    // 5. Execute query
    const result = await dbContext.query(query, params)
    const cells = formatCells(result.rows, format);

    // 6. Return with metadata
    setRouteResult(context, {
        grid_id: gridId,
        range: rangeStr,
        cells: cells
    });
});

/**
 * Build SELECT query based on range type
 */
function buildSelectQuery(gridId: string, range: any): { query: string; params: any[] } {
    let query = 'SELECT row, col, value FROM grid_cells WHERE grid_id = $1';
    const params: any[] = [gridId];
    let paramIndex = 2;

    switch (range.type) {
        case 'single':
            query += ` AND row = $${paramIndex} AND col = $${paramIndex + 1}`;
            params.push(range.row, range.col);
            break;

        case 'range':
            query += ` AND row BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
            query += ` AND col BETWEEN $${paramIndex + 2} AND $${paramIndex + 3}`;
            params.push(range.startRow, range.endRow, range.startCol, range.endCol);
            query += ' ORDER BY row, col';
            break;

        case 'row':
            if (range.startRow === range.endRow) {
                // Single row
                query += ` AND row = $${paramIndex}`;
                params.push(range.row);
            } else {
                // Row range
                query += ` AND row BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
                params.push(range.startRow, range.endRow);
            }
            query += ' ORDER BY col';
            break;

        case 'col':
            if (range.startCol === range.endCol) {
                // Single column
                query += ` AND col = $${paramIndex}`;
                params.push(range.col);
            } else {
                // Column range
                query += ` AND col BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
                params.push(range.startCol, range.endCol);
            }
            query += ' ORDER BY row';
            break;
    }

    return { query, params };
}
