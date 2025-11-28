/**
 * describe - Show model schema
 *
 * Usage:
 *   describe <model>
 *   describe              (infer from CWD if in /api/data/<model>)
 *
 * Examples:
 *   describe products
 *   describe users
 *   cd /api/data/orders && describe
 */

import { FSError } from '@src/lib/fs/index.js';
import type { CommandHandler } from './shared.js';

export const describe: CommandHandler = async (session, fs, args, write) => {
    // If no model specified, try to infer from CWD
    const modelName = args[0] || inferModelFromCwd(session.cwd);

    if (!modelName) {
        write('Usage: describe <model>\n');
        write('  describe products\n');
        write('  describe users\n');
        return;
    }

    const schemaPath = `/api/describe/${modelName}/.yaml`;

    try {
        const content = await fs.read(schemaPath);
        write(content.toString());
        if (!content.toString().endsWith('\n')) {
            write('\n');
        }
    } catch (err) {
        if (err instanceof FSError) {
            if (err.code === 'ENOENT') {
                write(`describe: ${modelName}: model not found\n`);
            } else {
                write(`describe: ${modelName}: ${err.message}\n`);
            }
        } else {
            throw err;
        }
    }
};

/**
 * Try to infer model name from current working directory
 *
 * Works for paths like:
 *   /api/data/products      → products
 *   /api/data/products/123  → products
 *   /api/trashed/orders     → orders
 */
function inferModelFromCwd(cwd: string): string | null {
    const patterns = [
        /^\/api\/data\/([^/]+)/,
        /^\/api\/trashed\/([^/]+)/,
        /^\/api\/find\/([^/]+)/,
        /^\/api\/describe\/([^/]+)/,
    ];

    for (const pattern of patterns) {
        const match = cwd.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}
