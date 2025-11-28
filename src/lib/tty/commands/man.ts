/**
 * man - display manual pages
 *
 * Usage:
 *   man <command>
 *
 * Examples:
 *   man find
 *   man grep
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandHandler } from './shared.js';

// Get the directory where man pages are stored
const __dirname = dirname(fileURLToPath(import.meta.url));
const manDir = join(__dirname, '..', 'man');

export const man: CommandHandler = async (_session, _fs, args, io) => {
    const command = args[0];

    if (!command) {
        io.stderr.write('Usage: man <command>\n');
        io.stderr.write('Example: man find\n');
        return 1;
    }

    try {
        const manPath = join(manDir, command);
        const content = await readFile(manPath, 'utf-8');
        io.stdout.write(content);
        if (!content.endsWith('\n')) {
            io.stdout.write('\n');
        }
        return 0;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            io.stderr.write(`No manual entry for ${command}\n`);
        } else {
            io.stderr.write(`man: ${err.message}\n`);
        }
        return 1;
    }
};
