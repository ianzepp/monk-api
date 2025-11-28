/**
 * kill - Terminate a process
 */

import type { CommandHandler } from './shared.js';
import { killProcess, getProcess } from '@src/lib/process.js';

export const kill: CommandHandler = async (session, _fs, args, io) => {
    if (args.length === 0) {
        io.stderr.write('kill: usage: kill PID\n');
        return 1;
    }

    // Parse PID (skip signal flags like -9, -TERM for compatibility)
    let pidArg = args[0];
    if (pidArg.startsWith('-') && args.length > 1) {
        // kill -9 PID format - ignore signal, use PID
        pidArg = args[1];
    }

    const pid = parseInt(pidArg, 10);
    if (isNaN(pid)) {
        io.stderr.write(`kill: invalid PID: ${pidArg}\n`);
        return 1;
    }

    try {
        // Check if process exists
        const proc = await getProcess(session.tenant, pid);
        if (!proc) {
            io.stderr.write(`kill: (${pid}) - No such process\n`);
            return 1;
        }

        // Check if it's running or sleeping
        if (proc.state !== 'R' && proc.state !== 'S') {
            const stateNames: Record<string, string> = {
                'Z': 'zombie',
                'T': 'stopped',
                'X': 'dead',
            };
            io.stderr.write(`kill: (${pid}) - Process is ${stateNames[proc.state] || proc.state}\n`);
            return 1;
        }

        // Kill it
        const killed = await killProcess(session.tenant, pid);
        if (!killed) {
            io.stderr.write(`kill: (${pid}) - Operation not permitted\n`);
            return 1;
        }

        // If killing our own shell process, trigger disconnect
        if (session.pid === pid) {
            session.shouldClose = true;
        }

        return 0;

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr.write(`kill: ${message}\n`);
        return 1;
    }
};
