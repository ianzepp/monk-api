/**
 * seq and yes tests
 *
 * Note: seq treats arguments starting with '-' as options, so negative
 * numbers can't be used directly as first/increment arguments.
 */

import { describe, it, expect } from 'bun:test';
import { seq } from '@src/lib/tty/commands/seq.js';
import { yes } from '@src/lib/tty/commands/yes.js';
import { runCommand, outputLines, createMockSession, createMockIO } from './command-test-helper.js';

describe('seq', () => {
    describe('single argument (last)', () => {
        it('should count from 1 to N', async () => {
            const result = await runCommand(seq, ['5']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '2', '3', '4', '5']);
        });

        it('should handle 1', async () => {
            const result = await runCommand(seq, ['1']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1']);
        });

        // Note: seq outputs '\n' even for empty sequences
        it('should handle 0', async () => {
            const result = await runCommand(seq, ['0']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['']);
        });
    });

    describe('two arguments (first last)', () => {
        it('should count from first to last', async () => {
            const result = await runCommand(seq, ['3', '7']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['3', '4', '5', '6', '7']);
        });

        it('should count starting from 0', async () => {
            const result = await runCommand(seq, ['0', '4']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['0', '1', '2', '3', '4']);
        });

        // Note: outputs '\n' even when first > last (empty sequence)
        it('should handle first > last (empty)', async () => {
            const result = await runCommand(seq, ['5', '3']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['']);
        });
    });

    describe('three arguments (first increment last)', () => {
        it('should count with custom increment', async () => {
            const result = await runCommand(seq, ['1', '2', '9']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '3', '5', '7', '9']);
        });

        it('should handle decimal increment', async () => {
            const result = await runCommand(seq, ['1', '0.5', '3']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '1.5', '2', '2.5', '3']);
        });

        it('should handle increment by 10', async () => {
            const result = await runCommand(seq, ['0', '10', '50']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['0', '10', '20', '30', '40', '50']);
        });

        it('should handle increment of 5', async () => {
            const result = await runCommand(seq, ['5', '5', '25']);
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['5', '10', '15', '20', '25']);
        });
    });

    describe('separator option (-s)', () => {
        it('should use custom separator', async () => {
            const result = await runCommand(seq, ['-s', ',', '3']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('1,2,3\n');
        });

        it('should use space separator', async () => {
            const result = await runCommand(seq, ['-s', ' ', '3']);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('1 2 3\n');
        });
    });

    describe('equal width option (-w)', () => {
        it('should pad numbers with leading zeros', async () => {
            const result = await runCommand(seq, ['-w', '1', '10']);
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines[0]).toBe('01');
            expect(lines[9]).toBe('10');
        });
    });

    describe('error handling', () => {
        it('should error without arguments', async () => {
            const result = await runCommand(seq, []);
            expect(result.exitCode).toBe(1);
        });

        it('should error with non-numeric arguments', async () => {
            const result = await runCommand(seq, ['abc']);
            expect(result.exitCode).toBe(1);
        });

        it('should error with zero increment', async () => {
            const result = await runCommand(seq, ['1', '0', '5']);
            expect(result.exitCode).toBe(1);
        });
    });
});

describe('yes', () => {
    describe('basic operation', () => {
        it('should output "y" repeatedly until aborted', async () => {
            const session = createMockSession();
            const { io, getStdout } = createMockIO('');

            // Create abort controller to stop yes after a short time
            const controller = new AbortController();
            io.signal = controller.signal;

            // Start yes command
            const promise = yes(session, null, [], io);

            // Abort after letting it run briefly
            setTimeout(() => controller.abort(), 10);

            const exitCode = await promise;
            const output = getStdout();

            // Should have output some "y" lines
            expect(output).toContain('y\n');
            expect(exitCode).toBe(130); // Interrupted
        });

        it('should output custom string', async () => {
            const session = createMockSession();
            const { io, getStdout } = createMockIO('');

            const controller = new AbortController();
            io.signal = controller.signal;

            const promise = yes(session, null, ['hello'], io);

            setTimeout(() => controller.abort(), 10);

            await promise;
            const output = getStdout();

            expect(output).toContain('hello\n');
        });
    });
});
