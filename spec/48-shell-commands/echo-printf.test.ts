/**
 * echo and printf tests
 */

import { describe, it, expect } from 'bun:test';
import { echo } from '@src/lib/tty/commands/echo.js';
import { printf } from '@src/lib/tty/commands/printf.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('echo', () => {
    describe('basic output', () => {
        it('should echo single argument', async () => {
            const result = await runCommand(echo, ['hello']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello\n');
        });

        it('should echo multiple arguments with spaces', async () => {
            const result = await runCommand(echo, ['hello', 'world']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello world\n');
        });

        it('should echo empty string with no args', async () => {
            const result = await runCommand(echo, []);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('\n');
        });

        it('should preserve spaces in quoted args', async () => {
            const result = await runCommand(echo, ['hello   world']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello   world\n');
        });
    });

    // Note: echo does not process escape sequences or expand variables
    // Those features are handled by the shell parser before echo receives the args
    describe('literal strings', () => {
        it('should output literal backslash sequences', async () => {
            const result = await runCommand(echo, ['line1\\nline2']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('line1\\nline2\n');
        });

        it('should output literal dollar signs', async () => {
            const result = await runCommand(echo, ['$USER']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('$USER\n');
        });
    });
});

describe('printf', () => {
    describe('basic formatting', () => {
        it('should format %s', async () => {
            const result = await runCommand(printf, ['%s', 'hello']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello');
        });

        it('should format %d', async () => {
            const result = await runCommand(printf, ['%d', '42']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('42');
        });

        it('should format %f', async () => {
            const result = await runCommand(printf, ['%f', '3.14159']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toMatch(/^3\.14159/);
        });

        it('should format %%', async () => {
            const result = await runCommand(printf, ['100%%']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('100%');
        });
    });

    describe('width and precision', () => {
        it('should pad with width', async () => {
            const result = await runCommand(printf, ['%10s', 'hi']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('        hi');
        });

        it('should left-align with -', async () => {
            const result = await runCommand(printf, ['%-10s|', 'hi']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hi        |');
        });

        it('should limit precision', async () => {
            const result = await runCommand(printf, ['%.2f', '3.14159']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('3.14');
        });

        it('should zero-pad with 0', async () => {
            const result = await runCommand(printf, ['%05d', '42']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('00042');
        });
    });

    describe('multiple arguments', () => {
        it('should format multiple args', async () => {
            const result = await runCommand(printf, ['%s=%d', 'count', '42']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('count=42');
        });

        // Note: printf uses args for specifiers, not for repeating format
        it('should use multiple args for multiple specifiers', async () => {
            const result = await runCommand(printf, ['%s:%s:%s', 'a', 'b', 'c']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('a:b:c');
        });
    });

    describe('escape sequences', () => {
        it('should handle \\n', async () => {
            const result = await runCommand(printf, ['line1\\nline2']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('line1\nline2');
        });

        it('should handle \\t', async () => {
            const result = await runCommand(printf, ['a\\tb']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('a\tb');
        });
    });

    describe('integer formats', () => {
        it('should format %o (octal)', async () => {
            const result = await runCommand(printf, ['%o', '8']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('10');
        });

        it('should format %x (hex)', async () => {
            const result = await runCommand(printf, ['%x', '255']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('ff');
        });

        it('should format %X (HEX)', async () => {
            const result = await runCommand(printf, ['%X', '255']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('FF');
        });
    });

    describe('character format', () => {
        it('should format %c', async () => {
            const result = await runCommand(printf, ['%c%c%c', 'abc', 'def', 'ghi']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('adg');
        });
    });

    describe('error handling', () => {
        it('should error without format', async () => {
            const result = await runCommand(printf, []);
            expect(result.exitCode).toBe(1);
        });
    });
});
