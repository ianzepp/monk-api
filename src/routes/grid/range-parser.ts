/**
 * Grid Range Parser - Excel-style Range Notation
 *
 * Parses Excel-style range notation into structured coordinates
 * for SQL query generation.
 *
 * Supported formats:
 * - Single cell: "A1", "B5", "Z100"
 * - Range: "A1:Z100", "B2:D10"
 * - Row range: "5:5", "1:10"
 * - Column range: "A:A", "B:Z"
 */

import { HttpErrors } from '@src/lib/errors/http-error.js';

export interface ParsedRange {
    type: 'single' | 'range' | 'row' | 'col';
    row?: number;           // For single cell or row range
    col?: string;           // For single cell or col range
    startRow?: number;      // For range
    endRow?: number;        // For range
    startCol?: string;      // For range
    endCol?: string;        // For range
    maxRow?: number;        // Highest row referenced (for validation)
}

/**
 * Parse Excel-style range notation into structured coordinates
 *
 * @param rangeStr - Range string (e.g., "A1", "A1:Z100", "5:5", "A:A")
 * @returns ParsedRange object with coordinates
 * @throws HttpError if range format is invalid
 */
export function parseRange(rangeStr: string): ParsedRange {
    // Validate input
    if (!rangeStr || typeof rangeStr !== 'string') {
        throw HttpErrors.badRequest(
            'Range parameter is required',
            'GRID_INVALID_RANGE'
        );
    }

    const trimmed = rangeStr.trim().toUpperCase();

    if (!trimmed) {
        throw HttpErrors.badRequest(
            'Range parameter cannot be empty',
            'GRID_INVALID_RANGE'
        );
    }

    // Check if this is a range notation (contains colon)
    if (trimmed.includes(':')) {
        return parseRangeNotation(trimmed);
    } else {
        return parseSingleCell(trimmed);
    }
}

/**
 * Parse single cell notation (e.g., "A1", "Z100")
 */
function parseSingleCell(cell: string): ParsedRange {
    const match = cell.match(/^([A-Z])(\d+)$/);

    if (!match) {
        throw HttpErrors.badRequest(
            `Invalid cell format: ${cell}. Expected format: A1, B5, Z100`,
            'GRID_INVALID_RANGE'
        );
    }

    const col = match[1];
    const row = parseInt(match[2], 10);

    if (row <= 0) {
        throw HttpErrors.badRequest(
            `Row number must be positive: ${row}`,
            'GRID_INVALID_RANGE'
        );
    }

    return {
        type: 'single',
        row,
        col,
        maxRow: row
    };
}

/**
 * Parse range notation (e.g., "A1:Z100", "5:5", "A:A")
 */
function parseRangeNotation(rangeStr: string): ParsedRange {
    const parts = rangeStr.split(':');

    if (parts.length !== 2) {
        throw HttpErrors.badRequest(
            `Invalid range format: ${rangeStr}. Expected format: A1:Z100, 5:5, or A:A`,
            'GRID_INVALID_RANGE'
        );
    }

    const [start, end] = parts;

    // Row range (e.g., "5:5", "1:10")
    if (/^\d+$/.test(start) && /^\d+$/.test(end)) {
        return parseRowRange(start, end);
    }

    // Column range (e.g., "A:A", "B:Z")
    if (/^[A-Z]$/.test(start) && /^[A-Z]$/.test(end)) {
        return parseColRange(start, end);
    }

    // Cell range (e.g., "A1:Z100")
    if (/^[A-Z]\d+$/.test(start) && /^[A-Z]\d+$/.test(end)) {
        return parseCellRange(start, end);
    }

    throw HttpErrors.badRequest(
        `Invalid range format: ${rangeStr}. Expected format: A1:Z100, 5:5, or A:A`,
        'INVALID_RANGE'
    );
}

/**
 * Parse row range (e.g., "5:5", "1:10")
 */
function parseRowRange(startStr: string, endStr: string): ParsedRange {
    const startRow = parseInt(startStr, 10);
    const endRow = parseInt(endStr, 10);

    if (startRow <= 0 || endRow <= 0) {
        throw HttpErrors.badRequest(
            `Row numbers must be positive: ${startStr}:${endStr}`,
            'GRID_INVALID_RANGE'
        );
    }

    if (startRow > endRow) {
        throw HttpErrors.badRequest(
            `Invalid range: start row ${startRow} is after end row ${endRow}`,
            'GRID_INVALID_RANGE'
        );
    }

    return {
        type: 'row',
        row: startRow,
        startRow,
        endRow,
        maxRow: endRow
    };
}

/**
 * Parse column range (e.g., "A:A", "B:Z")
 */
function parseColRange(startCol: string, endCol: string): ParsedRange {
    if (startCol > endCol) {
        throw HttpErrors.badRequest(
            `Invalid range: start column ${startCol} is after end column ${endCol}`,
            'GRID_INVALID_RANGE'
        );
    }

    return {
        type: 'col',
        col: startCol,
        startCol,
        endCol
    };
}

/**
 * Parse cell range (e.g., "A1:Z100")
 */
function parseCellRange(start: string, end: string): ParsedRange {
    const startMatch = start.match(/^([A-Z])(\d+)$/);
    const endMatch = end.match(/^([A-Z])(\d+)$/);

    if (!startMatch || !endMatch) {
        throw HttpErrors.badRequest(
            `Invalid cell range format: ${start}:${end}`,
            'GRID_INVALID_RANGE'
        );
    }

    const startCol = startMatch[1];
    const startRow = parseInt(startMatch[2], 10);
    const endCol = endMatch[1];
    const endRow = parseInt(endMatch[2], 10);

    if (startRow <= 0 || endRow <= 0) {
        throw HttpErrors.badRequest(
            `Row numbers must be positive: ${start}:${end}`,
            'GRID_INVALID_RANGE'
        );
    }

    if (startRow > endRow) {
        throw HttpErrors.badRequest(
            `Invalid range: start row ${startRow} is after end row ${endRow}`,
            'GRID_INVALID_RANGE'
        );
    }

    if (startCol > endCol) {
        throw HttpErrors.badRequest(
            `Invalid range: start column ${startCol} is after end column ${endCol}`,
            'GRID_INVALID_RANGE'
        );
    }

    return {
        type: 'range',
        startRow,
        endRow,
        startCol,
        endCol,
        maxRow: endRow
    };
}

/**
 * Validate range bounds against grid constraints
 *
 * @param range - Parsed range object
 * @param rowMax - Maximum row count for grid
 * @param colMax - Maximum column letter for grid
 * @throws HttpError if range exceeds grid bounds
 */
export function validateRangeBounds(range: ParsedRange, rowMax: number, colMax: string): void {
    // Validate row bounds
    if (range.maxRow && range.maxRow > rowMax) {
        throw HttpErrors.badRequest(
            `Row ${range.maxRow} exceeds grid limit ${rowMax}`,
            'GRID_ROW_OUT_OF_BOUNDS'
        );
    }

    // Validate column bounds
    const checkCol = (col: string) => {
        if (col > colMax) {
            throw HttpErrors.badRequest(
                `Column ${col} exceeds grid limit ${colMax}`,
                'GRID_COLUMN_OUT_OF_BOUNDS'
            );
        }
    };

    if (range.col) checkCol(range.col);
    if (range.startCol) checkCol(range.startCol);
    if (range.endCol) checkCol(range.endCol);
}
