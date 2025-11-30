/**
 * uniq - filter duplicate lines tests
 */

import { describe, it, expect } from 'bun:test';
import { uniq } from '@src/lib/tty/commands/uniq.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('uniq', () => {
    describe('basic operation', () => {
        it('should remove adjacent duplicates', async () => {
            const result = await runCommand(uniq, [], 'a\na\nb\nb\na\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'b', 'a']);
        });

        it('should keep non-adjacent duplicates', async () => {
            const result = await runCommand(uniq, [], 'a\nb\na\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'b', 'a']);
        });

        it('should handle single line', async () => {
            const result = await runCommand(uniq, [], 'single\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['single']);
        });

        it('should handle all duplicates', async () => {
            const result = await runCommand(uniq, [], 'same\nsame\nsame\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['same']);
        });
    });

    describe('count (-c)', () => {
        it('should show counts', async () => {
            const result = await runCommand(uniq, ['-c'], 'a\na\na\nb\nb\n');
            expect(result.exitCode).toBe(0);
            const lines = outputLines(result.stdout);
            expect(lines.length).toBe(2);
            expect(lines[0]).toMatch(/3.*a/);
            expect(lines[1]).toMatch(/2.*b/);
        });
    });

    describe('duplicates only (-d)', () => {
        it('should show only duplicated lines', async () => {
            const result = await runCommand(uniq, ['-d'], 'a\na\nb\nc\nc\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'c']);
        });

        it('should return empty for no duplicates', async () => {
            const result = await runCommand(uniq, ['-d'], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });
    });

    describe('empty input', () => {
        it('should handle empty input', async () => {
            const result = await runCommand(uniq, [], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });
    });

    describe('whitespace handling', () => {
        it('should treat lines with different whitespace as different', async () => {
            const result = await runCommand(uniq, [], 'a\n a\na \n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', ' a', 'a ']);
        });
    });
});
