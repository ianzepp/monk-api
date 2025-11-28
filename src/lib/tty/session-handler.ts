/**
 * TTY Session Handler
 *
 * Handles TTY input processing:
 * - Character-by-character input handling
 * - Escape sequence parsing (arrow keys)
 * - History navigation
 * - Line buffering and dispatch
 *
 * Delegates to:
 * - auth.ts for login/register states
 * - executor.ts for command execution
 */

import type { Session, TTYStream, TTYConfig } from './types.js';
import { DEFAULT_MOTD } from './types.js';
import { handleAuthState, printPrompt } from './auth.js';
import { executeLine, createIO } from './executor.js';
import { saveHistory } from './profile.js';

/**
 * Write text to stream with CRLF line endings (telnet convention)
 */
export function writeToStream(stream: TTYStream, text: string): void {
    const normalized = text.replace(/(?<!\r)\n/g, '\r\n');
    stream.write(normalized);
}

/**
 * Handle CTRL+C (interrupt signal)
 *
 * @returns true if handled (don't disconnect), false if should disconnect
 */
export function handleInterrupt(stream: TTYStream, session: Session): boolean {
    // If a foreground command is running, abort it
    if (session.foregroundAbort) {
        session.foregroundAbort.abort();
        writeToStream(stream, '^C\n');
        return true;
    }

    // No command running - clear input and show new prompt
    if (session.state === 'AUTHENTICATED') {
        writeToStream(stream, '^C\n');
        session.inputBuffer = '';
        session.historyIndex = -1;
        session.historyBuffer = '';
        printPrompt(stream, session);
        return true;
    }

    // Not authenticated - disconnect
    return false;
}

/**
 * Send welcome message and login prompt
 */
export function sendWelcome(stream: TTYStream, config?: TTYConfig): void {
    const motd = config?.motd || DEFAULT_MOTD;
    writeToStream(stream, motd);
    writeToStream(stream, '\nmonk login: ');
}

/**
 * Clear current line and write new content
 */
function replaceLine(stream: TTYStream, session: Session, newContent: string): void {
    const clearLen = session.inputBuffer.length;
    if (clearLen > 0) {
        writeToStream(stream, '\x1b[' + clearLen + 'D'); // Move left
        writeToStream(stream, '\x1b[K'); // Clear to end of line
    }
    session.inputBuffer = newContent;
    writeToStream(stream, newContent);
}

/**
 * Handle up arrow - navigate to previous command in history
 */
function handleHistoryUp(stream: TTYStream, session: Session): void {
    if (session.history.length === 0) return;

    if (session.historyIndex === -1) {
        session.historyBuffer = session.inputBuffer;
        session.historyIndex = session.history.length;
    }

    if (session.historyIndex > 0) {
        session.historyIndex--;
        replaceLine(stream, session, session.history[session.historyIndex]);
    }
}

/**
 * Handle down arrow - navigate to next command in history
 */
function handleHistoryDown(stream: TTYStream, session: Session): void {
    if (session.historyIndex === -1) return;

    session.historyIndex++;

    if (session.historyIndex >= session.history.length) {
        session.historyIndex = -1;
        replaceLine(stream, session, session.historyBuffer);
        session.historyBuffer = '';
    } else {
        replaceLine(stream, session, session.history[session.historyIndex]);
    }
}

/**
 * Handle input data from the stream
 *
 * Buffers input until newline, then processes.
 */
export async function handleInput(
    stream: TTYStream,
    session: Session,
    data: string | Uint8Array,
    config?: TTYConfig,
    echo = true
): Promise<void> {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);

    let inEscape = false;
    let escapeBuffer = '';

    for (const char of text) {
        // Handle ANSI escape sequences
        if (char === '\x1b') {
            inEscape = true;
            escapeBuffer = '';
            continue;
        }

        if (inEscape) {
            escapeBuffer += char;
            if (escapeBuffer.length >= 2 && /[A-Za-z~]/.test(char)) {
                inEscape = false;

                // Handle arrow keys for history (only in AUTHENTICATED state)
                if (session.state === 'AUTHENTICATED' && escapeBuffer === '[A') {
                    handleHistoryUp(stream, session);
                } else if (session.state === 'AUTHENTICATED' && escapeBuffer === '[B') {
                    handleHistoryDown(stream, session);
                }
            }
            continue;
        }

        // Handle backspace
        if (char === '\x7f' || char === '\x08') {
            if (session.inputBuffer.length > 0) {
                session.inputBuffer = session.inputBuffer.slice(0, -1);
                if (echo) {
                    writeToStream(stream, '\b \b');
                }
            }
            continue;
        }

        // Handle newline
        if (char === '\n' || char === '\r') {
            if (echo) {
                writeToStream(stream, '\r\n');
            }
            const line = session.inputBuffer;
            session.inputBuffer = '';
            await processLine(stream, session, line, config);
            continue;
        }

        // Accumulate input
        session.inputBuffer += char;
        if (echo) {
            const passwordStates = ['AWAITING_PASSWORD', 'REGISTER_PASSWORD', 'REGISTER_CONFIRM'];
            if (passwordStates.includes(session.state)) {
                writeToStream(stream, '*');
            } else {
                writeToStream(stream, char);
            }
        }
    }
}

/**
 * Process a complete input line based on session state
 */
async function processLine(
    stream: TTYStream,
    session: Session,
    line: string,
    config?: TTYConfig
): Promise<void> {
    const trimmed = line.trim();

    // Non-authenticated states go to auth handler
    if (session.state !== 'AUTHENTICATED') {
        await handleAuthState(stream, session, line, config);
        return;
    }

    // Empty line - just print prompt
    if (!trimmed) {
        printPrompt(stream, session);
        return;
    }

    // Execute command
    const abortController = new AbortController();
    session.foregroundAbort = abortController;

    try {
        // Create IO that pipes to TTY
        const io = createIO(abortController.signal);
        io.stdin.end(); // No interactive stdin for now
        io.stdout.on('data', (chunk) => writeToStream(stream, chunk.toString()));
        io.stderr.on('data', (chunk) => writeToStream(stream, chunk.toString()));

        await executeLine(session, trimmed, io, {
            addToHistory: true,
            signal: abortController.signal,
        });
    } catch (err) {
        if (!abortController.signal.aborted) {
            const message = err instanceof Error ? err.message : String(err);
            writeToStream(stream, `Error: ${message}\n`);
        }
    } finally {
        session.foregroundAbort = null;
    }

    // Check if exit command requested connection close
    if (session.shouldClose) {
        await saveHistory(session);
        stream.end();
        return;
    }

    printPrompt(stream, session);
}

// Re-export for convenience
export { printPrompt } from './auth.js';
export { saveHistory } from './profile.js';
