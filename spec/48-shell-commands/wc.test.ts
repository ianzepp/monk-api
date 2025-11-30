/**
 * wc - word, line, character count tests
 */

import { describe, it, expect } from 'bun:test';
import { wc } from '@src/lib/tty/commands/wc.js';
import { runCommand } from './command-test-helper.js';

describe('wc', () => {
    describe('default output', () => {
        it('should count lines, words, and characters', async () => {
            const result = await runCommand(wc, [], 'hello world\nfoo bar baz\n');
            expect(result.exitCode).toBe(0);
            // Default shows lines, words, chars
            const parts = result.stdout.trim().split(/\s+/);
            expect(parseInt(parts[0])).toBe(2);  // lines
            expect(parseInt(parts[1])).toBe(5);  // words
            expect(parseInt(parts[2])).toBe(24); // chars (including newlines)
        });
    });

    describe('line count (-l)', () => {
        it('should count only lines', async () => {
            const result = await runCommand(wc, ['-l'], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should count empty lines', async () => {
            const result = await runCommand(wc, ['-l'], 'a\n\nb\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        // Note: wc counts the line even without trailing newline
        it('should handle no trailing newline', async () => {
            const result = await runCommand(wc, ['-l'], 'no newline');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1');
        });
    });

    describe('word count (-w)', () => {
        it('should count words', async () => {
            const result = await runCommand(wc, ['-w'], 'one two three\nfour five\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('5');
        });

        it('should handle multiple spaces', async () => {
            const result = await runCommand(wc, ['-w'], 'one   two    three\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });

        it('should handle tabs', async () => {
            const result = await runCommand(wc, ['-w'], 'one\ttwo\tthree\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('3');
        });
    });

    describe('character count (-c)', () => {
        it('should count characters', async () => {
            const result = await runCommand(wc, ['-c'], 'hello\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('6');
        });

        it('should count all characters including spaces', async () => {
            const result = await runCommand(wc, ['-c'], 'a b c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('6');
        });
    });

    describe('combined flags', () => {
        it('should combine -lw', async () => {
            const result = await runCommand(wc, ['-lw'], 'one two\nthree\n');
            expect(result.exitCode).toBe(0);
            const parts = result.stdout.trim().split(/\s+/);
            expect(parseInt(parts[0])).toBe(2);  // lines
            expect(parseInt(parts[1])).toBe(3);  // words
        });

        it('should combine -wc', async () => {
            const result = await runCommand(wc, ['-wc'], 'hello\n');
            expect(result.exitCode).toBe(0);
            const parts = result.stdout.trim().split(/\s+/);
            expect(parseInt(parts[0])).toBe(1);  // words
            expect(parseInt(parts[1])).toBe(6);  // chars
        });
    });

    describe('empty input', () => {
        it('should handle empty input', async () => {
            const result = await runCommand(wc, [], '');
            expect(result.exitCode).toBe(0);
            const parts = result.stdout.trim().split(/\s+/);
            expect(parseInt(parts[0])).toBe(0);  // 0 lines
            expect(parseInt(parts[1])).toBe(0);  // 0 words
            expect(parseInt(parts[2])).toBe(0);  // 0 chars
        });
    });
});
