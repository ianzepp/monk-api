/**
 * @monk/formatter-grid-compact - Grid Compact Formatter
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
 */

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

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

export const GridCompactFormatter: Formatter = {
    encode(data: any): string {
        validateGridResponse(data);

        const compacted = {
            grid_id: data.grid_id,
            range: data.range,
            cells: data.cells.map((cell: any) => [
                cell.row,
                cell.col,
                cell.value
            ]),
            ...(data.count !== undefined && { count: data.count }),
            ...(data.deleted !== undefined && { deleted: data.deleted })
        };

        return JSON.stringify(compacted);
    },

    decode(_text: string): never {
        throw new Error('grid-compact is a response-only format. Use standard JSON for requests.');
    },

    contentType: 'application/json; charset=utf-8'
};
