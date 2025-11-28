/**
 * select - Query records with field selection
 *
 * Usage:
 *   select <fields> [from <path>]
 *
 * Examples:
 *   select id, name                 (current directory)
 *   select id, name from users      (relative path)
 *   select amount from /api/data/orders
 */

import { FSError } from '@src/lib/fs/index.js';
import { resolvePath } from '../parser.js';
import type { CommandHandler } from './shared.js';

export const select: CommandHandler = async (session, fs, args, write) => {
    // Parse: select <fields> [from <path>]
    // If no 'from', default to current directory
    const fromIndex = args.indexOf('from');

    let fieldsPart: string;
    let pathPart: string;

    if (fromIndex === -1) {
        // No 'from' - use all args as fields, default path to CWD
        fieldsPart = args.join(' ');
        pathPart = '.';
    } else {
        fieldsPart = args.slice(0, fromIndex).join(' ');
        pathPart = args.slice(fromIndex + 1).join(' ') || '.';
    }

    // Parse fields: "id, name, email"
    const fields = fieldsPart.split(',').map(f => f.trim()).filter(Boolean);

    if (fields.length === 0) {
        write('Usage: select <fields> [from <path>]\n');
        write('  select id, name\n');
        write('  select id, name from /api/data/users\n');
        return;
    }

    const resolved = resolvePath(session.cwd, pathPart);

    try {
        const stat = await fs.stat(resolved);

        if (stat.type === 'directory') {
            await selectFromDirectory(fs, resolved, fields, write);
        } else {
            await selectFromFile(fs, resolved, fields, write);
        }
    } catch (err) {
        if (err instanceof FSError) {
            write(`select: ${pathPart}: ${err.message}\n`);
        } else {
            throw err;
        }
    }
};

/**
 * Select from a directory (multiple records)
 */
async function selectFromDirectory(
    fs: any,
    path: string,
    fields: string[],
    write: (text: string) => void
): Promise<void> {
    const entries = await fs.readdir(path);

    // Filter to files only (records)
    const files = entries.filter((e: any) => e.type === 'file');

    if (files.length === 0) {
        write('(0 rows)\n');
        return;
    }

    // Read all records
    const records: Record<string, any>[] = [];
    for (const entry of files) {
        try {
            const content = await fs.read(`${path}/${entry.name}`);
            const record = JSON.parse(content.toString());
            records.push(record);
        } catch {
            // Skip records that can't be parsed
        }
    }

    if (records.length === 0) {
        write('(0 rows)\n');
        return;
    }

    formatTable(records, fields, write);
}

/**
 * Select from a file (single record)
 */
async function selectFromFile(
    fs: any,
    path: string,
    fields: string[],
    write: (text: string) => void
): Promise<void> {
    const content = await fs.read(path);
    let record: Record<string, any>;

    try {
        const parsed = JSON.parse(content.toString());
        // Handle both single record and array of records
        if (Array.isArray(parsed)) {
            formatTable(parsed, fields, write);
            return;
        }
        record = parsed;
    } catch {
        write('select: Cannot parse as JSON\n');
        return;
    }

    formatTable([record], fields, write);
}

/**
 * Format records as a table
 */
function formatTable(
    records: Record<string, any>[],
    fields: string[],
    write: (text: string) => void
): void {
    if (records.length === 0) {
        write('(0 rows)\n');
        return;
    }

    const columns = fields;

    // Calculate column widths
    const widths: Record<string, number> = {};
    for (const col of columns) {
        widths[col] = col.length;
    }

    for (const record of records) {
        for (const col of columns) {
            const value = formatValue(record[col]);
            widths[col] = Math.max(widths[col], value.length);
        }
    }

    // Cap column widths at 40 characters
    for (const col of columns) {
        widths[col] = Math.min(widths[col], 40);
    }

    // Print header
    const header = columns.map(col => col.padEnd(widths[col])).join('  ');
    write(header + '\n');

    // Print separator
    const separator = columns.map(col => '-'.repeat(widths[col])).join('  ');
    write(separator + '\n');

    // Print rows
    for (const record of records) {
        const row = columns.map(col => {
            const value = formatValue(record[col]);
            return truncate(value, widths[col]).padEnd(widths[col]);
        }).join('  ');
        write(row + '\n');
    }

    write(`(${records.length} row${records.length === 1 ? '' : 's'})\n`);
}

/**
 * Format a value for display
 */
function formatValue(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

/**
 * Truncate a string to max length
 */
function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) {
        return str;
    }
    return str.slice(0, maxLen - 1) + '…';
}
