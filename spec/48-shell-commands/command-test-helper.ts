/**
 * Shell Command Test Helper
 *
 * Utilities for testing TTY shell commands in isolation.
 * Provides mock Session and CommandIO objects.
 */

import { PassThrough } from 'node:stream';
import type { Session, CommandIO } from '@src/lib/tty/types.js';
import type { CommandHandler } from '@src/lib/tty/commands/shared.js';

/**
 * Result of running a command
 */
export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

/**
 * Create a minimal mock Session for testing
 */
export function createMockSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'test-session',
        pid: 1,
        authenticated: true,
        authState: 'AWAITING_USERNAME',
        mode: 'shell',
        shellTranscript: [],
        state: 'AUTHENTICATED',
        username: 'testuser',
        tenant: 'test',
        foregroundAbort: null,
        foregroundIO: null,
        cwd: '/',
        env: {
            USER: 'testuser',
            HOME: '/home/testuser',
            SHELL: '/bin/monksh',
            TERM: 'xterm',
        },
        inputBuffer: '',
        systemInit: null,
        cleanupHandlers: [],
        shouldClose: false,
        registrationData: null,
        history: [],
        historyIndex: -1,
        ...overrides,
    } as Session;
}

/**
 * Create CommandIO with captured stdout/stderr
 */
export function createMockIO(stdin: string = ''): {
    io: CommandIO;
    getStdout: () => string;
    getStderr: () => string;
} {
    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    let stdout = '';
    let stderr = '';

    stdoutStream.on('data', (chunk) => {
        stdout += chunk.toString();
    });

    stderrStream.on('data', (chunk) => {
        stderr += chunk.toString();
    });

    // Write stdin data and end the stream
    if (stdin) {
        stdinStream.write(stdin);
    }
    stdinStream.end();

    return {
        io: {
            stdin: stdinStream,
            stdout: stdoutStream,
            stderr: stderrStream,
        },
        getStdout: () => stdout,
        getStderr: () => stderr,
    };
}

/**
 * Run a command and capture output
 */
export async function runCommand(
    handler: CommandHandler,
    args: string[],
    stdin: string = '',
    session?: Partial<Session>
): Promise<CommandResult> {
    const mockSession = createMockSession(session);
    const { io, getStdout, getStderr } = createMockIO(stdin);

    const exitCode = await handler(mockSession, null, args, io);

    // Allow streams to flush
    await new Promise((resolve) => setImmediate(resolve));

    return {
        exitCode,
        stdout: getStdout(),
        stderr: getStderr(),
    };
}

/**
 * Parse output lines, removing trailing empty line if present
 */
export function outputLines(output: string): string[] {
    const lines = output.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}
