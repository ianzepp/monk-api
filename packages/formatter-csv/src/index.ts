/**
 * @monk/formatter-csv - CSV Formatter
 *
 * CSV (Comma-Separated Values) format encoding for tabular data export.
 *
 * IMPORTANT CONSTRAINTS:
 * - Response-only format (no request parsing support)
 * - Only works with array of objects: [{...}, {...}, ...]
 * - Validates data structure before formatting
 *
 * Use cases:
 * - Data export for Excel/Google Sheets
 * - Reporting and analytics
 * - Bulk data extraction
 * - Integration with data analysis tools
 * - Database query results export
 */

import Papa from 'papaparse';

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

/**
 * Validate that data is an array of objects suitable for CSV export
 */
function validateCsvData(data: any): void {
    if (!Array.isArray(data)) {
        throw new Error('CSV format requires an array of objects. Received: ' + typeof data);
    }

    if (data.length === 0) {
        return;
    }

    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null || Array.isArray(firstItem)) {
        throw new Error('CSV format requires array of plain objects. First element is: ' + typeof firstItem);
    }

    for (const key in firstItem) {
        const value = firstItem[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
            console.warn(`CSV: Nested object detected at field "${key}" - will be JSON stringified`);
        }
    }
}

/**
 * Flatten nested objects for CSV export
 */
function flattenForCsv(data: any[]): any[] {
    return data.map(row => {
        const flattened: any = {};
        for (const key in row) {
            const value = row[key];
            if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
                flattened[key] = JSON.stringify(value);
            } else {
                flattened[key] = value;
            }
        }
        return flattened;
    });
}

export const CsvFormatter: Formatter = {
    encode(data: any): string {
        validateCsvData(data);
        const flatData = flattenForCsv(data);
        const csv = Papa.unparse(flatData, {
            header: true,
            quotes: true,
            quoteChar: '"',
            escapeChar: '"',
            delimiter: ',',
            newline: '\n',
        });
        return csv;
    },

    decode(_text: string): never {
        throw new Error('CSV parsing for request bodies is not supported. CSV is a response-only format.');
    },

    contentType: 'text/csv; charset=utf-8; header=present'
};
