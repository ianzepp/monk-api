/**
 * jq - JSON processing tests
 *
 * Note: This is a simplified jq implementation supporting:
 * - . (identity)
 * - .field (field access)
 * - .field.nested (nested field access)
 * - .[n] (array index)
 * - .[] (array iteration)
 */

import { describe, it, expect } from 'bun:test';
import { jq } from '@src/lib/tty/commands/jq.js';
import { runCommand } from './command-test-helper.js';

describe('jq', () => {
    describe('identity filter', () => {
        it('should pass through with .', async () => {
            const result = await runCommand(jq, ['.'], '{"a":1}\n');
            expect(result.exitCode).toBe(0);
            const parsed = JSON.parse(result.stdout);
            expect(parsed).toEqual({ a: 1 });
        });

        it('should format output with indentation', async () => {
            const result = await runCommand(jq, ['.'], '{"a":1,"b":2}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('\n'); // Pretty printed
        });
    });

    describe('field access', () => {
        it('should extract field with .field', async () => {
            const result = await runCommand(jq, ['.name'], '{"name":"alice","age":30}\n');
            expect(result.exitCode).toBe(0);
            // Strings are output raw (without quotes)
            expect(result.stdout.trim()).toBe('alice');
        });

        it('should extract nested field', async () => {
            const result = await runCommand(jq, ['.user.name'], '{"user":{"name":"bob"}}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('bob');
        });

        it('should return null for missing field', async () => {
            const result = await runCommand(jq, ['.missing'], '{"name":"test"}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('null');
        });

        it('should extract numeric field', async () => {
            const result = await runCommand(jq, ['.age'], '{"name":"alice","age":30}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('30');
        });

        it('should extract boolean field', async () => {
            const result = await runCommand(jq, ['.active'], '{"active":true}\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('true');
        });
    });

    describe('array access', () => {
        it('should extract array element', async () => {
            const result = await runCommand(jq, ['.[0]'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('1');
        });

        it('should extract second element', async () => {
            const result = await runCommand(jq, ['.[1]'], '[10,20,30]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('20');
        });

        it('should extract array of objects', async () => {
            const result = await runCommand(jq, ['.[0].name'], '[{"name":"alice"},{"name":"bob"}]\n');
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('alice');
        });

        it('should iterate with .[]', async () => {
            const result = await runCommand(jq, ['.[]'], '[1,2,3]\n');
            expect(result.exitCode).toBe(0);
            // Returns array as JSON
            const parsed = JSON.parse(result.stdout);
            expect(parsed).toEqual([1, 2, 3]);
        });
    });

    describe('error handling', () => {
        it('should error on missing expression', async () => {
            const result = await runCommand(jq, [], '{"a":1}\n');
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('missing');
        });

        it('should error on invalid JSON', async () => {
            const result = await runCommand(jq, ['.'], 'not json\n');
            expect(result.exitCode).toBe(1);
        });

        it('should error on expression not starting with .', async () => {
            const result = await runCommand(jq, ['name'], '{"name":"test"}\n');
            expect(result.exitCode).toBe(1);
        });
    });

    describe('multiple JSON objects', () => {
        it('should process multiple objects', async () => {
            const result = await runCommand(jq, ['.a'], '{"a":1}\n{"a":2}\n');
            expect(result.exitCode).toBe(0);
            const lines = result.stdout.trim().split('\n');
            expect(lines).toEqual(['1', '2']);
        });
    });

    describe('empty input', () => {
        it('should handle empty input', async () => {
            const result = await runCommand(jq, ['.'], '');
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('');
        });
    });
});
