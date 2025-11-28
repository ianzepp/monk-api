/**
 * xargs - Execute command for each stdin line
 *
 * Usage:
 *   <input> | xargs <command> [args...]
 *
 * Examples:
 *   find /api/data/users | xargs cat
 *   find . | grep users | xargs ls -l
 *   echo "a b c" | xargs echo prefix:
 */

import { PassThrough } from 'node:stream';
import type { FS } from '@src/lib/fs/index.js';
import type { CommandHandler } from './shared.js';
import type { Session, CommandIO } from '../types.js';
import { commands } from './index.js';

export const xargs: CommandHandler = async (session, fs, args, io) => {
    if (args.length === 0) {
        io.stderr.write('xargs: missing command\n');
        io.stderr.write('Usage: <input> | xargs <command> [args...]\n');
        return 1;
    }

    const commandName = args[0];
    const commandArgs = args.slice(1);

    const handler = commands[commandName];
    if (!handler) {
        io.stderr.write(`xargs: ${commandName}: command not found\n`);
        return 127;
    }

    // Collect all stdin lines
    const lines: string[] = [];
    let buffer = '';

    for await (const chunk of io.stdin) {
        buffer += chunk.toString();
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
            const trimmed = line.trim();
            if (trimmed) {
                lines.push(trimmed);
            }
        }
    }

    // Handle remaining buffer
    if (buffer.trim()) {
        lines.push(buffer.trim());
    }

    if (lines.length === 0) {
        return 0;
    }

    // Execute command for each line
    let lastExitCode = 0;

    for (const line of lines) {
        // Check for abort signal
        if (io.signal?.aborted) {
            return 130;
        }

        const fullArgs = [...commandArgs, line];

        // Create IO for the child command
        const childIO: CommandIO = {
            stdin: new PassThrough(),
            stdout: io.stdout,  // Share stdout with parent
            stderr: io.stderr,  // Share stderr with parent
            signal: io.signal,  // Pass through abort signal
        };
        childIO.stdin.end();  // No stdin for child commands

        try {
            const exitCode = await handler(session, fs, fullArgs, childIO);
            if (exitCode !== 0) {
                lastExitCode = exitCode;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            io.stderr.write(`xargs: ${commandName}: ${message}\n`);
            lastExitCode = 1;
        }
    }

    return lastExitCode;
};
