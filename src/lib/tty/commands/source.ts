/**
 * source - Execute commands from a file
 *
 * Usage:
 *   source <file>
 *   . <file>
 *
 * Reads and executes commands from file in the current shell environment.
 * Variables set in the script affect the current session.
 *
 * Examples:
 *   source ~/.profile
 *   . /scripts/setup.sh
 */

import type { CommandHandler } from './shared.js';
import type { Session, CommandIO } from '../types.js';
import type { FS } from '@src/lib/fs/index.js';
import { parseCommand, expandVariables, resolvePath } from '../parser.js';
import { PassThrough } from 'node:stream';

// Command registry injected to avoid circular deps
let commandRegistry: Record<string, CommandHandler> | null = null;

export function setSourceCommandRegistry(registry: Record<string, CommandHandler>): void {
    commandRegistry = registry;
}

/**
 * Execute a single command line within a script
 */
async function executeLine(
    session: Session,
    fs: FS,
    line: string,
    io: CommandIO
): Promise<number> {
    const parsed = parseCommand(line);
    if (!parsed) return 0;

    // Expand variables in args
    parsed.args = parsed.args.map(arg => expandVariables(arg, session.env));

    if (!commandRegistry) {
        io.stderr.write('source: command registry not initialized\n');
        return 1;
    }

    const handler = commandRegistry[parsed.command];
    if (!handler) {
        io.stderr.write(`source: ${parsed.command}: command not found\n`);
        return 127;
    }

    // Create child IO that passes through to parent
    const childIO: CommandIO = {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        signal: io.signal,
    };

    // Pipe child output to parent
    childIO.stdout.pipe(io.stdout, { end: false });
    childIO.stderr.pipe(io.stderr, { end: false });
    childIO.stdin.end();

    try {
        const exitCode = await handler(session, fs, parsed.args, childIO);
        // Update $? for the next command
        session.env['?'] = String(exitCode);
        return exitCode;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        io.stderr.write(`source: ${parsed.command}: ${message}\n`);
        session.env['?'] = '1';
        return 1;
    }
}

export const source: CommandHandler = async (session, fs, args, io) => {
    if (!fs) {
        io.stderr.write('source: filesystem not available\n');
        return 1;
    }

    if (args.length === 0) {
        io.stderr.write('source: missing file operand\n');
        io.stderr.write('Usage: source <file>\n');
        return 1;
    }

    const filePath = resolvePath(session.cwd, args[0]);

    // Read script file
    let content: string;
    try {
        const buffer = await fs.read(filePath);
        content = buffer.toString();
    } catch {
        io.stderr.write(`source: ${args[0]}: No such file\n`);
        return 1;
    }

    // Parse and execute each line
    const lines = content.split('\n');
    let lastExitCode = 0;

    for (let i = 0; i < lines.length; i++) {
        // Check for abort signal
        if (io.signal?.aborted) {
            return 130;
        }

        const line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        // Handle shebang on first line
        if (i === 0 && trimmed.startsWith('#!')) {
            continue;
        }

        lastExitCode = await executeLine(session, fs, trimmed, io);
    }

    return lastExitCode;
};

// Alias for POSIX dot command
export const dot = source;
