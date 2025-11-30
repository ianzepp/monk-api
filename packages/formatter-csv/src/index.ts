/**
 * @monk/formatter-csv - CSV Formatter
 *
 * CSV (Comma-Separated Values) format for tabular data import/export.
 *
 * Supported operations:
 * - encode: Convert array of objects to CSV string
 * - decode: Parse CSV string to array of objects
 *
 * Use cases:
 * - Data export for Excel/Google Sheets
 * - Bulk data import from spreadsheets
 * - Reporting and analytics
 * - Integration with data analysis tools
 */

import Papa from 'papaparse';
import { type Formatter, toBytes, fromBytes } from '@monk/common';

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
    encode(data: any): Uint8Array {
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
        return toBytes(csv);
    },

    decode(data: Uint8Array): any[] {
        const text = fromBytes(data);
        const result = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
        });

        if (result.errors.length > 0) {
            const firstError = result.errors[0];
            throw new Error(`CSV parse error at row ${firstError.row}: ${firstError.message}`);
        }

        return result.data as any[];
    },

    contentType: 'text/csv; charset=utf-8; header=present'
};
