/**
 * Grid Compact Formatter
 *
 * Compact wire format for Grid API responses.
 * Converts cell objects to positional arrays: [row, col, value]
 *
 * IMPORTANT CONSTRAINTS:
 * - Response-only (no decode support)
 * - Only works with Grid API response format
 * - Reduces wire size by ~60% for typical grids
 * - Maintains sparse cell format
 *
 * Use cases:
 * - Mobile clients (bandwidth savings)
 * - Large grid exports (1000+ cells)
 * - High-frequency polling scenarios
 *
 * Wire format comparison:
 *
 * Standard format (~60 KB for 1000 cells):
 * {
 *   "grid_id": "abc123",
 *   "range": "A1:Z100",
 *   "cells": [
 *     {"row": 1, "col": "A", "value": "Name"},
 *     {"row": 1, "col": "B", "value": "Age"}
 *   ]
 * }
 *
 * Compact format (~24 KB for 1000 cells):
 * {
 *   "grid_id": "abc123",
 *   "range": "A1:Z100",
 *   "cells": [
 *     [1, "A", "Name"],
 *     [1, "B", "Age"]
 *   ]
 * }
 */

/**
 * Validate Grid API response format
 */
function validateGridResponse(data: any): void {
    if (!data || typeof data !== 'object') {
        throw new Error('grid-compact format requires Grid API response object');
    }

    if (!data.grid_id || !data.range) {
        throw new Error('grid-compact format requires grid_id and range fields');
    }

    if (!Array.isArray(data.cells)) {
        throw new Error('grid-compact format requires cells array');
    }
}

export const GridCompactFormatter = {
    /**
     * Encode Grid API response to compact format
     * Converts cells from {row, col, value} to [row, col, value]
     */
    encode(data: any): string {
        // Validate Grid API response structure
        validateGridResponse(data);

        // Convert cells to compact array format
        const compacted = {
            grid_id: data.grid_id,
            range: data.range,
            cells: data.cells.map((cell: any) => [
                cell.row,
                cell.col,
                cell.value
            ]),
            // Preserve count if present (from bulk operations)
            ...(data.count !== undefined && { count: data.count }),
            // Preserve deleted if present (from DELETE operations)
            ...(data.deleted !== undefined && { deleted: data.deleted })
        };

        return JSON.stringify(compacted);
    },

    /**
     * Decoding not supported - grid-compact is response-only
     */
    decode(_text: string): never {
        throw new Error('grid-compact is a response-only format. Use standard JSON for requests.');
    },

    /**
     * Content-Type remains JSON (just a different structure)
     */
    contentType: 'application/json; charset=utf-8'
};
