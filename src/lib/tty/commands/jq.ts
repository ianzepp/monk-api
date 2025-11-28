/**
 * jq - JSON query and transform
 *
 * Usage:
 *   <input> | jq <expression>
 *   jq <expression> < file
 *
 * Examples:
 *   cat record | jq .name
 *   cat record | jq '.user.email'
 *   find /api/data/users | xargs cat | jq .id
 */

import type { CommandHandler } from './shared.js';

export const jq: CommandHandler = async (_session, _fs, args, io) => {
    const expression = args[0];

    if (!expression) {
        io.stderr.write('jq: missing expression\n');
        io.stderr.write('Usage: jq <expression>\n');
        io.stderr.write('Examples: jq .name, jq .user.email, jq .\n');
        return 1;
    }

    // Collect stdin
    let input = '';
    for await (const chunk of io.stdin) {
        input += chunk.toString();
    }

    input = input.trim();
    if (!input) {
        return 0;
    }

    // Handle multiple JSON objects (one per line)
    const lines = input.split('\n').filter(line => line.trim());

    for (const line of lines) {
        try {
            const data = JSON.parse(line);
            const result = evaluateExpression(data, expression);

            if (result === undefined) {
                io.stdout.write('null\n');
            } else if (typeof result === 'string') {
                io.stdout.write(result + '\n');
            } else {
                io.stdout.write(JSON.stringify(result, null, 2) + '\n');
            }
        } catch (err) {
            // Try parsing entire input as single JSON
            if (lines.length === 1) {
                io.stderr.write(`jq: parse error: ${err instanceof Error ? err.message : String(err)}\n`);
                return 1;
            }
            // Warn about unparseable lines in multi-line mode
            io.stderr.write(`jq: skipping invalid JSON line\n`);
        }
    }

    return 0;
};

/**
 * Evaluate a jq-like expression on data
 *
 * Supports:
 *   .           - identity (return whole object)
 *   .foo        - access property
 *   .foo.bar    - nested property access
 *   .foo[0]     - array index
 *   .[]         - iterate array
 */
function evaluateExpression(data: any, expr: string): any {
    // Identity
    if (expr === '.') {
        return data;
    }

    // Must start with .
    if (!expr.startsWith('.')) {
        throw new Error(`Invalid expression: ${expr}`);
    }

    const path = expr.slice(1); // Remove leading .

    // Handle .[] (array iteration) - return array as-is for now
    if (path === '[]') {
        return Array.isArray(data) ? data : [data];
    }

    // Parse path segments
    const segments: (string | number)[] = [];
    let current = '';
    let inBracket = false;

    for (let i = 0; i < path.length; i++) {
        const char = path[i];

        if (char === '[') {
            if (current) {
                segments.push(current);
                current = '';
            }
            inBracket = true;
        } else if (char === ']') {
            if (current) {
                // Check if it's a number
                const num = parseInt(current, 10);
                segments.push(isNaN(num) ? current : num);
                current = '';
            }
            inBracket = false;
        } else if (char === '.' && !inBracket) {
            if (current) {
                segments.push(current);
                current = '';
            }
        } else {
            current += char;
        }
    }

    if (current) {
        segments.push(current);
    }

    // Navigate the path
    let result = data;
    for (const segment of segments) {
        if (result === null || result === undefined) {
            return undefined;
        }
        result = result[segment];
    }

    return result;
}
