/**
 * sleep - Delay for a specified time
 */

import type { CommandHandler } from './shared.js';

/**
 * Parse duration string into milliseconds
 * Supports: 5 (seconds), 5s, 500ms, 1m, 1h
 */
function parseDuration(str: string): number | null {
    const match = str.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
        case 'ms':
            return value;
        case 's':
            return value * 1000;
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        default:
            return null;
    }
}

export const sleep: CommandHandler = async (_session, _fs, args, io) => {
    if (args.length === 0) {
        io.stderr.write('sleep: missing operand\n');
        io.stderr.write('Usage: sleep DURATION\n');
        return 1;
    }

    const duration = parseDuration(args[0]);
    if (duration === null) {
        io.stderr.write(`sleep: invalid time interval '${args[0]}'\n`);
        return 1;
    }

    // Cap at 1 hour
    const capped = Math.min(duration, 60 * 60 * 1000);

    await new Promise((resolve) => setTimeout(resolve, capped));
    return 0;
};
