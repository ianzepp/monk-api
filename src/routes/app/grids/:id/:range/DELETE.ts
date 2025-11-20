import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { parseRange, validateRangeBounds } from '@src/routes/app/grids/range-parser.js';

/**
 * DELETE /app/grids/:id/:range - Clear cells in range
 *
 * Supports all range formats:
 * - Single cell: /app/grids/:id/A1
 * - Range: /app/grids/:id/A1:Z100
 * - Row: /app/grids/:id/5:5
 * - Column: /app/grids/:id/A:A
 *
 * Returns count of deleted cells
 */
export default withTransactionParams(async (context, { system }) => {
    const gridId = context.req.param('id');
    const rangeStr = context.req.param('range');

    // 1. Load grid (validates existence + gets constraints)
    const grid = await system.database.select404('grids', {
        where: { id: gridId }
    });

    // 2. Parse range
    const range = parseRange(rangeStr);

    // 3. Validate against grid constraints
    validateRangeBounds(range, grid.row_max, grid.col_max);

    // 4. Build DELETE query (transaction-aware)
    const dbContext = system.tx!; // withTransactionParams ensures tx exists
    const { query, params } = buildDeleteQuery(gridId, range);

    // 5. Execute delete
    const result = await dbContext.query(query, params);

    // 6. Return with metadata
    setRouteResult(context, {
        grid_id: gridId,
        range: rangeStr,
        deleted: result.rowCount || 0
    });
});

/**
 * Build DELETE query based on range type
 */
function buildDeleteQuery(gridId: string, range: any): { query: string; params: any[] } {
    let query = 'DELETE FROM grid_cells WHERE grid_id = $1';
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
            break;
    }

    return { query, params };
}
