/**
 * Shell Command Parser
 *
 * Parses shell-style commands with arguments, quotes, and redirects.
 */

import type { ParsedCommand } from './transport.js';

/**
 * Tokenize input respecting quotes
 */
function tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;
    let escape = false;

    for (const char of input) {
        if (escape) {
            current += char;
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if ((char === '"' || char === "'") && !inQuote) {
            inQuote = char;
            continue;
        }

        if (char === inQuote) {
            inQuote = null;
            continue;
        }

        if (char === ' ' && !inQuote) {
            if (current) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += char;
    }

    if (current) {
        tokens.push(current);
    }

    return tokens;
}

/**
 * Parse a command string into structured command object
 */
export function parseCommand(input: string): ParsedCommand | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Handle pipes by splitting and recursing
    const pipeIndex = findUnquotedChar(trimmed, '|');
    if (pipeIndex !== -1) {
        const left = trimmed.slice(0, pipeIndex).trim();
        const right = trimmed.slice(pipeIndex + 1).trim();
        const leftCmd = parseCommand(left);
        const rightCmd = parseCommand(right);
        if (leftCmd && rightCmd) {
            leftCmd.pipe = rightCmd;
        }
        return leftCmd;
    }

    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return null;

    const result: ParsedCommand = {
        command: tokens[0],
        args: []
    };

    let i = 1;
    while (i < tokens.length) {
        const token = tokens[i];

        if (token === '<' && tokens[i + 1]) {
            result.inputRedirect = tokens[++i];
        } else if (token === '>' && tokens[i + 1]) {
            result.outputRedirect = tokens[++i];
        } else if (token === '>>' && tokens[i + 1]) {
            result.appendRedirect = tokens[++i];
        } else if (token.startsWith('<')) {
            result.inputRedirect = token.slice(1);
        } else if (token.startsWith('>>')) {
            result.appendRedirect = token.slice(2);
        } else if (token.startsWith('>')) {
            result.outputRedirect = token.slice(1);
        } else {
            result.args.push(token);
        }
        i++;
    }

    return result;
}

/**
 * Find character not inside quotes
 */
function findUnquotedChar(str: string, char: string): number {
    let inQuote: string | null = null;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
        const c = str[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (c === '\\') {
            escape = true;
            continue;
        }

        if ((c === '"' || c === "'") && !inQuote) {
            inQuote = c;
            continue;
        }

        if (c === inQuote) {
            inQuote = null;
            continue;
        }

        if (c === char && !inQuote) {
            return i;
        }
    }

    return -1;
}

/**
 * Expand path with ~ and resolve relative paths
 */
export function resolvePath(cwd: string, path: string): string {
    // Handle home directory
    if (path.startsWith('~')) {
        path = '/' + path.slice(1);
    }

    // Absolute path
    if (path.startsWith('/')) {
        return normalizePath(path);
    }

    // Relative path
    return normalizePath(cwd + '/' + path);
}

/**
 * Normalize path (handle . and ..)
 */
function normalizePath(path: string): string {
    const parts = path.split('/').filter(p => p && p !== '.');
    const result: string[] = [];

    for (const part of parts) {
        if (part === '..') {
            result.pop();
        } else {
            result.push(part);
        }
    }

    return '/' + result.join('/');
}
