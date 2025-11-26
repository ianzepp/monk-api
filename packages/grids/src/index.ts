/**
 * @monk-app/grids - Excel-like Spreadsheet Functionality
 *
 * A tenant-scoped app: models are installed in the user's tenant,
 * and data belongs to the user. Requires JWT authentication.
 *
 * Models are defined in models/*.yaml and loaded automatically:
 * - grids: Grid metadata (name, description, row/col limits)
 * - grid_cells: Sparse cell storage (one row per populated cell)
 *
 * Grid metadata is managed via Data API at /api/data/grids.
 * Cell operations use this app's specialized endpoints.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
    parseRange,
    validateRangeBounds,
    isCellInRange,
    formatCells,
    type ParsedRange
} from './range-parser.js';

/**
 * App context provided by the loader
 */
export interface AppContext {
    client: any;
    token: string;
    appName: string;
    tenantName: string;
    honoApp: any;
}

interface Grid {
    id: string;
    name: string;
    description?: string;
    row_count?: number;
    row_max: number;
    col_max: string;
}

interface GridCell {
    id: string;
    grid_id: string;
    row: number;
    col: string;
    value: string | null;
}

interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * Simple in-process client that forwards requests to the main app.
 * Uses the Authorization header from the current request context.
 */
function createClient(c: Context, honoApp: any) {
    const authHeader = c.req.header('Authorization');

    async function request<T>(
        method: string,
        path: string,
        options: { query?: Record<string, string>; body?: any } = {}
    ): Promise<ApiResponse<T>> {
        let url = `http://internal${path}`;
        if (options.query && Object.keys(options.query).length > 0) {
            const params = new URLSearchParams(options.query);
            url += `?${params.toString()}`;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (authHeader) {
            headers['Authorization'] = authHeader;
        }

        const init: RequestInit = { method, headers };
        if (options.body !== undefined && !['GET', 'HEAD'].includes(method)) {
            init.body = JSON.stringify(options.body);
        }

        const req = new Request(url, init);
        const res = await honoApp.fetch(req);
        return res.json();
    }

    return {
        get: <T>(path: string, query?: Record<string, string>) => request<T>('GET', path, { query }),
        post: <T>(path: string, body?: any) => request<T>('POST', path, { body }),
        put: <T>(path: string, body?: any) => request<T>('PUT', path, { body }),
        delete: <T>(path: string) => request<T>('DELETE', path),
    };
}

/**
 * Load grid by ID, returning 404 response if not found
 */
async function loadGrid(client: ReturnType<typeof createClient>, gridId: string): Promise<ApiResponse<Grid>> {
    return client.get<Grid>(`/api/data/grids/${gridId}`);
}

/**
 * Create the Grids Hono app.
 *
 * This is a tenant-scoped app - the client is created per-request
 * using the user's Authorization header, not a pre-bound app token.
 */
export function createApp(context: AppContext): Hono {
    const app = new Hono();
    const { honoApp } = context;

    // GET /:id/:range - Read cells from grid
    app.get('/:id/:range', async (c) => {
        const client = createClient(c, honoApp);
        const gridId = c.req.param('id');
        const rangeStr = c.req.param('range');
        const format = c.req.query('format');

        // 1. Load grid
        const gridResult = await loadGrid(client, gridId);
        if (!gridResult.success || !gridResult.data) {
            return c.json(gridResult, 404);
        }
        const grid = gridResult.data;

        // 2. Parse and validate range
        let range: ParsedRange;
        try {
            range = parseRange(rangeStr);
            validateRangeBounds(range, grid.row_max, grid.col_max);
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Invalid range'
            }, 400);
        }

        // 3. Build query for cells
        const query: Record<string, string> = {
            'where[grid_id]': gridId,
            'order[row]': 'asc',
            'order[col]': 'asc',
        };

        // Add range-specific conditions
        switch (range.type) {
            case 'single':
                query['where[row]'] = String(range.row);
                query['where[col]'] = range.col!;
                break;
            case 'range':
                query['where[row][gte]'] = String(range.startRow);
                query['where[row][lte]'] = String(range.endRow);
                query['where[col][gte]'] = range.startCol!;
                query['where[col][lte]'] = range.endCol!;
                break;
            case 'row':
                query['where[row][gte]'] = String(range.startRow);
                query['where[row][lte]'] = String(range.endRow);
                break;
            case 'col':
                query['where[col][gte]'] = range.startCol!;
                query['where[col][lte]'] = range.endCol!;
                break;
        }

        // 4. Fetch cells
        const cellsResult = await client.get<GridCell[]>('/api/data/grid_cells', query);
        if (!cellsResult.success) {
            return c.json(cellsResult, 500);
        }

        // 5. Format and return
        const cells = formatCells(cellsResult.data || [], format);
        return c.json({
            grid_id: gridId,
            range: rangeStr,
            cells
        });
    });

    // PUT /:id/:range - Update cells in grid
    app.put('/:id/:range', async (c) => {
        const client = createClient(c, honoApp);
        const gridId = c.req.param('id');
        const rangeStr = c.req.param('range');

        // 1. Load grid
        const gridResult = await loadGrid(client, gridId);
        if (!gridResult.success || !gridResult.data) {
            return c.json(gridResult, 404);
        }
        const grid = gridResult.data;

        // 2. Parse and validate range
        let range: ParsedRange;
        try {
            range = parseRange(rangeStr);
            validateRangeBounds(range, grid.row_max, grid.col_max);
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Invalid range'
            }, 400);
        }

        // 3. Parse body
        const body = await c.req.json();
        let cellsToUpdate: Array<{ row: number; col: string; value: string | null }>;

        if (range.type === 'single') {
            // Single cell update - expect {value: "..."}
            if (!('value' in body)) {
                return c.json({
                    success: false,
                    error: 'Request body must contain "value" property for single cell update'
                }, 400);
            }
            cellsToUpdate = [{
                row: range.row!,
                col: range.col!,
                value: body.value
            }];
        } else {
            // Range update - expect {cells: [...]}
            if (!Array.isArray(body.cells)) {
                return c.json({
                    success: false,
                    error: 'Request body must contain "cells" array for range update'
                }, 400);
            }

            // Validate cells are within range
            for (const cell of body.cells) {
                if (!cell.row || !cell.col) {
                    return c.json({
                        success: false,
                        error: 'Each cell must have "row" and "col" properties'
                    }, 400);
                }
                if (!isCellInRange(cell, range)) {
                    return c.json({
                        success: false,
                        error: `Cell ${cell.col}${cell.row} is outside specified range ${rangeStr}`
                    }, 400);
                }
            }
            cellsToUpdate = body.cells;
        }

        // 4. Process each cell (upsert or delete)
        const updatedCells: any[] = [];

        for (const cell of cellsToUpdate) {
            // Check if cell exists
            const existingResult = await client.get<GridCell[]>('/api/data/grid_cells', {
                'where[grid_id]': gridId,
                'where[row]': String(cell.row),
                'where[col]': cell.col,
            });

            const existing = existingResult.data?.[0];

            if (cell.value === null || cell.value === undefined) {
                // Delete cell
                if (existing) {
                    await client.delete(`/api/data/grid_cells/${existing.id}`);
                }
            } else if (existing) {
                // Update existing cell
                const updateResult = await client.put<GridCell>(`/api/data/grid_cells/${existing.id}`, {
                    value: cell.value
                });
                if (updateResult.success && updateResult.data) {
                    updatedCells.push({
                        row: updateResult.data.row,
                        col: updateResult.data.col,
                        value: updateResult.data.value
                    });
                }
            } else {
                // Create new cell
                const createResult = await client.post<GridCell>('/api/data/grid_cells', {
                    grid_id: gridId,
                    row: cell.row,
                    col: cell.col,
                    value: cell.value
                });
                if (createResult.success && createResult.data) {
                    updatedCells.push({
                        row: createResult.data.row,
                        col: createResult.data.col,
                        value: createResult.data.value
                    });
                }
            }
        }

        return c.json({
            grid_id: gridId,
            range: rangeStr,
            cells: updatedCells
        });
    });

    // DELETE /:id/:range - Clear cells in range
    app.delete('/:id/:range', async (c) => {
        const client = createClient(c, honoApp);
        const gridId = c.req.param('id');
        const rangeStr = c.req.param('range');

        // 1. Load grid
        const gridResult = await loadGrid(client, gridId);
        if (!gridResult.success || !gridResult.data) {
            return c.json(gridResult, 404);
        }
        const grid = gridResult.data;

        // 2. Parse and validate range
        let range: ParsedRange;
        try {
            range = parseRange(rangeStr);
            validateRangeBounds(range, grid.row_max, grid.col_max);
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Invalid range'
            }, 400);
        }

        // 3. Build query for cells to delete
        const query: Record<string, string> = {
            'where[grid_id]': gridId,
        };

        switch (range.type) {
            case 'single':
                query['where[row]'] = String(range.row);
                query['where[col]'] = range.col!;
                break;
            case 'range':
                query['where[row][gte]'] = String(range.startRow);
                query['where[row][lte]'] = String(range.endRow);
                query['where[col][gte]'] = range.startCol!;
                query['where[col][lte]'] = range.endCol!;
                break;
            case 'row':
                query['where[row][gte]'] = String(range.startRow);
                query['where[row][lte]'] = String(range.endRow);
                break;
            case 'col':
                query['where[col][gte]'] = range.startCol!;
                query['where[col][lte]'] = range.endCol!;
                break;
        }

        // 4. Fetch cells to delete
        const cellsResult = await client.get<GridCell[]>('/api/data/grid_cells', query);
        const cellsToDelete = cellsResult.data || [];

        // 5. Delete each cell
        let deleted = 0;
        for (const cell of cellsToDelete) {
            const deleteResult = await client.delete(`/api/data/grid_cells/${cell.id}`);
            if (deleteResult.success) {
                deleted++;
            }
        }

        return c.json({
            grid_id: gridId,
            range: rangeStr,
            deleted
        });
    });

    // POST /:id/cells - Bulk upsert cells
    app.post('/:id/cells', async (c) => {
        const client = createClient(c, honoApp);
        const gridId = c.req.param('id');

        // 1. Load grid
        const gridResult = await loadGrid(client, gridId);
        if (!gridResult.success || !gridResult.data) {
            return c.json(gridResult, 404);
        }
        const grid = gridResult.data;

        // 2. Parse body
        const body = await c.req.json();
        if (!Array.isArray(body.cells)) {
            return c.json({
                success: false,
                error: 'Request body must contain "cells" array'
            }, 400);
        }

        const cells = body.cells;

        // 3. Validate bulk limit
        const maxCells = Math.min(1000, grid.row_max * 26);
        if (cells.length > maxCells) {
            return c.json({
                success: false,
                error: `Bulk operation limited to ${maxCells} cells`
            }, 400);
        }

        // 4. Validate each cell
        for (const cell of cells) {
            if (!cell.row || !cell.col) {
                return c.json({
                    success: false,
                    error: 'Each cell must have "row" and "col" properties'
                }, 400);
            }

            if (cell.row < 1 || cell.row > grid.row_max) {
                return c.json({
                    success: false,
                    error: `Row ${cell.row} exceeds grid limit ${grid.row_max}`
                }, 400);
            }

            if (cell.col < 'A' || cell.col > grid.col_max) {
                return c.json({
                    success: false,
                    error: `Column ${cell.col} exceeds grid limit ${grid.col_max}`
                }, 400);
            }

            if (cell.col.length !== 1) {
                return c.json({
                    success: false,
                    error: `Column must be a single character A-Z, got: ${cell.col}`
                }, 400);
            }
        }

        // 5. Process each cell (upsert or delete)
        const updatedCells: any[] = [];

        for (const cell of cells) {
            // Check if cell exists
            const existingResult = await client.get<GridCell[]>('/api/data/grid_cells', {
                'where[grid_id]': gridId,
                'where[row]': String(cell.row),
                'where[col]': cell.col,
            });

            const existing = existingResult.data?.[0];

            if (cell.value === null || cell.value === undefined) {
                // Delete cell
                if (existing) {
                    await client.delete(`/api/data/grid_cells/${existing.id}`);
                }
            } else if (existing) {
                // Update existing cell
                const updateResult = await client.put<GridCell>(`/api/data/grid_cells/${existing.id}`, {
                    value: cell.value
                });
                if (updateResult.success && updateResult.data) {
                    updatedCells.push({
                        row: updateResult.data.row,
                        col: updateResult.data.col,
                        value: updateResult.data.value
                    });
                }
            } else {
                // Create new cell
                const createResult = await client.post<GridCell>('/api/data/grid_cells', {
                    grid_id: gridId,
                    row: cell.row,
                    col: cell.col,
                    value: cell.value
                });
                if (createResult.success && createResult.data) {
                    updatedCells.push({
                        row: createResult.data.row,
                        col: createResult.data.col,
                        value: createResult.data.value
                    });
                }
            }
        }

        return c.json({
            grid_id: gridId,
            count: updatedCells.length,
            cells: updatedCells
        });
    });

    return app;
}
