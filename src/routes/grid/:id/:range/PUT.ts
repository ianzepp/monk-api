import type { Context } from 'hono';
import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';
import { parseRange, validateRangeBounds } from '@src/routes/grid/range-parser.js';

/**
 * PUT /app/grids/:id/:range - Update cells in grid
 *
 * Single cell:
 * PUT /app/grids/:id/A1
 * Body: {"value": "Name"}
 *
 * Range:
 * PUT /app/grids/:id/A1:B2
 * Body: {"cells": [{row: 1, col: "A", value: "Name"}, ...]}
 *
 * Null values delete the cell (sparse storage)
 */
export default withTransactionParams(async (context, { system, body }) => {
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

    // 4. Determine update type and validate body
    let cells: Array<{ row: number; col: string; value: string | null }>;

    if (range.type === 'single') {
        // Single cell update - expect {value: "..."}
        if (!body || !('value' in body)) {
            throw HttpErrors.badRequest(
                'Request body must contain "value" property for single cell update',
                'GRID_INVALID_REQUEST_BODY'
            );
        }

        cells = [{
            row: range.row!,
            col: range.col!,
            value: body.value
        }];
    } else {
        // Range update - expect {cells: [...]}
        if (!body || !Array.isArray(body.cells)) {
            throw HttpErrors.badRequest(
                'Request body must contain "cells" array for range update',
                'GRID_INVALID_REQUEST_BODY'
            );
        }

        cells = body.cells;

        // Validate cells are within range
        for (const cell of cells) {
            if (!cell.row || !cell.col) {
                throw HttpErrors.badRequest(
                    'Each cell must have "row" and "col" properties',
                    'GRID_INVALID_CELL_FORMAT'
                );
            }

            // Validate cell is within specified range
            if (!isCellInRange(cell, range)) {
                throw HttpErrors.badRequest(
                    `Cell ${cell.col}${cell.row} is outside specified range ${rangeStr}`,
                    'GRID_CELL_OUT_OF_RANGE'
                );
            }
        }
    }

    // 5. Execute updates (transaction-aware)
    const dbContext = system.tx!; // withTransactionParams ensures tx exists
    const updatedCells: any[] = [];

    for (const cell of cells) {
        if (cell.value === null || cell.value === undefined) {
            // Delete cell for null values (sparse storage)
            await dbContext.query(
                'DELETE FROM grid_cells WHERE grid_id = $1 AND row = $2 AND col = $3',
                [gridId, cell.row, cell.col]
            );
        } else {
            // Upsert cell
            const result = await dbContext.query(
                `INSERT INTO grid_cells (grid_id, row, col, value)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (grid_id, row, col)
                 DO UPDATE SET value = EXCLUDED.value
                 RETURNING row, col, value`,
                [gridId, cell.row, cell.col, cell.value]
            );

            if (result.rows.length > 0) {
                updatedCells.push(result.rows[0]);
            }
        }
    }

    // 6. Return with metadata
    setRouteResult(context, {
        grid_id: gridId,
        range: rangeStr,
        cells: updatedCells
    });
});

/**
 * Check if a cell is within the specified range
 */
function isCellInRange(cell: { row: number; col: string }, range: any): boolean {
    switch (range.type) {
        case 'single':
            return cell.row === range.row && cell.col === range.col;

        case 'range':
            return (
                cell.row >= range.startRow &&
                cell.row <= range.endRow &&
                cell.col >= range.startCol &&
                cell.col <= range.endCol
            );

        case 'row':
            return cell.row >= range.startRow && cell.row <= range.endRow;

        case 'col':
            return cell.col >= range.startCol && cell.col <= range.endCol;

        default:
            return false;
    }
}
