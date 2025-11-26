/**
 * @monk/formatter-markdown - Markdown Formatter
 *
 * Converts JSON objects and arrays into readable Markdown format:
 * - Arrays of objects -> Markdown tables
 * - Single objects -> Key-value lists
 * - Nested structures -> Indented sections
 */

export interface Formatter {
    encode(data: any): string;
    decode(text: string): any;
    contentType: string;
}

function stringifyValue(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function arrayToMarkdownTable(arr: any[]): string {
    if (arr.length === 0) {
        return '_Empty array_\n';
    }

    if (typeof arr[0] !== 'object' || arr[0] === null) {
        return arr.map((item, i) => `${i + 1}. ${stringifyValue(item)}`).join('\n') + '\n';
    }

    const allKeys = new Set<string>();
    arr.forEach(obj => {
        if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => allKeys.add(key));
        }
    });

    const keys = Array.from(allKeys);

    let table = '| ' + keys.join(' | ') + ' |\n';
    table += '| ' + keys.map(() => '---').join(' | ') + ' |\n';

    arr.forEach(obj => {
        const row = keys.map(key => {
            const value = obj?.[key];
            return stringifyValue(value);
        });
        table += '| ' + row.join(' | ') + ' |\n';
    });

    return table;
}

function objectToMarkdown(obj: any, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let output = '';

    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) {
            output += `${prefix}- **${key}**: _null_\n`;
        } else if (Array.isArray(value)) {
            output += `${prefix}- **${key}**:\n`;
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                const table = arrayToMarkdownTable(value);
                output += table.split('\n').map(line => line ? `${prefix}  ${line}` : '').join('\n') + '\n';
            } else {
                output += value.map((item, i) => `${prefix}  ${i + 1}. ${stringifyValue(item)}`).join('\n') + '\n';
            }
        } else if (typeof value === 'object') {
            output += `${prefix}- **${key}**:\n`;
            output += objectToMarkdown(value, indent + 1);
        } else {
            output += `${prefix}- **${key}**: ${stringifyValue(value)}\n`;
        }
    }

    return output;
}

function encodeMarkdown(data: any): string {
    let output = '';

    if (data && typeof data === 'object' && 'success' in data) {
        output += `# API Response\n\n`;
        output += `**Status**: ${data.success ? '✓ Success' : '✗ Error'}\n\n`;

        if (data.error) {
            output += `**Error**: ${data.error}\n\n`;
        }

        if (data.data !== undefined) {
            output += `## Data\n\n`;

            if (Array.isArray(data.data)) {
                output += arrayToMarkdownTable(data.data);
            } else if (typeof data.data === 'object' && data.data !== null) {
                output += objectToMarkdown(data.data);
            } else {
                output += stringifyValue(data.data) + '\n';
            }
        }

        const otherFields = Object.keys(data).filter(k => k !== 'success' && k !== 'data' && k !== 'error');
        if (otherFields.length > 0) {
            output += `\n## Additional Information\n\n`;
            const otherData: any = {};
            otherFields.forEach(key => otherData[key] = data[key]);
            output += objectToMarkdown(otherData);
        }
    } else if (Array.isArray(data)) {
        output += `# Response\n\n`;
        output += arrayToMarkdownTable(data);
    } else if (typeof data === 'object' && data !== null) {
        output += `# Response\n\n`;
        output += objectToMarkdown(data);
    } else {
        output += stringifyValue(data) + '\n';
    }

    return output;
}

export const MarkdownFormatter: Formatter = {
    encode(data: any): string {
        return encodeMarkdown(data);
    },

    decode(_text: string): any {
        throw new Error('Markdown decoding is not supported. Markdown is a presentation format, not a data serialization format.');
    },

    contentType: 'text/markdown; charset=utf-8'
};
