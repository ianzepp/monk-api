/**
 * test / [ - conditional expression tests
 */

import { describe, it, expect } from 'bun:test';
import { test as testCmd, bracket } from '@src/lib/tty/commands/test.js';
import { runCommand } from './command-test-helper.js';

describe('test', () => {
    describe('string tests', () => {
        it('should test -n (non-empty string)', async () => {
            const result = await runCommand(testCmd, ['-n', 'hello']);
            expect(result.exitCode).toBe(0);
        });

        it('should test -n (empty string fails)', async () => {
            const result = await runCommand(testCmd, ['-n', '']);
            expect(result.exitCode).toBe(1);
        });

        it('should test -z (empty string)', async () => {
            const result = await runCommand(testCmd, ['-z', '']);
            expect(result.exitCode).toBe(0);
        });

        it('should test -z (non-empty fails)', async () => {
            const result = await runCommand(testCmd, ['-z', 'hello']);
            expect(result.exitCode).toBe(1);
        });

        it('should test string equality =', async () => {
            const result = await runCommand(testCmd, ['hello', '=', 'hello']);
            expect(result.exitCode).toBe(0);
        });

        it('should test string inequality !=', async () => {
            const result = await runCommand(testCmd, ['hello', '!=', 'world']);
            expect(result.exitCode).toBe(0);
        });

        it('should test string inequality (same strings fail)', async () => {
            const result = await runCommand(testCmd, ['hello', '!=', 'hello']);
            expect(result.exitCode).toBe(1);
        });
    });

    describe('numeric tests', () => {
        it('should test -eq (equal)', async () => {
            const result = await runCommand(testCmd, ['5', '-eq', '5']);
            expect(result.exitCode).toBe(0);
        });

        it('should test -ne (not equal)', async () => {
            const result = await runCommand(testCmd, ['5', '-ne', '3']);
            expect(result.exitCode).toBe(0);
        });

        it('should test -lt (less than)', async () => {
            const result = await runCommand(testCmd, ['3', '-lt', '5']);
            expect(result.exitCode).toBe(0);
        });

        it('should test -lt (not less than)', async () => {
            const result = await runCommand(testCmd, ['5', '-lt', '3']);
            expect(result.exitCode).toBe(1);
        });

        it('should test -le (less than or equal)', async () => {
            const result1 = await runCommand(testCmd, ['3', '-le', '5']);
            expect(result1.exitCode).toBe(0);

            const result2 = await runCommand(testCmd, ['5', '-le', '5']);
            expect(result2.exitCode).toBe(0);
        });

        it('should test -gt (greater than)', async () => {
            const result = await runCommand(testCmd, ['5', '-gt', '3']);
            expect(result.exitCode).toBe(0);
        });

        it('should test -ge (greater than or equal)', async () => {
            const result1 = await runCommand(testCmd, ['5', '-ge', '3']);
            expect(result1.exitCode).toBe(0);

            const result2 = await runCommand(testCmd, ['5', '-ge', '5']);
            expect(result2.exitCode).toBe(0);
        });
    });

    describe('logical operators', () => {
        it('should test ! (not)', async () => {
            const result = await runCommand(testCmd, ['!', '-z', 'hello']);
            expect(result.exitCode).toBe(0);
        });

        it('should test ! with comparison', async () => {
            const result = await runCommand(testCmd, ['!', 'a', '=', 'b']);
            expect(result.exitCode).toBe(0);
        });

        // Note: compound expressions with -a and -o are not supported
        // Use shell && and || instead: test -n a && test -n b
    });

    describe('no arguments', () => {
        it('should return false with no arguments', async () => {
            const result = await runCommand(testCmd, []);
            expect(result.exitCode).toBe(1);
        });
    });
});

describe('[ (bracket)', () => {
    describe('basic operation', () => {
        it('should work like test with closing ]', async () => {
            const result = await runCommand(bracket, ['-n', 'hello', ']']);
            expect(result.exitCode).toBe(0);
        });

        it('should test string equality', async () => {
            const result = await runCommand(bracket, ['a', '=', 'a', ']']);
            expect(result.exitCode).toBe(0);
        });

        it('should test numeric comparison', async () => {
            const result = await runCommand(bracket, ['5', '-gt', '3', ']']);
            expect(result.exitCode).toBe(0);
        });
    });

    // Note: missing closing bracket doesn't cause an error in this implementation
    // The ] is simply stripped if present, otherwise the test runs normally
});
