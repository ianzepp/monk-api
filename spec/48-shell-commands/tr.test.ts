/**
 * tr - translate characters tests
 */

import { describe, it, expect } from 'bun:test';
import { tr } from '@src/lib/tty/commands/tr.js';
import { runCommand } from './command-test-helper.js';

describe('tr', () => {
    describe('basic translation', () => {
        it('should translate single characters', async () => {
            const result = await runCommand(tr, ['a', 'b'], 'aaa\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('bbb');
        });

        it('should translate multiple characters', async () => {
            const result = await runCommand(tr, ['abc', 'xyz'], 'abc\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('xyz');
        });

        it('should leave non-matching characters unchanged', async () => {
            const result = await runCommand(tr, ['a', 'b'], 'aXaYa\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('bXbYb');
        });
    });

    describe('case conversion', () => {
        it('should convert lowercase to uppercase', async () => {
            const result = await runCommand(tr, ['a-z', 'A-Z'], 'hello world\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('HELLO WORLD');
        });

        it('should convert uppercase to lowercase', async () => {
            const result = await runCommand(tr, ['A-Z', 'a-z'], 'HELLO WORLD\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello world');
        });
    });

    describe('character ranges', () => {
        it('should handle digit ranges', async () => {
            const result = await runCommand(tr, ['0-9', 'a-j'], '0123456789\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('abcdefghij');
        });

        it('should handle partial ranges', async () => {
            const result = await runCommand(tr, ['a-c', '1-3'], 'abcdef\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('123def');
        });
    });

    describe('ROT13', () => {
        it('should implement ROT13', async () => {
            const result = await runCommand(
                tr,
                ['A-Za-z', 'N-ZA-Mn-za-m'],
                'Hello World\n'
            );
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('Uryyb Jbeyq');
        });

        it('should be reversible', async () => {
            const result = await runCommand(
                tr,
                ['A-Za-z', 'N-ZA-Mn-za-m'],
                'Uryyb Jbeyq\n'
            );
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('Hello World');
        });
    });

    describe('special characters', () => {
        it('should translate spaces', async () => {
            const result = await runCommand(tr, [' ', '_'], 'hello world\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello_world');
        });

        it('should translate newlines (using escape)', async () => {
            const result = await runCommand(tr, ['\\n', ' '], 'a\nb\nc\n');
            expect(result.exitCode).toBe(0);
            // Result should have spaces instead of newlines
        });
    });

    describe('empty input', () => {
        it('should handle empty input', async () => {
            const result = await runCommand(tr, ['a', 'b'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });
    });

    describe('error handling', () => {
        it('should error without sets', async () => {
            const result = await runCommand(tr, [], 'test\n');
            expect(result.exitCode).toBe(1);
        });

        it('should error with only one set', async () => {
            const result = await runCommand(tr, ['abc'], 'test\n');
            expect(result.exitCode).toBe(1);
        });
    });
});
