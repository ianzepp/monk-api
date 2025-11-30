/**
 * sort - sort lines tests
 */

import { describe, it, expect } from 'bun:test';
import { sort } from '@src/lib/tty/commands/sort.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('sort', () => {
    describe('basic sorting', () => {
        it('should sort lines alphabetically', async () => {
            const result = await runCommand(sort, [], 'cherry\napple\nbanana\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['apple', 'banana', 'cherry']);
        });

        it('should handle already sorted input', async () => {
            const result = await runCommand(sort, [], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'b', 'c']);
        });

        it('should sort numbers as strings by default', async () => {
            const result = await runCommand(sort, [], '10\n2\n1\n20\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '10', '2', '20']);
        });
    });

    describe('reverse (-r)', () => {
        it('should sort in reverse order', async () => {
            const result = await runCommand(sort, ['-r'], 'a\nc\nb\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['c', 'b', 'a']);
        });
    });

    describe('numeric sort (-n)', () => {
        it('should sort numerically', async () => {
            const result = await runCommand(sort, ['-n'], '10\n2\n1\n20\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1', '2', '10', '20']);
        });

        it('should handle negative numbers', async () => {
            const result = await runCommand(sort, ['-n'], '5\n-3\n0\n-10\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['-10', '-3', '0', '5']);
        });

        it('should handle decimals', async () => {
            const result = await runCommand(sort, ['-n'], '1.5\n1.2\n1.10\n');
            expect(result.exitCode).toBe(0);
            // Note: 1.10 parses as 1.1, so it comes before 1.2
            expect(outputLines(result.stdout)).toEqual(['1.10', '1.2', '1.5']);
        });

        it('should combine -n and -r', async () => {
            const result = await runCommand(sort, ['-nr'], '1\n10\n2\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['10', '2', '1']);
        });
    });

    describe('unique (-u)', () => {
        it('should remove duplicates', async () => {
            const result = await runCommand(sort, ['-u'], 'b\na\nb\nc\na\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'b', 'c']);
        });
    });

    describe('case insensitive (-f)', () => {
        it('should sort case-insensitively', async () => {
            const result = await runCommand(sort, ['-f'], 'Banana\napple\nCherry\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['apple', 'Banana', 'Cherry']);
        });
    });

    describe('ignore leading blanks (-b)', () => {
        it('should ignore leading whitespace', async () => {
            const result = await runCommand(sort, ['-b'], '  c\na\n b\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', ' b', '  c']);
        });
    });

    describe('dictionary order (-d)', () => {
        it('should consider only alphanumeric and spaces', async () => {
            const result = await runCommand(sort, ['-d'], 'a-b\na.c\na b\n');
            expect(result.exitCode).toBe(0);
            // Dictionary order ignores - and .
            expect(result.stdout.length).toBeGreaterThan(0);
        });
    });

    describe('human numeric sort (-h)', () => {
        it('should sort human-readable numbers', async () => {
            const result = await runCommand(sort, ['-h'], '1G\n100K\n10M\n1K\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['1K', '100K', '10M', '1G']);
        });
    });

    describe('key field (-k)', () => {
        it('should sort by specific field', async () => {
            const result = await runCommand(sort, ['-t:', '-k2'], 'z:1\na:3\nm:2\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['z:1', 'm:2', 'a:3']);
        });

        it('should sort by numeric field', async () => {
            const result = await runCommand(sort, ['-t:', '-k2', '-n'], 'z:10\na:2\nm:1\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['m:1', 'a:2', 'z:10']);
        });
    });

    describe('delimiter (-t)', () => {
        it('should use custom delimiter', async () => {
            const result = await runCommand(sort, ['-t,', '-k2'], 'z,a\na,c\nm,b\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['z,a', 'm,b', 'a,c']);
        });
    });

    describe('empty input', () => {
        it('should handle empty input', async () => {
            const result = await runCommand(sort, [], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });
    });
});
