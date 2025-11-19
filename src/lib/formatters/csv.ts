/**
 * CSV Formatter
 *
 * CSV (Comma-Separated Values) format encoding for tabular data export.
 * 
 * IMPORTANT CONSTRAINTS:
 * - Response-only format (no request parsing support)
 * - Only works with array of objects: [{...}, {...}, ...]
 * - Automatically unwraps data (assumes success=true, removes envelope)
 * - Errors return JSON with appropriate HTTP status
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

/**
 * Validate that data is an array of objects suitable for CSV export
 */
function validateCsvData(data: any): void {
    if (!Array.isArray(data)) {
        throw new Error('CSV format requires an array of objects. Received: ' + typeof data);
    }

    if (data.length === 0) {
        // Empty array is valid - will produce headers only
        return;
    }

    // Check first element to ensure it's an object
    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null || Array.isArray(firstItem)) {
        throw new Error('CSV format requires array of plain objects. First element is: ' + typeof firstItem);
    }

    // Warn about nested objects (they will be stringified)
    for (const key in firstItem) {
        const value = firstItem[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
            // Nested object detected - it will be JSON stringified
            console.warn(`CSV: Nested object detected at field "${key}" - will be JSON stringified`);
        }
    }
}

/**
 * Flatten nested objects for CSV export
 * Converts nested objects to JSON strings
 */
function flattenForCsv(data: any[]): any[] {
    return data.map(row => {
        const flattened: any = {};
        for (const key in row) {
            const value = row[key];
            // Convert nested objects/arrays to JSON strings
            if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
                flattened[key] = JSON.stringify(value);
            } else {
                flattened[key] = value;
            }
        }
        return flattened;
    });
}

export const CsvFormatter = {
    /**
     * Encode array of objects to CSV string
     * Validates data structure and throws error if invalid
     */
    encode(data: any): string {
        // Validate data structure
        validateCsvData(data);

        // Flatten any nested objects
        const flatData = flattenForCsv(data);

        // Use papaparse to generate CSV
        const csv = Papa.unparse(flatData, {
            header: true,
            quotes: true, // Quote all fields for safety
            quoteChar: '"',
            escapeChar: '"',
            delimiter: ',',
            newline: '\n',
        });

        return csv;
    },

    /**
     * CSV decoding not supported - throws error
     * CSV is a response-only format
     */
    decode(_text: string): never {
        throw new Error('CSV parsing for request bodies is not supported. CSV is a response-only format.');
    },

    /**
     * Content-Type for responses
     */
    contentType: 'text/csv; charset=utf-8; header=present'
};
