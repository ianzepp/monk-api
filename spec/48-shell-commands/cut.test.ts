/**
 * cut - extract fields/columns tests
 */

import { describe, it, expect } from 'bun:test';
import { cut } from '@src/lib/tty/commands/cut.js';
import { runCommand, outputLines } from './command-test-helper.js';

describe('cut', () => {
    describe('field selection (-f)', () => {
        it('should extract single field', async () => {
            const result = await runCommand(cut, ['-d:', '-f1'], 'a:b:c\nx:y:z\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a', 'x']);
        });

        it('should extract multiple fields', async () => {
            const result = await runCommand(cut, ['-d:', '-f1,3'], 'a:b:c\nx:y:z\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a:c', 'x:z']);
        });

        it('should extract field range', async () => {
            const result = await runCommand(cut, ['-d:', '-f2-4'], 'a:b:c:d:e\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('b:c:d');
        });

        // Note: open-ended ranges (3- or -3) are not supported by this implementation
        // Use explicit ranges like 3-5 instead

        it('should handle tab as default delimiter', async () => {
            const result = await runCommand(cut, ['-f2'], 'a\tb\tc\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('b');
        });

        it('should handle missing fields', async () => {
            const result = await runCommand(cut, ['-d:', '-f5'], 'a:b:c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('');
        });

        it('should handle comma delimiter', async () => {
            const result = await runCommand(cut, ['-d,', '-f2'], 'a,b,c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('b');
        });

        it('should extract last field', async () => {
            const result = await runCommand(cut, ['-d:', '-f3'], 'one:two:three\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('three');
        });
    });

    describe('character selection (-c)', () => {
        it('should extract single character', async () => {
            const result = await runCommand(cut, ['-c1'], 'hello\nworld\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['h', 'w']);
        });

        it('should extract character range', async () => {
            const result = await runCommand(cut, ['-c2-4'], 'hello\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('ell');
        });

        it('should extract multiple characters', async () => {
            const result = await runCommand(cut, ['-c1,3,5'], 'hello\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hlo');
        });

        // Note: open-ended ranges (-3 or 3-) not supported by this implementation
    });

    describe('combined options', () => {
        it('should process multiple lines', async () => {
            const result = await runCommand(cut, ['-d:', '-f1,2'], 'a:b:c\n1:2:3\nx:y:z\n');
            expect(result.exitCode).toBe(0);
            expect(outputLines(result.stdout)).toEqual(['a:b', '1:2', 'x:y']);
        });

        it('should handle empty fields', async () => {
            const result = await runCommand(cut, ['-d:', '-f2'], 'a::c\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('');
        });
    });

    describe('error handling', () => {
        it('should error without field or character specification', async () => {
            const result = await runCommand(cut, [], 'test\n');
            expect(result.exitCode).toBe(1);
        });
    });
});
