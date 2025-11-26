import { withTransactionParams } from '@src/lib/api-helpers.js';
import { setRouteResult } from '@src/lib/middleware/system-context.js';
import { HttpErrors } from '@src/lib/errors/http-error.js';

/**
 * POST /api/grids/:id/cells - Bulk upsert cells
 *
 * Body: {"cells": [{row: 1, col: "A", value: "Name"}, ...]}
 *
 * Supports up to 1000 cells per request
 * Null values delete the cell (sparse storage)
 */
export default withTransactionParams(async (context, { system, body }) => {
    const gridId = context.req.param('id');

    // 1. Load grid (validates existence + gets constraints)
    const grid = await system.database.select404('grids', {
        where: { id: gridId }
    });

    // 2. Validate request body
    if (!body || !Array.isArray(body.cells)) {
        throw HttpErrors.badRequest(
            'Request body must contain "cells" array',
            'GRID_INVALID_REQUEST_BODY'
        );
    }

    const cells = body.cells;

    // 3. Validate bulk limit
    const maxCells = Math.min(1000, grid.row_max * 26); // 26 fields (A-Z)
    if (cells.length > maxCells) {
        throw HttpErrors.badRequest(
            `Bulk operation limited to ${maxCells} cells`,
            'GRID_BULK_LIMIT_EXCEEDED',
            { maxCells, actualCells: cells.length }
        );
    }

    // 4. Validate each cell
    for (const cell of cells) {
        if (!cell.row || !cell.col) {
            throw HttpErrors.badRequest(
                'Each cell must have "row" and "col" properties',
                'GRID_INVALID_CELL_FORMAT'
            );
        }

        // Validate row bounds
        if (cell.row < 1 || cell.row > grid.row_max) {
            throw HttpErrors.badRequest(
                `Row ${cell.row} exceeds grid limit ${grid.row_max}`,
                'GRID_ROW_OUT_OF_BOUNDS'
            );
        }

        // Validate field bounds
        if (cell.col < 'A' || cell.col > grid.col_max) {
            throw HttpErrors.badRequest(
                `Field ${cell.col} exceeds grid limit ${grid.col_max}`,
                'GRID_FIELD_OUT_OF_BOUNDS'
            );
        }

        // Validate field is single character
        if (cell.col.length !== 1) {
            throw HttpErrors.badRequest(
                `Field must be a single character A-Z, got: ${cell.col}`,
                'GRID_INVALID_FIELD_FORMAT'
            );
        }
    }

    // 5. Execute bulk upsert via adapter (works with PostgreSQL and SQLite)
    const updatedCells: any[] = [];

    for (const cell of cells) {
        if (cell.value === null || cell.value === undefined) {
            // Delete cell for null values (sparse storage)
            await system.adapter!.query(
                'DELETE FROM grid_cells WHERE grid_id = $1 AND row = $2 AND col = $3',
                [gridId, cell.row, cell.col]
            );
        } else {
            // Upsert cell (ON CONFLICT syntax works for both PostgreSQL and SQLite 3.24+)
            const result = await system.adapter!.query(
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
        count: updatedCells.length,
        cells: updatedCells
    });
});
